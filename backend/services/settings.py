from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import AppSettings


def get_app_settings(db: Session) -> AppSettings:
    """
    Get the application settings from the database.
    Creates a default entry if none exists.
    """
    stmt = select(AppSettings).limit(1)
    settings = db.execute(stmt).scalar_one_or_none()

    if not settings:
        settings = AppSettings(
            openai_api_key=None,
            openai_model="gpt-4o",
            llm_provider="openai",
            embedding_provider="openai",
            ollama_base_url="http://localhost:11434",
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # Ensure defaults for existing rows that might have NULLs from migrations
    if settings.llm_provider is None:
        settings.llm_provider = "openai"
    if settings.embedding_provider is None:
        settings.embedding_provider = "openai"
    if settings.ollama_base_url is None:
        settings.ollama_base_url = "http://localhost:11434"

    return settings


def update_app_settings(
    db: Session,
    llm_provider: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    openai_model: Optional[str] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    ollama_base_url: Optional[str] = None,
) -> AppSettings:
    """
    Update the application settings.
    """
    settings = get_app_settings(db)

    if llm_provider is not None:
        settings.llm_provider = llm_provider
    if openai_api_key is not None:
        key = openai_api_key.strip()
        settings.openai_api_key = key if key else None
    if openai_model is not None:
        settings.openai_model = openai_model
    if embedding_provider is not None:
        settings.embedding_provider = embedding_provider
    if embedding_model is not None:
        settings.embedding_model = embedding_model
    if ollama_base_url is not None:
        settings.ollama_base_url = ollama_base_url

    db.commit()
    db.refresh(settings)
    return settings
