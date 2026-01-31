
from typing import List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select
from backend.models import DocumentChunk
from backend.services.embeddings import get_embeddings_model
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from backend.core.config import settings

def search_documents(query: str, db: Session, k: int = 5) -> List[Tuple[DocumentChunk, float]]:
    """
    Semantic search using pgvector.
    Returns list of (DocumentChunk, distance).
    Note: pgvector order_by uses operators like <-> (L2 distance), <=> (Cosine distance), <#> (Inner product).
    Cosine distance is <=>
    """
    embedding_model = get_embeddings_model()
    query_vector = embedding_model.embed_query(query)

    # SQLAlchemy 2.0 style with pgvector
    # We want the chunks with smallest distance
    stmt = select(DocumentChunk).order_by(DocumentChunk.embedding.cosine_distance(query_vector)).limit(k)
    results = db.scalars(stmt).all()
    
    # In a real app we might want the scores too, but scalars() just gives the objects.
    # For now, just return the chunks.
    return results

def chat_with_docs(query: str, db: Session) -> str:
    # 1. Retrieve context
    relevant_chunks = search_documents(query, db, k=5)
    context_text = "\n\n".join([chunk.content for chunk in relevant_chunks])
    
    # 2. Generate Answer
    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0,
        openai_api_key=settings.OPENAI_API_KEY
    )
    
    system_prompt = f"""You are an educational assistant. Use the following pieces of context to answer the user's question.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
    
Context:
{context_text}
"""
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=query)
    ]
    
    response = llm.invoke(messages)
    return response.content
