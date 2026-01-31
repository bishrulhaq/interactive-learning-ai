
from fastapi import FastAPI, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from backend.core.config import settings
from backend.database import get_db, engine, Base
from backend.services.ingestion import process_pdf
from backend.services.rag import chat_with_docs
from backend.services.generator import generate_lesson_plan, generate_flashcards, generate_quiz
from backend.schemas import LessonPlan, FlashcardSet, Quiz
from pydantic import BaseModel

# Create tables on startup (dev only)
Base.metadata.create_all(bind=engine)


app = FastAPI(title=settings.PROJECT_NAME, version=settings.PROJECT_VERSION)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # TODO: specific origins for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Welcome to RAG Education API", "version": settings.PROJECT_VERSION}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    return await process_pdf(file, db)

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    return chat_with_docs(request.message, db)

class GenerateRequest(BaseModel):
    topic: str

@app.post("/generate/lesson", response_model=LessonPlan)
def api_generate_lesson(request: GenerateRequest, db: Session = Depends(get_db)):
    return generate_lesson_plan(request.topic, db)

@app.post("/generate/flashcards", response_model=FlashcardSet)
def api_generate_flashcards(request: GenerateRequest, db: Session = Depends(get_db)):
    return generate_flashcards(request.topic, db)

@app.post("/generate/quiz", response_model=Quiz)
def api_generate_quiz(request: GenerateRequest, db: Session = Depends(get_db)):
    return generate_quiz(request.topic, db)

