from typing import Optional
from sqlalchemy.orm import Session
from backend.schemas import LessonPlan, FlashcardSet, Quiz, MindMap
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from pydantic import SecretStr
from langchain_core.prompts import ChatPromptTemplate
from backend.models import Workspace
from backend.services.settings import get_app_settings
import requests
import random


def _normalize_base_url(url: str) -> str:
    return url.rstrip("/")


def _ollama_preflight(base_url: str, model_name: str) -> None:
    """
    Best-effort validation that Ollama is reachable and the model exists locally.
    Raises ValueError with a user-facing message on failure.
    """
    base_url = _normalize_base_url(base_url)
    try:
        resp = requests.get(f"{base_url}/api/tags", timeout=2)
    except Exception as e:
        raise ValueError(
            f"Could not reach Ollama at {base_url}. Is Ollama running? (Error: {e})"
        ) from e

    if resp.status_code != 200:
        raise ValueError(
            f"Ollama at {base_url} returned HTTP {resp.status_code} from /api/tags. "
            "Check Ollama is running and accessible."
        )

    try:
        data = resp.json()
    except Exception as e:
        raise ValueError(
            f"Ollama at {base_url} returned invalid JSON from /api/tags (Error: {e})."
        ) from e

    models = data.get("models") or []
    names = [m.get("name") for m in models if isinstance(m, dict)]

    def matches(n: str) -> bool:
        # Ollama names often include tags like "llama3:latest"
        return n == model_name or n.startswith(model_name + ":")

    if not any(isinstance(n, str) and matches(n) for n in names):
        sample = ", ".join([n for n in names if isinstance(n, str)][:8])
        raise ValueError(
            "Ollama model is not available locally. "
            f"Requested: '{model_name}'. "
            f"Available: {sample or '(none)'}.\n"
            "Fix: open Settings → click Download for your Ollama model, or run: "
            f"ollama pull {model_name}"
        )


def get_llm(db: Session, workspace_id: Optional[int] = None, temperature: float = 0.7):
    settings_db = get_app_settings(db)

    # Defaults from Global Settings
    provider = settings_db.llm_provider or "openai"
    model_name = settings_db.openai_model or "gpt-4o"
    ollama_url = settings_db.ollama_base_url or "http://localhost:11434"
    api_key = settings_db.openai_api_key

    if workspace_id:
        workspace = db.get(Workspace, workspace_id)
        if workspace:
            if workspace.llm_provider:
                provider = workspace.llm_provider

            # Use appropriate model name based on provider
            if provider == "openai":
                if workspace.llm_model:
                    model_name = workspace.llm_model
                else:
                    model_name = settings_db.openai_model or "gpt-4o"
            elif provider == "ollama":
                # For Ollama, the model name might be stored in workspace.llm_model
                if workspace.llm_model:
                    model_name = workspace.llm_model
                else:
                    # Fall back to the global model field (shared in current schema).
                    model_name = settings_db.openai_model or model_name

            if workspace.ollama_base_url:
                ollama_url = workspace.ollama_base_url

    if provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API Key is not configured in global settings.")

        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            api_key=SecretStr(api_key),
        )
    elif provider == "ollama":
        # Common misconfig: model name left as "gpt-4o" when switching to Ollama.
        if model_name.startswith("gpt-"):
            raise ValueError(
                "Ollama is selected as LLM provider, but the model name looks like an OpenAI model "
                f"('{model_name}'). Set 'Model Name' in Settings to an Ollama model (e.g. 'llama3') "
                "and download/pull it first."
            )
        _ollama_preflight(ollama_url, model_name)
        return ChatOllama(
            model=model_name,
            temperature=temperature,
            base_url=ollama_url,
        )
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


def generate_lesson_plan(topic: str, workspace_id: int, db: Session) -> LessonPlan:
    # 1. Retrieve context
    from backend.services.rag import search_documents

    chunks = search_documents(topic, workspace_id, db, k=8)
    context = "\n".join([c.content for c in chunks])

    # 2. Structured generation
    llm = get_llm(db, workspace_id)
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
    from backend.services.rag import search_documents

    chunks = search_documents(topic, workspace_id, db, k=15)

    # Shuffle and pick top 5-7 to ensure context varies but stays relevant
    if chunks:
        selected_chunks = random.sample(chunks, min(len(chunks), 5))
    else:
        selected_chunks = []

    context = "\n".join([c.content for c in selected_chunks])

    llm = get_llm(db, workspace_id)
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
    from backend.services.rag import search_documents

    chunks = search_documents(topic, workspace_id, db, k=15)

    # Randomly select subset
    if chunks:
        selected_chunks = random.sample(chunks, min(len(chunks), 5))
    else:
        selected_chunks = []

    context = "\n".join([c.content for c in selected_chunks])

    llm = get_llm(db, workspace_id)
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
    from backend.services.rag import search_documents

    chunks = search_documents(topic, workspace_id, db, k=8)
    context = "\n".join([c.content for c in chunks])

    llm = get_llm(db, workspace_id)
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
