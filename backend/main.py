from fastapi import FastAPI, Depends, UploadFile, File, Query, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from backend.core.config import settings
from backend.database import get_db, engine, Base
from backend.models import (
    Document,
    Message,
    GeneratedLesson,
    GeneratedFlashcard,
    GeneratedQuiz,
    GeneratedMindMap,
    GeneratedPodcast,
)
from sqlalchemy import select, desc, func
from fastapi import BackgroundTasks
from backend.services.ingestion import process_pdf
from backend.services.rag import chat_with_docs
from backend.services.generator import (
    generate_lesson_plan,
    generate_flashcards,
    generate_quiz,
    generate_mind_map,
)
from backend.services.narration import generate_speech
from backend.services.podcast import generate_podcast_script, synthesize_podcast_audio
from backend.schemas import LessonPlan, FlashcardSet, Quiz, MindMap, Podcast
from pydantic import BaseModel
import os

# Create tables on startup (dev only)
Base.metadata.create_all(bind=engine)


app = FastAPI(title=settings.PROJECT_NAME, version=settings.PROJECT_VERSION)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: specific origins for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount storage directory to serve PDFs
app.mount("/files", StaticFiles(directory="storage/documents"), name="files")

# Mount audio storage directory
os.makedirs("storage/audio/podcasts", exist_ok=True)
app.mount("/audio", StaticFiles(directory="storage/audio"), name="audio")


@app.get("/")
def root():
    return {
        "message": "Welcome to RAG Education API",
        "version": settings.PROJECT_VERSION,
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    return await process_pdf(file, db)


@app.get("/documents")
def get_documents(db: Session = Depends(get_db)):
    # Returns recent documents
    stm = select(Document).order_by(desc(Document.created_at)).limit(10)
    docs = db.scalars(stm).all()
    docs = db.scalars(stm).all()
    return docs


@app.get("/documents/{id}")
def get_document(id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    doc_count = db.scalar(select(func.count(Document.id)))
    quiz_count = db.scalar(select(func.count(GeneratedQuiz.id)))
    return {"documents": doc_count, "quizzes": quiz_count}


class ChatRequest(BaseModel):
    message: str
    document_id: int


@app.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    # 1. Get Answer
    answer = chat_with_docs(request.message, request.document_id, db)

    # 2. Save User Message
    user_msg = Message(
        document_id=request.document_id, role="user", content=request.message
    )
    db.add(user_msg)

    # 3. Save AI Message
    ai_msg = Message(document_id=request.document_id, role="assistant", content=answer)
    db.add(ai_msg)

    db.commit()

    return {"answer": answer}


@app.get("/chat/history/{document_id}")
def get_chat_history(document_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(Message)
        .filter(Message.document_id == document_id)
        .order_by(Message.created_at)
    )
    messages = db.scalars(stmt).all()
    return messages


class GenerateRequest(BaseModel):
    topic: str
    document_id: int


@app.post("/generate/lesson", response_model=LessonPlan)
def api_generate_lesson(request: GenerateRequest, db: Session = Depends(get_db)):
    # Check if exists
    stmt = select(GeneratedLesson).filter(
        GeneratedLesson.document_id == request.document_id,
        GeneratedLesson.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.content

    # Generate
    plan = generate_lesson_plan(request.topic, request.document_id, db)

    # Save
    db_lesson = GeneratedLesson(
        document_id=request.document_id, topic=request.topic, content=plan.model_dump()
    )
    db.add(db_lesson)
    db.commit()

    return plan


@app.post("/generate/flashcards", response_model=FlashcardSet)
def api_generate_flashcards(request: GenerateRequest, db: Session = Depends(get_db)):
    # Check if exists
    stmt = select(GeneratedFlashcard).filter(
        GeneratedFlashcard.document_id == request.document_id,
        GeneratedFlashcard.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.flashcards

    # Generate
    cards = generate_flashcards(request.topic, request.document_id, db)

    # Save
    db_cards = GeneratedFlashcard(
        document_id=request.document_id,
        topic=request.topic,
        flashcards=cards.model_dump(),
    )
    db.add(db_cards)
    db.commit()

    return cards


@app.post("/generate/quiz", response_model=Quiz)
def api_generate_quiz(request: GenerateRequest, db: Session = Depends(get_db)):
    # Check if exists
    stmt = select(GeneratedQuiz).filter(
        GeneratedQuiz.document_id == request.document_id,
        GeneratedQuiz.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.quiz_content

    # Generate
    quiz = generate_quiz(request.topic, request.document_id, db)

    # Save
    db_quiz = GeneratedQuiz(
        document_id=request.document_id,
        topic=request.topic,
        quiz_content=quiz.model_dump(),
    )
    db.add(db_quiz)
    db.commit()

    return quiz


@app.post("/generate/mindmap", response_model=MindMap)
def api_generate_mindmap(request: GenerateRequest, db: Session = Depends(get_db)):
    # Check if exists
    stmt = select(GeneratedMindMap).filter(
        GeneratedMindMap.document_id == request.document_id,
        GeneratedMindMap.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.mindmap_content

    # Generate
    mind_map = generate_mind_map(request.topic, request.document_id, db)

    # Save
    db_mindmap = GeneratedMindMap(
        document_id=request.document_id,
        topic=request.topic,
        mindmap_content=mind_map.model_dump(),
    )
    db.add(db_mindmap)
    db.commit()

    return mind_map


@app.get("/generate/narration")
def api_generate_narration(
    text: str = Query(..., description="The text to narrate"),
    voice: str = Query("af_bella", description="The voice to use"),
):
    try:
        audio_stream = generate_speech(text, voice=voice)
        return StreamingResponse(audio_stream, media_type="audio/wav")
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/podcast", response_model=Podcast)
def api_generate_podcast(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    type: str = "duo",
    db: Session = Depends(get_db),
):
    # check if exists
    stmt = select(GeneratedPodcast).filter(
        GeneratedPodcast.document_id == request.document_id,
        GeneratedPodcast.topic == request.topic,
        GeneratedPodcast.podcast_type == type,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return Podcast(
            topic=existing.topic,
            script=existing.script,
            audio_path=existing.audio_path,
        )

    # Generate Script
    podcast_data = generate_podcast_script(
        request.topic, request.document_id, db, podcast_type=type
    )

    # Pre-save without audio path
    db_podcast = GeneratedPodcast(
        document_id=request.document_id,
        topic=request.topic,
        script=[item.model_dump() for item in podcast_data.script],
        audio_path="",  # Will be filled by background task
        podcast_type=type,
    )
    db.add(db_podcast)
    db.commit()
    db.refresh(db_podcast)

    # Start audio synthesis in background
    def synthesize_and_update(podcast_obj: Podcast, db_podcast_id: int):
        # We need a new session for background tasks usually, but let's keep it simple for now
        # Actually better to create a new session
        from backend.database import SessionLocal

        with SessionLocal() as bg_db:
            audio_rel_path = synthesize_podcast_audio(podcast_obj)
            bg_stmt = select(GeneratedPodcast).filter(
                GeneratedPodcast.id == db_podcast_id
            )
            bg_existing = bg_db.scalars(bg_stmt).first()
            if bg_existing:
                bg_existing.audio_path = audio_rel_path  # type: ignore[assignment]
                bg_db.commit()

    background_tasks.add_task(synthesize_and_update, podcast_data, db_podcast.id)

    return podcast_data


@app.get("/generate/existing")
def get_existing_content(document_id: int, topic: str, db: Session = Depends(get_db)):
    lesson = db.scalar(
        select(GeneratedLesson).filter(
            GeneratedLesson.document_id == document_id, GeneratedLesson.topic == topic
        )
    )
    flashcards = db.scalar(
        select(GeneratedFlashcard).filter(
            GeneratedFlashcard.document_id == document_id,
            GeneratedFlashcard.topic == topic,
        )
    )
    quiz = db.scalar(
        select(GeneratedQuiz).filter(
            GeneratedQuiz.document_id == document_id, GeneratedQuiz.topic == topic
        )
    )
    mindmap = db.scalar(
        select(GeneratedMindMap).filter(
            GeneratedMindMap.document_id == document_id, GeneratedMindMap.topic == topic
        )
    )

    podcast = db.scalar(
        select(GeneratedPodcast).filter(
            GeneratedPodcast.document_id == document_id,
            GeneratedPodcast.topic == topic,
        )
    )

    return {
        "lesson": lesson.content if lesson else None,
        "flashcards": flashcards.flashcards if flashcards else None,
        "quiz": quiz.quiz_content if quiz else None,
        "mindmap": mindmap.mindmap_content if mindmap else None,
        "podcast": (
            {
                "topic": podcast.topic,
                "script": podcast.script,
                "audio_path": podcast.audio_path,
            }
            if podcast
            else None
        ),
    }
