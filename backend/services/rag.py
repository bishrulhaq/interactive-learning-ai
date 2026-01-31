
from typing import List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select
from backend.models import DocumentChunk
from backend.services.embeddings import get_embeddings_model
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from backend.core.config import settings

def search_documents(query: str, document_id: int, db: Session, k: int = 5) -> List[Tuple[DocumentChunk, float]]:
    """
    Semantic search using pgvector, filtered by document_id.
    """
    embedding_model = get_embeddings_model()
    query_vector = embedding_model.embed_query(query)

    stmt = select(DocumentChunk).filter(DocumentChunk.document_id == document_id).order_by(DocumentChunk.embedding.cosine_distance(query_vector)).limit(k)
    results = db.scalars(stmt).all()
    
    return results

def chat_with_docs(query: str, document_id: int, db: Session) -> str:
    # 1. Retrieve context
    relevant_chunks = search_documents(query, document_id, db, k=5)
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
