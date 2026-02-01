from sqlalchemy.orm import Session
from backend.services.rag import search_documents
from backend.schemas import LessonPlan, FlashcardSet, Quiz, MindMap
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
import random

from backend.services.settings import get_app_settings


def get_llm(db: Session, temperature: float = 0.7):
    settings_db = get_app_settings(db)

    # Default to OpenAI
    if not settings_db.openai_api_key:
        raise ValueError("OpenAI API Key is not configured in settings.")

    return ChatOpenAI(
        model=settings_db.openai_model,
        temperature=temperature,
        openai_api_key=settings_db.openai_api_key,
    )


def generate_lesson_plan(topic: str, workspace_id: int, db: Session) -> LessonPlan:
    # 1. Retrieve context
    chunks = search_documents(topic, workspace_id, db, k=8)
    context = "\n".join([c.content for c in chunks])

    # 2. Structured generation
    llm = get_llm(db)
    structured_llm = llm.with_structured_output(LessonPlan)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are an expert educational content creator. Create a comprehensive lesson plan based strictly on the provided context.",
            ),
            ("user", "Context: {context}\n\nTopic: {topic}\n\nGenerate a lesson plan:"),
        ]
    )

    chain = prompt | structured_llm
    return chain.invoke({"context": context, "topic": topic})


def generate_flashcards(topic: str, workspace_id: int, db: Session) -> FlashcardSet:
    # Fetch larger pool of chunks to add variety
    chunks = search_documents(topic, workspace_id, db, k=15)

    # Shuffle and pick top 5-7 to ensure context varies but stays relevant
    if chunks:
        selected_chunks = random.sample(chunks, min(len(chunks), 5))
    else:
        selected_chunks = []

    context = "\n".join([c.content for c in selected_chunks])

    llm = get_llm(db)
    structured_llm = llm.with_structured_output(FlashcardSet)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Create a set of 5-10 flashcards (Front/Back) based on the context to help a student learn the key concepts. Avoid duplicates.",
            ),
            ("user", "Context: {context}\n\nTopic: {topic}\n\nGenerate flashcards:"),
        ]
    )

    chain = prompt | structured_llm
    return chain.invoke({"context": context, "topic": topic})


def generate_quiz(topic: str, workspace_id: int, db: Session) -> Quiz:
    # Fetch larger pool of chunks
    chunks = search_documents(topic, workspace_id, db, k=15)

    # Randomly select subset
    if chunks:
        selected_chunks = random.sample(chunks, min(len(chunks), 5))
    else:
        selected_chunks = []

    context = "\n".join([c.content for c in selected_chunks])

    llm = get_llm(db)
    structured_llm = llm.with_structured_output(Quiz)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Create a 5-question multiple choice quiz based on the context. Ensure questions are diverse.",
            ),
            ("user", "Context: {context}\n\nTopic: {topic}\n\nGenerate quiz:"),
        ]
    )

    chain = prompt | structured_llm
    return chain.invoke({"context": context, "topic": topic})


def generate_mind_map(topic: str, workspace_id: int, db: Session) -> MindMap:
    chunks = search_documents(topic, workspace_id, db, k=8)
    context = "\n".join([c.content for c in chunks])

    llm = get_llm(db)
    structured_llm = llm.with_structured_output(MindMap)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Create a mind map with 10-15 nodes based on the context to visualize the relationships between key concepts. Return a list of nodes and edges.",
            ),
            ("user", "Context: {context}\n\nTopic: {topic}\n\nGenerate mind map:"),
        ]
    )

    chain = prompt | structured_llm
    return chain.invoke({"context": context, "topic": topic})
