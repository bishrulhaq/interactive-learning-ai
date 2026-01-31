from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from backend.database import Base
import datetime


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    file_path = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="pending")  # pending, processing, completed, failed

    chunks = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )
    messages = relationship(
        "Message", back_populates="document", cascade="all, delete-orphan"
    )
    lessons = relationship(
        "GeneratedLesson", back_populates="document", cascade="all, delete-orphan"
    )
    flashcards = relationship(
        "GeneratedFlashcard", back_populates="document", cascade="all, delete-orphan"
    )
    quizzes = relationship(
        "GeneratedQuiz", back_populates="document", cascade="all, delete-orphan"
    )
    mindmaps = relationship(
        "GeneratedMindMap", back_populates="document", cascade="all, delete-orphan"
    )


class GeneratedQuiz(Base):
    __tablename__ = "generated_quizzes"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    topic = Column(String)
    quiz_content = Column(JSON)  # Stores the full Quiz JSON
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    document = relationship("Document", back_populates="quizzes")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    content: str = Column(Text)  # type: ignore
    chunk_index = Column(Integer)
    # Using 1536 dimensions for OpenAI text-embedding-3-small by default.
    # If using local model (e.g. all-MiniLM-L6-v2), it's 384.
    # Use generic Vector(None) or handle via migration if changing models frequently.
    # For now, let's assume 1536 but we might need to change this dynamically or use a larger size and pad?
    # Better: just use Vector without dimension enforcement if supported, or picking a convention.
    # Postgres pgvector supports sparse vectors or different colums.
    # Let's use 1536 to start. If user switches to HuggingFace, we might hit issues if we don't handle it.
    # Warning: Embedding dimension mismatch will cause errors.
    embedding = Column(Vector(1536))

    document = relationship("Document", back_populates="chunks")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    role = Column(String)  # user, assistant
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    document = relationship("Document", back_populates="messages")


class GeneratedLesson(Base):
    __tablename__ = "generated_lessons"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    topic = Column(String)
    content = Column(JSON)  # Stores the full LessonPlan JSON
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    document = relationship("Document", back_populates="lessons")


class GeneratedFlashcard(Base):
    __tablename__ = "generated_flashcards"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    topic = Column(String)
    flashcards = Column(JSON)  # Stores list of cards
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    document = relationship("Document", back_populates="flashcards")


class GeneratedMindMap(Base):
    __tablename__ = "generated_mindmaps"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    topic = Column(String)
    mindmap_content = Column(JSON)  # Stores the full MindMap JSON
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    document = relationship("Document", back_populates="mindmaps")
