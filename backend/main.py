from fastapi import FastAPI, Depends, UploadFile, File, Query, HTTPException
from typing import List
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from backend.core.config import settings
from backend.database import get_db, engine, Base
from backend.models import (
    Workspace,
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
from backend.services.ingestion import ingest_file
from backend.services.rag import chat_with_docs
from backend.services.generator import (
    generate_lesson_plan,
    generate_flashcards,
    generate_quiz,
    generate_mind_map,
)
from backend.services.narration import generate_speech
from backend.services.podcast import generate_podcast_script, synthesize_podcast_audio
from backend.schemas import (
    LessonPlan,
    FlashcardSet,
    Quiz,
    MindMap,
    Podcast,
    WorkspaceCreate,
    WorkspaceOut,
    WorkspaceDetailOut,
    AppSettings,
    AppSettingsUpdate,
)
from backend.services.settings import get_app_settings, update_app_settings
from pydantic import BaseModel
import os

# Create tables on startup (dev only)
Base.metadata.create_all(bind=engine)


app = FastAPI(title=settings.PROJECT_NAME, version=settings.PROJECT_VERSION)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount storage directory to serve documents
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


# ======================================================
# WORKSPACES
# ======================================================


@app.post("/workspaces", response_model=WorkspaceOut)
def create_workspace(request: WorkspaceCreate, db: Session = Depends(get_db)):
    db_ws = Workspace(name=request.name)
    db.add(db_ws)
    db.commit()
    db.refresh(db_ws)
    return db_ws


@app.get("/workspaces", response_model=List[WorkspaceOut])
def list_workspaces(db: Session = Depends(get_db)):
    stmt = select(Workspace).order_by(desc(Workspace.created_at))
    return db.scalars(stmt).all()


@app.get("/workspaces/{id}", response_model=WorkspaceDetailOut)
def get_workspace(id: int, db: Session = Depends(get_db)):
    ws = db.get(Workspace, id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws


# ======================================================
# SETTINGS
# ======================================================


@app.get("/settings", response_model=AppSettings)
def get_settings(db: Session = Depends(get_db)):
    return get_app_settings(db)


@app.post("/settings", response_model=AppSettings)
def save_settings(request: AppSettingsUpdate, db: Session = Depends(get_db)):
    return update_app_settings(
        db,
        llm_provider=request.llm_provider,
        openai_api_key=request.openai_api_key,
        openai_model=request.openai_model,
        embedding_provider=request.embedding_provider,
        embedding_model=request.embedding_model,
    )


@app.get("/stats")
def get_global_stats(db: Session = Depends(get_db)):
    doc_count = db.query(func.count(Document.id)).scalar()
    quiz_count = db.query(func.count(GeneratedQuiz.id)).scalar()
    return {"documents": doc_count or 0, "quizzes": quiz_count or 0}


def validate_workspace_content(workspace_id: int, db: Session):
    """
    Ensures the workspace has at least one 'completed' document.
    """
    total_docs = (
        db.query(func.count(Document.id))
        .filter(Document.workspace_id == workspace_id)
        .scalar()
    )

    if total_docs == 0:
        raise HTTPException(
            status_code=400,
            detail="This workspace is empty. Please upload some documents first.",
        )

    completed_docs = (
        db.query(func.count(Document.id))
        .filter(Document.workspace_id == workspace_id, Document.status == "completed")
        .scalar()
    )

    if completed_docs == 0:
        raise HTTPException(
            status_code=400,
            detail="Documents are still being processed. Please wait a moment.",
        )


# ======================================================
# UPLOAD
# ======================================================


@app.post("/workspaces/{id}/upload")
async def upload_document(
    id: int, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    # Verify workspace exists
    ws = db.get(Workspace, id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    return await ingest_file(file, id, db)


# ======================================================
# CHAT
# ======================================================


class ChatRequest(BaseModel):
    message: str
    workspace_id: int


@app.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    validate_workspace_content(request.workspace_id, db)
    # 1. Get Answer using workspace context
    answer = chat_with_docs(request.message, request.workspace_id, db)

    # 2. Save Messages to Workspace
    user_msg = Message(
        workspace_id=request.workspace_id, role="user", content=request.message
    )
    db.add(user_msg)

    ai_msg = Message(
        workspace_id=request.workspace_id, role="assistant", content=answer
    )
    db.add(ai_msg)

    db.commit()

    return {"answer": answer}


@app.get("/chat/history/{workspace_id}")
def get_chat_history(workspace_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(Message)
        .filter(Message.workspace_id == workspace_id)
        .order_by(Message.created_at)
    )
    messages = db.scalars(stmt).all()
    return messages


# ======================================================
# GENERATION (Topic-based across workspace)
# ======================================================


class GenerateRequest(BaseModel):
    topic: str
    workspace_id: int


@app.post("/generate/lesson", response_model=LessonPlan)
def api_generate_lesson(request: GenerateRequest, db: Session = Depends(get_db)):
    validate_workspace_content(request.workspace_id, db)
    # Check if exists
    stmt = select(GeneratedLesson).filter(
        GeneratedLesson.workspace_id == request.workspace_id,
        GeneratedLesson.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.content

    # Generate
    plan = generate_lesson_plan(request.topic, request.workspace_id, db)

    # Save
    db_lesson = GeneratedLesson(
        workspace_id=request.workspace_id,
        topic=request.topic,
        content=plan.model_dump(),
    )
    db.add(db_lesson)
    db.commit()

    return plan


@app.post("/generate/flashcards", response_model=FlashcardSet)
def api_generate_flashcards(request: GenerateRequest, db: Session = Depends(get_db)):
    validate_workspace_content(request.workspace_id, db)
    # Check if exists
    stmt = select(GeneratedFlashcard).filter(
        GeneratedFlashcard.workspace_id == request.workspace_id,
        GeneratedFlashcard.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.flashcards

    # Generate
    cards = generate_flashcards(request.topic, request.workspace_id, db)

    # Save
    db_cards = GeneratedFlashcard(
        workspace_id=request.workspace_id,
        topic=request.topic,
        flashcards=cards.model_dump(),
    )
    db.add(db_cards)
    db.commit()

    return cards


@app.post("/generate/quiz", response_model=Quiz)
def api_generate_quiz(request: GenerateRequest, db: Session = Depends(get_db)):
    validate_workspace_content(request.workspace_id, db)
    # Check if exists
    stmt = select(GeneratedQuiz).filter(
        GeneratedQuiz.workspace_id == request.workspace_id,
        GeneratedQuiz.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.quiz_content

    # Generate
    quiz = generate_quiz(request.topic, request.workspace_id, db)

    # Save
    db_quiz = GeneratedQuiz(
        workspace_id=request.workspace_id,
        topic=request.topic,
        quiz_content=quiz.model_dump(),
    )
    db.add(db_quiz)
    db.commit()

    return quiz


@app.post("/generate/mindmap", response_model=MindMap)
def api_generate_mindmap(request: GenerateRequest, db: Session = Depends(get_db)):
    validate_workspace_content(request.workspace_id, db)
    # Check if exists
    stmt = select(GeneratedMindMap).filter(
        GeneratedMindMap.workspace_id == request.workspace_id,
        GeneratedMindMap.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.mindmap_content

    # Generate
    mind_map = generate_mind_map(request.topic, request.workspace_id, db)

    # Save
    db_mindmap = GeneratedMindMap(
        workspace_id=request.workspace_id,
        topic=request.topic,
        mindmap_content=mind_map.model_dump(),
    )
    db.add(db_mindmap)
    db.commit()

    return mind_map


@app.post("/generate/podcast", response_model=Podcast)
def api_generate_podcast(
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    type: str = "duo",
    db: Session = Depends(get_db),
):
    validate_workspace_content(request.workspace_id, db)
    # check if exists
    stmt = select(GeneratedPodcast).filter(
        GeneratedPodcast.workspace_id == request.workspace_id,
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
        request.topic, request.workspace_id, db, podcast_type=type
    )

    # Pre-save without audio path
    db_podcast = GeneratedPodcast(
        workspace_id=request.workspace_id,
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


@app.get("/generate/narration")
def api_generate_narration(
    text: str = Query(..., description="The text to narrate"),
    voice: str = Query("af_bella", description="The voice to use"),
):
    try:
        audio_stream = generate_speech(text, voice=voice)
        return StreamingResponse(audio_stream, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/generate/existing")
def get_existing_content(workspace_id: int, topic: str, db: Session = Depends(get_db)):
    lesson = db.scalar(
        select(GeneratedLesson).filter(
            GeneratedLesson.workspace_id == workspace_id, GeneratedLesson.topic == topic
        )
    )
    flashcards = db.scalar(
        select(GeneratedFlashcard).filter(
            GeneratedFlashcard.workspace_id == workspace_id,
            GeneratedFlashcard.topic == topic,
        )
    )
    quiz = db.scalar(
        select(GeneratedQuiz).filter(
            GeneratedQuiz.workspace_id == workspace_id, GeneratedQuiz.topic == topic
        )
    )
    mindmap = db.scalar(
        select(GeneratedMindMap).filter(
            GeneratedMindMap.workspace_id == workspace_id,
            GeneratedMindMap.topic == topic,
        )
    )
    podcast = db.scalar(
        select(GeneratedPodcast).filter(
            GeneratedPodcast.workspace_id == workspace_id,
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
