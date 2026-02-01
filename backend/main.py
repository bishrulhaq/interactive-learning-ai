from fastapi import FastAPI, Depends, UploadFile, File, Query, HTTPException
from typing import List, Optional
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
import logging

logger = logging.getLogger(__name__)

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


@app.get("/settings/runtime")
def get_settings_runtime():
    """
    Runtime diagnostics to help the UI explain performance options (CPU vs GPU).
    No DB changes required.
    """
    info = {"torch": None, "device": "cpu", "cuda_available": False}
    try:
        import torch

        info["torch"] = getattr(torch, "__version__", None)
        info["cuda_available"] = bool(torch.cuda.is_available())
        info["device"] = "cuda" if info["cuda_available"] else "cpu"
        if info["cuda_available"]:
            try:
                info["cuda_device_name"] = torch.cuda.get_device_name(0)
            except Exception:
                info["cuda_device_name"] = None
    except Exception:
        pass
    return info


@app.post("/settings", response_model=AppSettings)
def save_settings(request: AppSettingsUpdate, db: Session = Depends(get_db)):
    return update_app_settings(
        db,
        llm_provider=request.llm_provider,
        openai_api_key=request.openai_api_key,
        openai_model=request.openai_model,
        embedding_provider=request.embedding_provider,
        embedding_model=request.embedding_model,
        ollama_base_url=request.ollama_base_url,
    )


@app.get("/stats")
def get_global_stats(db: Session = Depends(get_db)):
    doc_count = db.query(func.count(Document.id)).scalar()
    quiz_count = db.query(func.count(GeneratedQuiz.id)).scalar()
    return {"documents": doc_count or 0, "quizzes": quiz_count or 0}


class DownloadRequest(BaseModel):
    provider: str
    model_name: str
    ollama_base_url: Optional[str] = None


@app.post("/settings/download-model")
async def download_model(request: DownloadRequest):
    from backend.services.downloader import stream_ollama_download, stream_hf_download

    if request.provider == "ollama":
        if not request.ollama_base_url:
            raise HTTPException(status_code=400, detail="Ollama base URL is required")
        return StreamingResponse(
            stream_ollama_download(request.model_name, request.ollama_base_url),
            media_type="text/event-stream",
        )
    elif request.provider == "huggingface":
        return StreamingResponse(
            stream_hf_download(request.model_name), media_type="text/event-stream"
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported provider for download")


def validate_workspace_content(workspace_id: int, db: Session):
    """
    Ensures the workspace has at least one 'completed' document AND that the embeddings
    in that workspace match the currently configured embedding provider/model.
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

    # Embedding compatibility guard:
    # If documents were embedded with a different model/provider than the current settings,
    # retrieval becomes invalid (vectors are not comparable across models).
    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    app_settings = get_app_settings(db)
    expected_provider = ws.embedding_provider or app_settings.embedding_provider
    expected_model = ws.embedding_model or app_settings.embedding_model

    mismatched = (
        db.query(Document)
        .filter(
            Document.workspace_id == workspace_id,
            Document.status == "completed",
            (
                (
                    Document.embedding_provider.isnot(None)
                    & (Document.embedding_provider != expected_provider)
                )  # type: ignore[operator]
                | (
                    Document.embedding_model.isnot(None)
                    & (Document.embedding_model != expected_model)
                )  # type: ignore[operator]
            ),
        )
        .limit(3)
        .all()
    )

    if mismatched:
        names = ", ".join([d.title for d in mismatched])
        raise HTTPException(
            status_code=400,
            detail=(
                "Embedding settings changed since these documents were processed. "
                "Please re-process the documents (refresh icon) so chat and generation work correctly. "
                f"Mismatched example(s): {names}"
            ),
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

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Guard: Ensure AI providers are properly configured
    app_settings = get_app_settings(db)

    # Check LLM and Embedding requirements (prioritizing workspace overrides)
    llm_p = ws.llm_provider or app_settings.llm_provider
    emb_p = ws.embedding_provider or app_settings.embedding_provider
    emb_model = ws.embedding_model or app_settings.embedding_model
    ollama_url = ws.ollama_base_url or app_settings.ollama_base_url

    # Provider sanity checks
    if llm_p not in ("openai", "ollama"):
        raise HTTPException(
            status_code=400, detail=f"Unsupported LLM provider: {llm_p}"
        )
    if emb_p not in ("openai", "huggingface"):
        raise HTTPException(
            status_code=400, detail=f"Unsupported embedding provider: {emb_p}"
        )

    needs_openai_key = llm_p == "openai" or emb_p == "openai"

    if needs_openai_key and not app_settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key is missing. Please add your key in Settings or switch to local providers (Ollama/Hugging Face).",
        )

    # Images require OpenAI Vision (separate from chat LLM). Fail fast with a clear reason.
    lowered = file.filename.lower()
    if (
        lowered.endswith((".jpg", ".jpeg", ".png", ".webp"))
        and not app_settings.openai_api_key
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Image uploads require OpenAI Vision, but your OpenAI API key is missing. "
                "Add your key in Settings or upload a PDF/Word/PPT instead."
            ),
        )

    if llm_p == "ollama" and not ollama_url:
        raise HTTPException(
            status_code=400,
            detail="Ollama base URL is required when LLM provider is Ollama. Please set it in Settings.",
        )

    # Validate embedding model compatibility with our pgvector schema.
    if emb_p == "openai":
        from backend.services.embeddings import (
            SUPPORTED_DIMS,
            resolve_openai_embedding_dim,
        )

        dim = resolve_openai_embedding_dim(emb_model or "text-embedding-3-small")
        if dim not in SUPPORTED_DIMS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"OpenAI embedding model '{emb_model}' has {dim} dimensions which is not supported. "
                    f"Supported dimensions are: {', '.join(map(str, SUPPORTED_DIMS))}."
                ),
            )
    else:
        if not emb_model:
            raise HTTPException(
                status_code=400,
                detail="Embedding model is required when embedding provider is Hugging Face.",
            )

    try:
        return await ingest_file(file, id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Upload failed")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ======================================================
# DOCUMENTS
# ======================================================


@app.delete("/documents/{id}")
def delete_document(id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Clean up file
    try:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except Exception as e:
        logger.error(f"Failed to delete file {doc.file_path}: {e}")

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted"}


@app.post("/documents/{id}/reprocess")
def reprocess_document(id: int, db: Session = Depends(get_db)):
    doc = db.get(Document, id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # 1. Delete existing chunks
    from backend.models import DocumentChunk

    db.query(DocumentChunk).filter(DocumentChunk.document_id == id).delete()

    # 2. Reset status
    doc.status = "pending"
    doc.error_message = None
    db.commit()

    # 3. Trigger task
    from backend.tasks import process_document_task

    process_document_task.delay(id)

    return {"message": "Re-processing started"}


# ======================================================
# CHAT
# ======================================================


class ChatRequest(BaseModel):
    message: str
    workspace_id: int


@app.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    try:
        validate_workspace_content(request.workspace_id, db)
        # 1. Get Answer using workspace context
        answer = chat_with_docs(request.message, request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Chat failed")
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        validate_workspace_content(request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Check if exists
    stmt = select(GeneratedLesson).filter(
        GeneratedLesson.workspace_id == request.workspace_id,
        GeneratedLesson.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.content

    # Generate
    try:
        plan = generate_lesson_plan(request.topic, request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # If Ollama crashes (often OOM / model runner), surface a helpful message.
        msg = str(e)
        if "ollama" in msg.lower() or "runner process has terminated" in msg.lower():
            raise HTTPException(
                status_code=502,
                detail=(
                    "Ollama failed while generating the lesson. This is usually due to a missing model, "
                    "a wrong model name, or insufficient RAM/VRAM for the selected model.\n"
                    "Fix: in Settings choose a smaller model (e.g. llama3.2:3b), download/pull it, "
                    "and ensure Ollama is running.\n"
                    f"Underlying error: {msg}"
                ),
            )
    except Exception as e:
        logger.exception("Lesson generation failed")
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        validate_workspace_content(request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Check if exists
    stmt = select(GeneratedFlashcard).filter(
        GeneratedFlashcard.workspace_id == request.workspace_id,
        GeneratedFlashcard.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.flashcards

    # Generate
    try:
        cards = generate_flashcards(request.topic, request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Flashcards generation failed")
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        validate_workspace_content(request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Check if exists
    stmt = select(GeneratedQuiz).filter(
        GeneratedQuiz.workspace_id == request.workspace_id,
        GeneratedQuiz.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.quiz_content

    # Generate
    try:
        quiz = generate_quiz(request.topic, request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Quiz generation failed")
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        validate_workspace_content(request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Check if exists
    stmt = select(GeneratedMindMap).filter(
        GeneratedMindMap.workspace_id == request.workspace_id,
        GeneratedMindMap.topic == request.topic,
    )
    existing = db.scalars(stmt).first()
    if existing:
        return existing.mindmap_content

    # Generate
    try:
        mind_map = generate_mind_map(request.topic, request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Mindmap generation failed")
        raise HTTPException(status_code=500, detail=str(e))

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
    try:
        validate_workspace_content(request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    try:
        podcast_data = generate_podcast_script(
            request.topic, request.workspace_id, db, podcast_type=type
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Podcast generation failed")
        raise HTTPException(status_code=500, detail=str(e))

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
