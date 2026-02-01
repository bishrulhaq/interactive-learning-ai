from typing import List, cast
from sqlalchemy.orm import Session
from sqlalchemy import select
from backend.models import DocumentChunk
from backend.services.embeddings import get_embeddings_model
from langchain_core.messages import SystemMessage, HumanMessage


def search_documents(
    query: str, workspace_id: int, db: Session, k: int = 8
) -> List[DocumentChunk]:
    """
    Semantic search using pgvector, filtered by workspace_id.
    """
    embedding_model, dim, _, _ = get_embeddings_model(db, workspace_id)
    query_vector = embedding_model.embed_query(query)

    # Determine which column to search
    if dim == 1536:
        vector_col = DocumentChunk.embedding_1536
    elif dim == 1024:
        vector_col = DocumentChunk.embedding_1024
    elif dim == 768:
        vector_col = DocumentChunk.embedding_768
    elif dim == 384:
        vector_col = DocumentChunk.embedding_384
    else:
        vector_col = DocumentChunk.embedding_768

    stmt = (
        select(DocumentChunk)
        .filter(DocumentChunk.workspace_id == workspace_id)  # type: ignore
        .order_by(vector_col.cosine_distance(query_vector))
        .limit(k)
    )
    results = db.scalars(stmt).all()

    return list(results)


def get_relevant_context(query: str, workspace_id: int, db: Session, k: int = 8) -> str:
    """
    Search for documents and return a single concatenated string of context.
    """
    chunks = search_documents(query, workspace_id, db, k=k)
    return "\n\n".join([chunk.content for chunk in chunks])


def chat_with_docs(query: str, workspace_id: int, db: Session) -> str:
    # 1. Retrieve context
    relevant_chunks = search_documents(query, workspace_id, db, k=8)

    # 2. Format context with available metadata
    context_parts = []
    for chunk in relevant_chunks:
        meta: dict = cast(dict, chunk.chunk_metadata or {})
        source_name = meta.get("source", "Unknown Document")
        chunk_header = (
            f"--- SOURCE: {source_name} (Page {meta.get('page', 'Unknown')}) ---"
        )
        chunk_data = f"{chunk_header}\n{chunk.content}"

        # Add confusion points hint if they exist, to help LLM explain better
        if meta.get("confusion_points"):
            chunk_data += f"\n[Teaching Hint: {meta['confusion_points']}]"

        context_parts.append(chunk_data)

    context_text = "\n\n".join(context_parts)

    # 2. Generate Answer
    from backend.services.generator import get_llm

    llm = get_llm(db, workspace_id)

    system_prompt = f"""You are an educational assistant. Use the following context from the workspace to answer the user's question.
The context contains information from multiple documents (PDFs, Word, PPTs, or images).
If you don't know the answer, just say that you don't know, don't try to make up an answer.
    
Context:
{context_text}
"""

    messages = [SystemMessage(content=system_prompt), HumanMessage(content=query)]

    response = llm.invoke(messages)
    return cast(str, response.content)
