from langchain_openai import OpenAIEmbeddings
from langchain_huggingface import HuggingFaceEmbeddings
from backend.core.config import settings
from sqlalchemy.orm import Session
from typing import Optional


def get_embeddings_model(db: Optional[Session] = None):
    """
    Factory to return the configured embedding model wrapper.
    """
    # Defaults from core settings
    provider = settings.EMBEDDING_PROVIDER
    model_name = settings.EMBEDDING_MODEL_NAME
    api_key = settings.OPENAI_API_KEY

    if db:
        from backend.services.settings import get_app_settings

        settings_db = get_app_settings(db)
        provider = settings_db.embedding_provider
        model_name = settings_db.embedding_model
        if settings_db.openai_api_key:
            api_key = settings_db.openai_api_key

    if provider == "openai":
        return OpenAIEmbeddings(model=model_name, openai_api_key=api_key)
    elif provider == "huggingface":
        # Uses local sentence-transformers models
        mn = model_name if model_name else "sentence-transformers/all-MiniLM-L6-v2"
        return HuggingFaceEmbeddings(model_name=mn)
    else:
        raise ValueError(f"Unsupported embedding provider: {provider}")
