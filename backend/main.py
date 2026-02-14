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
from backend.services.narration import get_kokoro
from backend.services.podcast import generate_podcast_script, synthesize_podcast_audio

#
# Song generation/voice-conversion features were removed.
#
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
    GenerateRequest,
)
from backend.services.settings import get_app_settings, update_app_settings
from pydantic import BaseModel
import os
import uuid
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

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
        enable_vision_processing=request.enable_vision_processing,
        vision_provider=request.vision_provider,
        ollama_vision_model=request.ollama_vision_model,
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


@app.post("/generate/lesson/speech", response_model=LessonPlan)
def api_generate_lesson_speech(
    request: GenerateRequest,
    voice: str = "af_bella",
    db: Session = Depends(get_db),
):
    stmt = select(GeneratedLesson).filter(
        GeneratedLesson.workspace_id == request.workspace_id,
        GeneratedLesson.topic == request.topic,
    )
    lesson = db.scalars(stmt).first()

    # Debug: show all lessons for this workspace
    all_lessons = db.scalars(
        select(GeneratedLesson).filter(
            GeneratedLesson.workspace_id == request.workspace_id
        )
    ).all()
    logger.info(
        f"All lessons for workspace {request.workspace_id}: {[(les.id, les.topic) for les in all_lessons]}"
    )

    if not lesson:
        logger.error(
            f"Lesson not found for workspace_id={request.workspace_id}, topic='{request.topic}'"
        )
        raise HTTPException(
            status_code=404,
            detail=f"Lesson not found for workspace {request.workspace_id} and topic '{request.topic}'. Please generate a lesson first.",
        )

    # If audio already exists, return current lesson plan with audio_path
    if lesson.audio_path:
        # Check if file actually exists
        full_path = os.path.join("storage", "audio", lesson.audio_path)
        if os.path.exists(full_path):
            try:
                plan = LessonPlan(**lesson.content)
                plan.audio_path = lesson.audio_path
                return plan
            except Exception:
                pass  # validation failed, regenerate

    # Construct text
    sections = lesson.content.get("sections", [])
    text_parts = []
    for s in sections:
        title = s.get("title", "")
        content = s.get("content", "")
        text_parts.append(f"{title}. {content}")

    summary_text = " ".join(text_parts)

    try:
        audio_stream = generate_speech(summary_text, voice=voice)

        # Save to file
        filename = f"lesson_{uuid.uuid4()}.wav"
        rel_dir = "lessons"
        full_dir = os.path.join("storage", "audio", rel_dir)
        os.makedirs(full_dir, exist_ok=True)

        file_path = os.path.join(full_dir, filename)

        with open(file_path, "wb") as f:
            f.write(audio_stream.getbuffer())

        # Update DB
        # Store relative path like "lessons/abc.wav"
        rel_path = os.path.join(rel_dir, filename).replace("\\", "/")
        lesson.audio_path = rel_path
        db.commit()

        # Update return object
        plan = LessonPlan(**lesson.content)
        plan.audio_path = rel_path
        return plan

    except Exception as e:
        logger.exception("Lesson speech generation failed")
        raise HTTPException(status_code=500, detail=str(e))


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


# GenerateRequest is imported from backend.schemas


class GeneratePodcastRequest(GenerateRequest):
    # Optional voice overrides (Kokoro voice IDs)
    voice_a: Optional[str] = None  # 1st speaker (duo)
    voice_b: Optional[str] = None  # 2nd speaker (duo)
    voice: Optional[str] = None  # narrator (single)


@app.get("/tts/voices")
def list_tts_voices():
    """
    List available Kokoro voices (for narration/podcast).
    Returns voice IDs along with display names and gender.
    """
    try:
        from backend.data.voices import get_all_voices_with_info

        kokoro = get_kokoro()
        voice_ids = kokoro.get_voices()
        voices_with_info = get_all_voices_with_info(voice_ids)
        return {"voices": voice_ids, "voices_info": voices_with_info}
    except Exception as e:
        # Keep it non-fatal for the UI.
        return {"voices": [], "voices_info": [], "error": str(e)}


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
    db.refresh(db_lesson)
    logger.info(
        f"Saved lesson to DB: workspace_id={request.workspace_id}, topic='{request.topic}', id={db_lesson.id}"
    )

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
    request: GeneratePodcastRequest,
    background_tasks: BackgroundTasks,
    type: str = "duo",
    db: Session = Depends(get_db),
):
    MAX_VERSIONS = 3

    try:
        validate_workspace_content(request.workspace_id, db)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Normalize voice pair for duplicate detection (sorted to treat A+B same as B+A)
    def normalize_voice_pair(v1: str, v2: str) -> str:
        return "::".join(sorted([v1 or "", v2 or ""]))

    requested_pair = normalize_voice_pair(
        request.voice_a or "af_bella", request.voice_b or "bm_lewis"
    )

    # Get existing podcasts for this workspace/topic
    stmt = (
        select(GeneratedPodcast)
        .filter(
            GeneratedPodcast.workspace_id == request.workspace_id,
            GeneratedPodcast.topic == request.topic,
            GeneratedPodcast.podcast_type == type,
        )
        .order_by(GeneratedPodcast.created_at.desc())
    )
    existing_podcasts = list(db.scalars(stmt).all())

    # Check for duplicate voice pair
    for existing in existing_podcasts:
        existing_pair = normalize_voice_pair(
            existing.voice_a or "", existing.voice_b or ""
        )
        if existing_pair == requested_pair:
            # Return existing podcast with this voice pair
            return Podcast(
                topic=existing.topic,
                script=existing.script,
                audio_path=existing.audio_path,
                id=existing.id,
                voice_a=existing.voice_a,
                voice_b=existing.voice_b,
            )

    # Check max versions limit
    if len(existing_podcasts) >= MAX_VERSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_VERSIONS} podcast versions allowed. Delete an existing version to create a new one.",
        )

    # Determine voices before script generation
    voice_a_final = request.voice_a or "af_bella"
    voice_b_final = request.voice_b or "bm_lewis"

    # Generate Script with the selected voices
    try:
        podcast_data = generate_podcast_script(
            request.topic,
            request.workspace_id,
            db,
            podcast_type=type,
            voice_a=voice_a_final,
            voice_b=voice_b_final,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Podcast generation failed")
        raise HTTPException(status_code=500, detail=str(e))

    # Enrich script items with voice metadata
    if podcast_data and podcast_data.script:
        from backend.data.voices import get_voice_info

        for item in podcast_data.script:
            voice_info = get_voice_info(item.voice)
            item.voice_name = voice_info["name"]
            item.gender = voice_info["gender"]

    # Pre-save without audio path
    db_podcast = GeneratedPodcast(
        workspace_id=request.workspace_id,
        topic=request.topic,
        script=[item.model_dump() for item in podcast_data.script],
        audio_path="",  # Will be filled by background task
        podcast_type=type,
        voice_a=voice_a_final,
        voice_b=voice_b_final,
    )
    db.add(db_podcast)
    db.commit()
    db.refresh(db_podcast)

    # Start audio synthesis in background
    def synthesize_and_update(podcast_obj: Podcast, db_podcast_id: int):
        from backend.database import SessionLocal

        with SessionLocal() as bg_db:
            audio_rel_path = synthesize_podcast_audio(
                podcast_obj, podcast_id=db_podcast_id
            )
            bg_stmt = select(GeneratedPodcast).filter(
                GeneratedPodcast.id == db_podcast_id
            )
            bg_existing = bg_db.scalars(bg_stmt).first()
            if bg_existing:
                bg_existing.audio_path = audio_rel_path  # type: ignore[assignment]
                bg_db.commit()

    background_tasks.add_task(synthesize_and_update, podcast_data, db_podcast.id)

    # Add id and voice info to response
    podcast_data.id = db_podcast.id
    podcast_data.voice_a = voice_a_final
    podcast_data.voice_b = voice_b_final

    return podcast_data


@app.get("/podcasts/versions")
def list_podcast_versions(
    workspace_id: int,
    topic: str = "Key Concepts",
    type: str = "duo",
    db: Session = Depends(get_db),
):
    """List all podcast versions for a workspace/topic."""
    from backend.data.voices import get_voice_info

    stmt = (
        select(GeneratedPodcast)
        .filter(
            GeneratedPodcast.workspace_id == workspace_id,
            GeneratedPodcast.topic == topic,
            GeneratedPodcast.podcast_type == type,
        )
        .order_by(GeneratedPodcast.created_at.desc())
    )
    podcasts = list(db.scalars(stmt).all())

    versions = []
    for p in podcasts:
        # Fallback: Inference from script content if voice columns are empty (for legacy records)
        inferred_voice_a = p.voice_a
        inferred_voice_b = p.voice_b

        if not inferred_voice_a or not inferred_voice_b:
            # Collect unique voices from script in order of appearance
            script_voices = []
            seen_speakers = set()
            if p.script:
                for item in p.script:
                    speaker = item.get("speaker")
                    voice = item.get("voice")
                    if speaker and voice and speaker not in seen_speakers:
                        script_voices.append(voice)
                        seen_speakers.add(speaker)
                    if len(script_voices) >= 2:
                        break

            if not inferred_voice_a and len(script_voices) > 0:
                inferred_voice_a = script_voices[0]
            if not inferred_voice_b and len(script_voices) > 1:
                inferred_voice_b = script_voices[1]

        voice_a_info = get_voice_info(inferred_voice_a or "")
        voice_b_info = get_voice_info(inferred_voice_b or "")

        versions.append(
            {
                "id": p.id,
                "voice_a": inferred_voice_a,
                "voice_b": inferred_voice_b,
                "voice_a_name": voice_a_info["name"] if inferred_voice_a else "",
                "voice_b_name": voice_b_info["name"] if inferred_voice_b else "",
                "audio_path": p.audio_path,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
        )

    return {"versions": versions, "max_versions": 3}


@app.delete("/podcasts/{podcast_id}")
def delete_podcast_version(
    podcast_id: int,
    db: Session = Depends(get_db),
):
    """Delete a specific podcast version."""
    stmt = select(GeneratedPodcast).filter(GeneratedPodcast.id == podcast_id)
    podcast = db.scalars(stmt).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast version not found")

    # Delete audio file if exists
    if podcast.audio_path:
        import os

        audio_full_path = os.path.join("generated_audio", podcast.audio_path)
        if os.path.exists(audio_full_path):
            try:
                os.remove(audio_full_path)
            except Exception:
                pass  # Not critical if file deletion fails

    db.delete(podcast)
    db.commit()
    return {"success": True, "deleted_id": podcast_id}


@app.get("/podcasts/{podcast_id}")
def get_podcast_by_id(
    podcast_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific podcast version by ID."""
    from backend.data.voices import get_voice_info

    stmt = select(GeneratedPodcast).filter(GeneratedPodcast.id == podcast_id)
    podcast = db.scalars(stmt).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast version not found")

    # Enrich script with voice info
    enriched_script = []
    for item in podcast.script:
        voice_info = get_voice_info(item.get("voice", ""))
        enriched_item = {
            **item,
            "voice_name": item.get("voice_name") or voice_info["name"],
            "gender": item.get("gender") or voice_info["gender"],
        }
        enriched_script.append(enriched_item)

    from backend.schemas import PodcastDialogueItem

    script_items = [PodcastDialogueItem(**item) for item in enriched_script]

    return Podcast(
        id=podcast.id,
        topic=podcast.topic,
        script=script_items,
        audio_path=podcast.audio_path,
        voice_a=podcast.voice_a,
        voice_b=podcast.voice_b,
        created_at=podcast.created_at,
    )


@app.post("/generate/podcast/resynthesize")
def api_resynthesize_podcast_audio(
    request: GeneratePodcastRequest,
    background_tasks: BackgroundTasks,
    type: str = "duo",
    db: Session = Depends(get_db),
):
    """
    Resynthesize podcast audio with new voices.
    If voices are different from the existing podcast, creates a new version.
    If voices are the same, just re-synthesizes the existing one.
    """
    stmt = select(GeneratedPodcast).filter(
        GeneratedPodcast.workspace_id == request.workspace_id,
        GeneratedPodcast.topic == request.topic,
        GeneratedPodcast.podcast_type == type,
    )
    existing = db.scalars(stmt).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Podcast not found to resynthesize")

    # Check if voices are different
    voice_a_new = request.voice_a or "af_bella"
    voice_b_new = request.voice_b or "bm_lewis"
    voices_changed = existing.voice_a != voice_a_new or existing.voice_b != voice_b_new

    if voices_changed:
        # Create a NEW version with different voices
        # Check version limit
        all_podcasts = db.scalars(
            select(GeneratedPodcast).filter(
                GeneratedPodcast.workspace_id == request.workspace_id,
                GeneratedPodcast.topic == request.topic,
                GeneratedPodcast.podcast_type == type,
            )
        ).all()

        MAX_VERSIONS = 3
        if len(all_podcasts) >= MAX_VERSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_VERSIONS} podcast versions allowed. Delete an existing version to create a new one.",
            )

        # Generate new script with new voice names
        from backend.services.podcast import generate_podcast_script

        try:
            podcast_data = generate_podcast_script(
                request.topic,
                request.workspace_id,
                db,
                podcast_type=type,
                voice_a=voice_a_new,
                voice_b=voice_b_new,
            )
        except Exception as e:
            logger.exception("Podcast script generation failed during resynthesize")
            raise HTTPException(status_code=500, detail=str(e))

        # Enrich with voice metadata
        from backend.data.voices import get_voice_info

        for item in podcast_data.script:
            voice_info = get_voice_info(item.voice)
            item.voice_name = voice_info["name"]
            item.gender = voice_info["gender"]

        # Create new podcast version
        new_podcast = GeneratedPodcast(
            workspace_id=request.workspace_id,
            topic=request.topic,
            podcast_type=type,
            script=[item.model_dump() for item in podcast_data.script],
            audio_path="",
            voice_a=voice_a_new,
            voice_b=voice_b_new,
        )
        db.add(new_podcast)
        db.commit()
        db.refresh(new_podcast)

        # Synthesize audio in background
        def synthesize_and_update(db_podcast_id: int, podcast_data: Podcast):
            from backend.database import SessionLocal

            with SessionLocal() as bg_db:
                try:
                    audio_rel_path = synthesize_podcast_audio(
                        podcast_data, podcast_id=db_podcast_id
                    )
                except Exception:
                    logger.exception("Podcast audio synthesis failed")
                    return

                row = bg_db.scalar(
                    select(GeneratedPodcast).filter(
                        GeneratedPodcast.id == db_podcast_id
                    )
                )
                if row:
                    row.audio_path = audio_rel_path  # type: ignore[assignment]
                    bg_db.commit()

        background_tasks.add_task(synthesize_and_update, new_podcast.id, podcast_data)
        return {
            "audio_path": "",
            "message": "New version created with different voices",
        }

    else:
        # Same voices - just re-synthesize the existing podcast
        # Update voices in the script
        if existing.script:
            if type == "duo":
                speakers: list[str] = []
                for item in existing.script:
                    sp = item.get("speaker")
                    if sp and sp not in speakers:
                        speakers.append(sp)
                if len(speakers) >= 1 and request.voice_a:
                    for item in existing.script:
                        if item.get("speaker") == speakers[0]:
                            item["voice"] = request.voice_a
                if len(speakers) >= 2 and request.voice_b:
                    for item in existing.script:
                        if item.get("speaker") == speakers[1]:
                            item["voice"] = request.voice_b
            else:
                if request.voice:
                    for item in existing.script:
                        item["voice"] = request.voice

        podcast_obj = Podcast(
            topic=existing.topic,
            script=existing.script,
            audio_path="",
        )

        # Clear audio_path so UI shows "synthesizing"
        existing.audio_path = ""  # type: ignore[assignment]
        db.commit()

        def synthesize_and_update(db_podcast_id: int, podcast_data: Podcast):
            from backend.database import SessionLocal

            with SessionLocal() as bg_db:
                try:
                    audio_rel_path = synthesize_podcast_audio(
                        podcast_data, podcast_id=db_podcast_id
                    )
                except Exception:
                    logger.exception("Podcast audio re-synthesis failed")
                    return

                row = bg_db.scalar(
                    select(GeneratedPodcast).filter(
                        GeneratedPodcast.id == db_podcast_id
                    )
                )
                if row:
                    row.audio_path = audio_rel_path  # type: ignore[assignment]
                    bg_db.commit()

        background_tasks.add_task(synthesize_and_update, existing.id, podcast_obj)
        return {"audio_path": "", "message": "Re-synthesizing with same voices"}


@app.get("/podcast/synthesis/progress/{podcast_id}")
async def podcast_synthesis_progress(podcast_id: int):
    """
    Server-Sent Events endpoint for real-time podcast synthesis progress.
    """
    from backend.services.podcast import synthesis_progress_cache

    async def event_generator():
        try:
            # Keep streaming until synthesis is complete or failed
            while True:
                # Get progress from cache
                progress_data = synthesis_progress_cache.get(podcast_id)

                if progress_data:
                    # Send progress event
                    yield f"data: {json.dumps(progress_data)}\n\n"

                    # Stop streaming if complete or failed
                    if progress_data["status"] in ["complete", "failed"]:
                        # Clean up cache after a delay
                        await asyncio.sleep(2)
                        synthesis_progress_cache.pop(podcast_id, None)
                        break
                else:
                    # No progress data yet, send waiting status
                    yield f"data: {json.dumps({'progress': 0, 'status': 'waiting', 'message': 'Waiting for synthesis to start...'})}\n\n"

                # Wait before next update
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            # Client disconnected
            logger.info(f"SSE connection closed for podcast {podcast_id}")
            raise

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


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
    # Enrich podcast script with voice metadata if exists
    podcast_response = None
    if podcast:
        from backend.data.voices import get_voice_info

        enriched_script = []
        for item in podcast.script:
            voice_info = get_voice_info(item.get("voice", ""))
            enriched_item = {
                **item,
                "voice_name": item.get("voice_name") or voice_info["name"],
                "gender": item.get("gender") or voice_info["gender"],
            }
            enriched_script.append(enriched_item)

        podcast_response = {
            "topic": podcast.topic,
            "script": enriched_script,
            "audio_path": podcast.audio_path,
        }

    lesson_response = None
    if lesson:
        lesson_response = dict(lesson.content)
        if lesson.audio_path:
            lesson_response["audio_path"] = lesson.audio_path

    return {
        "lesson": lesson_response,
        "flashcards": flashcards.flashcards if flashcards else None,
        "quiz": quiz.quiz_content if quiz else None,
        "mindmap": mindmap.mindmap_content if mindmap else None,
        "podcast": podcast_response,
    }
