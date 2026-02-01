from pathlib import Path
from typing import List, Iterable
import shutil
import uuid

from fastapi import UploadFile
from sqlalchemy.orm import Session

from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    MarkdownTextSplitter,
)
from langchain_core.documents import Document as LCDocument

from backend.models import Document, DocumentChunk
from backend.services.embeddings import get_embeddings_model


# ======================================================
# Config
# ======================================================

UPLOAD_DIR = Path("storage/documents")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

CHUNK_SIZE = 700
CHUNK_OVERLAP = 120
EMBED_BATCH_SIZE = 64


# ======================================================
# PUBLIC ENTRY
# ======================================================


async def ingest_file(file: UploadFile, workspace_id: int, db: Session):
    """
    Entry point for all multimodal uploads.
    Saves the file and triggers the background processing task.
    """
    file_path = save_file(file)
    filename = file.filename or "uploaded_file"
    file_type = infer_file_type_from_filename(filename)
    if file_type == "unknown":
        raise ValueError(
            f"Unsupported file type for '{filename}'. Supported: pdf, docx, pptx, jpg/jpeg/png/webp."
        )

    db_doc = create_document_record(db, workspace_id, filename, file_path, file_type)

    # Trigger background task
    from backend.tasks import process_document_task

    process_document_task.delay(db_doc.id)

    return {
        "id": db_doc.id,
        "filename": file.filename,
        "status": "pending",
        "message": "File upload successful. Processing started in background.",
    }


# ======================================================
# FILE HANDLING
# ======================================================


def save_file(file: UploadFile) -> Path:
    """
    Save safely with UUID to avoid collisions, preserving original extension
    """
    original_suffix = Path(file.filename or "").suffix
    filename = f"{uuid.uuid4()}{original_suffix}"
    path = UPLOAD_DIR / filename

    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return path


# ======================================================
# DB HELPERS
# ======================================================


def create_document_record(
    db: Session, workspace_id: int, title: str, path: Path, file_type: str
) -> Document:
    doc = Document(
        workspace_id=workspace_id,
        title=title,
        file_path=str(path),
        file_type=file_type,
        status="pending",
    )

    db.add(doc)
    db.commit()
    db.refresh(doc)

    return doc


def infer_file_type_from_filename(filename: str) -> str:
    """
    Infer the application's `Document.file_type` from an uploaded filename.
    Must be non-null due to DB constraint.
    """
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return "pdf"
    if suffix in (".docx", ".doc"):
        return "docx"
    if suffix in (".pptx", ".ppt"):
        return "pptx"
    if suffix in (".jpg", ".jpeg", ".png", ".webp"):
        return "image"
    return "unknown"


# ======================================================
# MAIN PROCESSING
# ======================================================


def embed_and_store_pages(
    db: Session,
    document_id: int,
    pages: List[dict],
) -> int:
    """
    High-speed embedding and storage:
    - No LLM calls
    - Batched embedding generation
    - Bulk DB insertion
    """

    doc = db.get(Document, document_id)
    if not doc:
        return 0

    model, dim, _, _ = get_embeddings_model(db, doc.workspace_id)

    all_rows: List[DocumentChunk] = []
    chunk_index = 0

    for page_data in pages:
        page_text = page_data["text"]
        page_num = page_data["metadata"].get("page", 0) + 1

        refined = promote_structural_markers(page_text)

        chunks = chunk_markdown(refined)

        # Process page chunks in batches for the embedding model
        for _, batch in batch_iter(chunks, EMBED_BATCH_SIZE):
            texts = [c.page_content for c in batch]
            vectors = model.embed_documents(texts)

            for i, (chunk, vector) in enumerate(zip(batch, vectors)):
                meta = chunk.metadata.copy()
                meta["page"] = page_num

                prefix = extract_context_prefix(meta)
                enriched_content = f"{prefix}\n\n{chunk.page_content}"

                chunk_args = {
                    "document_id": document_id,
                    "workspace_id": doc.workspace_id,
                    "content": enriched_content,
                    "chunk_index": chunk_index,
                    "chunk_metadata": meta,
                }

                # Assign to correct embedding column
                if dim == 1536:
                    chunk_args["embedding_1536"] = vector
                elif dim == 1024:
                    chunk_args["embedding_1024"] = vector
                elif dim == 768:
                    chunk_args["embedding_768"] = vector
                elif dim == 384:
                    chunk_args["embedding_384"] = vector
                else:
                    # Generic fallback if we add more
                    chunk_args["embedding_768"] = vector

                all_rows.append(DocumentChunk(**chunk_args))
                chunk_index += 1

    # ⭐ SINGLE BULK INSERT
    db.add_all(all_rows)
    db.commit()

    return chunk_index


# ======================================================
# CHUNKING
# ======================================================


def chunk_markdown(md_text: str) -> List[LCDocument]:
    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[("#", f"Header {i}") for i in range(1, 7)],
        strip_headers=False,
    )

    header_docs = header_splitter.split_text(md_text)

    splitter = MarkdownTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

    return splitter.split_documents(header_docs)


# ======================================================
# HELPERS
# ======================================================


def batch_iter(items: List, size: int) -> Iterable:
    for i in range(0, len(items), size):
        yield i, items[i : i + size]


def extract_context_prefix(metadata: dict) -> str:
    headers = [
        str(metadata.get(f"Header {i}"))
        for i in range(1, 7)
        if metadata.get(f"Header {i}")
    ]

    prefix = " > ".join(headers) if headers else "General Content"

    if metadata.get("page"):
        prefix += f" (Page {metadata['page']})"

    return f"Context: {prefix}"


def promote_structural_markers(text: str) -> str:
    """
    Fast regex-based structural marker promotion.
    NO LLM usage here.
    """
    import re

    lines = text.split("\n")
    new_lines = []

    # Exhaustive list of educational/scientific structural labels
    marker_pattern = r"^(Chapter|Unit|Module|Lesson|Syllabus|Preface|Introduction|Abstract|Learning Objective|Objective|Section|Part|Phase|Stage|Step|Procedure|Tutorial|Methodology|Example|Case Study|Figure|Table|Equation|Formula|Theorem|Lemma|Definition|Corollary|Postulate|Axiom|Conjecture|Proposition|Proof|Solution|Exercise|Activity|Problem Set|Assignment|Review|Summary|Key Concept|Key Takeaway|Takeaway|Caution|Warning|Tip|Notation|Convention|Observation|Fact|Claim|Hypothesis|Assumption|Protocol|Scheme|Algorithm|Law|Rule|Principle|Property|Framework|Model|Question|Answer|Q&A|Discussion Questions|Discussion|Self-Check|Further Reading|Reference|Quote|Checklist|Conclusion|Result|Analysis|Metric)\s+\d*[:.]?"

    for line in lines:
        stripped = line.strip()

        # 1. Bold headers promotion
        if re.match(r"^\*\*[^*]+\*\*$", stripped) and not stripped.startswith("#"):
            new_lines.append(f"#### {stripped.replace('**', '')}")

        # 2. Structural marker promotion
        elif re.match(marker_pattern, stripped, re.I) and not stripped.startswith("#"):
            new_lines.append(f"##### {stripped}")

        # 3. Math environments
        elif re.match(r"^\[.*\]$|^\$\$.*\$\$$", stripped):
            new_lines.append("###### Equation Block")
            new_lines.append(line)
        else:
            new_lines.append(line)

    return "\n".join(new_lines)


# ======================================================
# TOC EXTRACTION
# ======================================================


def extract_pdf_toc(path: Path) -> List[dict]:
    import fitz

    doc = fitz.open(str(path))
    toc = doc.get_toc()
    doc.close()

    return [{"level": lvl, "title": title, "page": page} for lvl, title, page in toc]
