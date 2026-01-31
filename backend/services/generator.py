from sqlalchemy.orm import Session
from backend.services.rag import search_documents
from backend.schemas import LessonPlan, FlashcardSet, Quiz
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from backend.core.config import settings

llm = ChatOpenAI(
    model="gpt-4o", temperature=0.7, openai_api_key=settings.OPENAI_API_KEY
)


def generate_lesson_plan(topic: str, document_id: int, db: Session) -> LessonPlan:
    # 1. Retrieve context
    chunks = search_documents(topic, document_id, db, k=8)
    context = "\n".join([c.content for c in chunks])

    # 2. Structured generation
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


def generate_flashcards(topic: str, document_id: int, db: Session) -> FlashcardSet:
    chunks = search_documents(topic, document_id, db, k=5)
    context = "\n".join([c.content for c in chunks])

    structured_llm = llm.with_structured_output(FlashcardSet)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Create a set of 5-10 flashcards (Front/Back) based on the context to help a student learn the key concepts.",
            ),
            ("user", "Context: {context}\n\nTopic: {topic}\n\nGenerate flashcards:"),
        ]
    )

    chain = prompt | structured_llm
    return chain.invoke({"context": context, "topic": topic})


def generate_quiz(topic: str, document_id: int, db: Session) -> Quiz:
    chunks = search_documents(topic, document_id, db, k=5)
    context = "\n".join([c.content for c in chunks])

    structured_llm = llm.with_structured_output(Quiz)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "Create a 5-question multiple choice quiz based on the context.",
            ),
            ("user", "Context: {context}\n\nTopic: {topic}\n\nGenerate quiz:"),
        ]
    )

    chain = prompt | structured_llm
    return chain.invoke({"context": context, "topic": topic})
