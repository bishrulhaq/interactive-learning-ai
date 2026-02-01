from sqlalchemy.orm import Session
from sqlalchemy import select
from backend.models import AppSettings
from typing import Optional


def get_app_settings(db: Session) -> AppSettings:
    """
    Get the application settings from the database.
    Creates a default entry if none exists.
    """
    stmt = select(AppSettings).limit(1)
    settings = db.execute(stmt).scalar_one_or_none()

    if not settings:
        settings = AppSettings(openai_api_key=None, openai_model="gpt-4o")
        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


def update_app_settings(
    db: Session,
    llm_provider: Optional[str] = None,
    openai_api_key: Optional[str] = None,
    openai_model: Optional[str] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
) -> AppSettings:
    """
    Update the application settings.
    """
    settings = get_app_settings(db)

    if llm_provider is not None:
        settings.llm_provider = llm_provider
    if openai_api_key is not None:
        settings.openai_api_key = openai_api_key
    if openai_model is not None:
        settings.openai_model = openai_model
    if embedding_provider is not None:
        settings.embedding_provider = embedding_provider
    if embedding_model is not None:
        settings.embedding_model = embedding_model

    db.commit()
    db.refresh(settings)
    return settings
