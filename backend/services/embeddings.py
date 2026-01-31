
from langchain_openai import OpenAIEmbeddings
from langchain_huggingface import HuggingFaceEmbeddings
from backend.core.config import settings

def get_embeddings_model():
    """
    Factory to return the configured embedding model wrapper.
    """
    if settings.EMBEDDING_PROVIDER == "openai":
        return OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL_NAME,
            openai_api_key=settings.OPENAI_API_KEY
        )
    elif settings.EMBEDDING_PROVIDER == "huggingface":
        # Uses local sentence-transformers models
        # Default fallback: all-MiniLM-L6-v2 is fast and decent
        model_name = settings.EMBEDDING_MODEL_NAME if settings.EMBEDDING_MODEL_NAME else "sentence-transformers/all-MiniLM-L6-v2"
        return HuggingFaceEmbeddings(model_name=model_name)
    else:
        raise ValueError(f"Unsupported embedding provider: {settings.EMBEDDING_PROVIDER}")
