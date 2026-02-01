from typing import List, Optional, Any
from sqlalchemy import (
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from backend.database import Base
import datetime


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    # Workspace-specific AI Settings (if None, use global AppSettings)
    embedding_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    embedding_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    llm_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    llm_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ollama_base_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    documents: Mapped[List["Document"]] = relationship(
        "Document", back_populates="workspace", cascade="all, delete-orphan"
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="workspace", cascade="all, delete-orphan"
    )
    lessons: Mapped[List["GeneratedLesson"]] = relationship(
        "GeneratedLesson", back_populates="workspace", cascade="all, delete-orphan"
    )
    flashcards: Mapped[List["GeneratedFlashcard"]] = relationship(
        "GeneratedFlashcard", back_populates="workspace", cascade="all, delete-orphan"
    )
    quizzes: Mapped[List["GeneratedQuiz"]] = relationship(
        "GeneratedQuiz", back_populates="workspace", cascade="all, delete-orphan"
    )
    mindmaps: Mapped[List["GeneratedMindMap"]] = relationship(
        "GeneratedMindMap", back_populates="workspace", cascade="all, delete-orphan"
    )
    podcasts: Mapped[List["GeneratedPodcast"]] = relationship(
        "GeneratedPodcast", back_populates="workspace", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    title: Mapped[str] = mapped_column(String, index=True)
    file_path: Mapped[str] = mapped_column(String)
    file_type: Mapped[str] = mapped_column(String)  # pdf, docx, pptx, image
    embedding_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    embedding_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )
    status: Mapped[str] = mapped_column(
        String, default="pending"
    )  # pending, processing, completed, failed
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    toc: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="documents"
    )
    chunks: Mapped[List["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="document", cascade="all, delete-orphan"
    )


class GeneratedQuiz(Base):
    __tablename__ = "generated_quizzes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    topic: Mapped[str] = mapped_column(String)
    quiz_content: Mapped[Any] = mapped_column(JSON)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="quizzes")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("documents.id"))
    workspace_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("workspaces.id"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column(Integer)

    # Supported Vector Dimensions
    embedding_1536: Mapped[Optional[Any]] = mapped_column(
        Vector(1536), nullable=True
    )  # OpenAI / Large HF
    embedding_1024: Mapped[Optional[Any]] = mapped_column(
        Vector(1024), nullable=True
    )  # Large HF (BGE-Large)
    embedding_768: Mapped[Optional[Any]] = mapped_column(
        Vector(768), nullable=True
    )  # Mistral / Mid HF
    embedding_384: Mapped[Optional[Any]] = mapped_column(
        Vector(384), nullable=True
    )  # MiniLM / Small HF

    chunk_metadata: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    document: Mapped["Document"] = relationship("Document", back_populates="chunks")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    role: Mapped[str] = mapped_column(String)  # user, assistant
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="messages"
    )


class GeneratedLesson(Base):
    __tablename__ = "generated_lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    topic: Mapped[str] = mapped_column(String)
    content: Mapped[Any] = mapped_column(JSON)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="lessons")


class GeneratedFlashcard(Base):
    __tablename__ = "generated_flashcards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    topic: Mapped[str] = mapped_column(String)
    flashcards: Mapped[Any] = mapped_column(JSON)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="flashcards"
    )


class GeneratedMindMap(Base):
    __tablename__ = "generated_mindmaps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    topic: Mapped[str] = mapped_column(String)
    mindmap_content: Mapped[Any] = mapped_column(JSON)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="mindmaps"
    )


class GeneratedPodcast(Base):
    __tablename__ = "generated_podcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workspace_id: Mapped[int] = mapped_column(Integer, ForeignKey("workspaces.id"))
    topic: Mapped[str] = mapped_column(String)
    script: Mapped[Any] = mapped_column(JSON)
    audio_path: Mapped[str] = mapped_column(String)
    podcast_type: Mapped[str] = mapped_column(String)  # single, duo
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )

    workspace: Mapped["Workspace"] = relationship(
        "Workspace", back_populates="podcasts"
    )


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    llm_provider: Mapped[str] = mapped_column(String, default="openai")
    openai_api_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    openai_model: Mapped[str] = mapped_column(String, default="gpt-4o")
    embedding_provider: Mapped[str] = mapped_column(String, default="openai")
    embedding_model: Mapped[str] = mapped_column(
        String, default="text-embedding-3-small"
    )
    ollama_base_url: Mapped[str] = mapped_column(
        String, default="http://localhost:11434"
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
