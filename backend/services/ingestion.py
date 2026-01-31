
import os
import shutil
from typing import List
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.models import Document, DocumentChunk
from backend.services.embeddings import get_embeddings_model

UPLOAD_DIR = "storage/documents"
os.makedirs(UPLOAD_DIR, exist_ok=True)

async def process_pdf(file: UploadFile, db: Session):
    # 1. Save file locally
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # 2. Create Document record
    db_document = Document(title=file.filename, file_path=file_path, status="processing")
    db.add(db_document)
    db.commit()
    db.refresh(db_document)

    try:
        # 3. Extract Text
        text = extract_text_from_pdf(file_path)
        
        # 4. Chunk Text
        chunks = chunk_text(text)
        
        # 5. Generate Embeddings & Store
        embedding_model = get_embeddings_model()
        vectors = embedding_model.embed_documents(chunks)
        
        # 6. Save Chunks to DB
        for i, (chunk_text_content, vector) in enumerate(zip(chunks, vectors)):
            db_chunk = DocumentChunk(
                document_id=db_document.id,
                content=chunk_text_content,
                chunk_index=i,
                embedding=vector # pgvector handles list -> vector
            )
            db.add(db_chunk)
        
        db_document.status = "completed"
        db.commit()
        
        return {"id": db_document.id, "status": "completed", "chunks": len(chunks)}

    except Exception as e:
        db_document.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

def extract_text_from_pdf(path: str) -> str:
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text

def chunk_text(text: str) -> List[str]:
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
    )
    return text_splitter.split_text(text)
