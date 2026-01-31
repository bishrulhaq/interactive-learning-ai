
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func, Enum
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
    status = Column(String, default="pending") # pending, processing, completed, failed

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    content = Column(Text)
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
