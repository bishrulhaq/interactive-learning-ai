import os
from typing import Optional, Tuple

from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr
from sqlalchemy.orm import Session

from backend.models import Workspace

SUPPORTED_DIMS = [384, 768, 1024, 1536]

# Known dimensions for OpenAI embedding models (we only support dims with DB columns).
OPENAI_EMBED_DIMS = {
    "text-embedding-3-small": 1536,
    "text-embedding-ada-002": 1536,
}


def resolve_openai_embedding_dim(model_name: str) -> int:
    """
    Resolve embedding dimension for a given OpenAI embedding model name.
    Defaults to 1536 for unknown models, but we still validate against SUPPORTED_DIMS.
    """
    return OPENAI_EMBED_DIMS.get(model_name, 1536)


def get_embeddings_model(
    db: Session, workspace_id: Optional[int] = None
) -> Tuple[Embeddings, int, str, str]:
    """
    Factory to return the configured embedding model and its dimension.
    Returns: (model_instance, dimension, provider, model_name)
    """
    # Fetch global fallbacks from database
    from backend.services.settings import get_app_settings

    settings_db = get_app_settings(db)

    provider = settings_db.embedding_provider
    model_name = settings_db.embedding_model
    api_key = settings_db.openai_api_key

    if workspace_id:
        workspace = db.get(Workspace, workspace_id)
        if workspace:
            if workspace.embedding_provider:
                provider = workspace.embedding_provider
            if workspace.embedding_model:
                model_name = workspace.embedding_model
            # Note: We still use global API key for OpenAI unless we add per-workspace keys

    if provider == "openai":
        if not api_key:
            raise ValueError(
                "OpenAI API key is missing. Please add it in Settings or switch embedding provider to Hugging Face."
            )

        dim = resolve_openai_embedding_dim(model_name)
        if dim not in SUPPORTED_DIMS:
            raise ValueError(
                f"OpenAI embedding model '{model_name}' has {dim} dimensions which is not supported. "
                f"Supported dimensions are: {', '.join(map(str, SUPPORTED_DIMS))}."
            )

        openai_embeddings: Embeddings = OpenAIEmbeddings(
            model=model_name, api_key=SecretStr(api_key)
        )
        return (openai_embeddings, dim, provider, model_name)
    elif provider == "huggingface":
        # Uses local sentence-transformers models
        mn = model_name if model_name else "sentence-transformers/all-MiniLM-L6-v2"

        print(f"--- Initializing Hugging Face model: {mn} ---")
        print("Note: If this is the first time, it may take a few minutes to download.")

        # Device selection:
        # - default "auto" (prefer CUDA if available)
        # - override with env var: RAG_HF_DEVICE=cpu|cuda|auto
        device_pref = (os.getenv("RAG_HF_DEVICE") or "auto").strip().lower()
        device = "cpu"
        if device_pref != "cpu":
            try:
                import torch

                if device_pref == "cuda" or (
                    device_pref == "auto" and torch.cuda.is_available()
                ):
                    device = "cuda"
            except Exception:
                device = "cpu"

        try:
            # NOTE:
            # `langchain_huggingface.HuggingFaceEmbeddings` passes `model_kwargs` directly to
            # `SentenceTransformer(...)`. Only pass kwargs that SentenceTransformer accepts.
            #
            # We force CPU here because many Windows setups don't have CUDA, and some models
            # can crash if device inference / offload misbehaves.
            hf_embeddings: Embeddings = HuggingFaceEmbeddings(
                model_name=mn,
                model_kwargs={"device": device},
            )
        except Exception as e:
            # Retry without model_kwargs (some versions may not accept `device`).
            try:
                hf_embeddings = HuggingFaceEmbeddings(model_name=mn)
            except Exception:
                raise ValueError(
                    "Failed to initialize Hugging Face embeddings. "
                    f"Underlying error: {e}. "
                    "If this is your first run, wait for the model download to finish. "
                    "If you see a PyTorch 'meta tensor' error, try switching Embedding Provider to OpenAI, "
                    "or reinstall a compatible CPU-only PyTorch build."
                ) from e
        # Dynamically get dimension from the model itself
        # Some versions use .client, others use ._client
        client = getattr(
            hf_embeddings, "client", getattr(hf_embeddings, "_client", None)
        )
        if client is None:
            raise ValueError(
                "Could not access the underlying SentenceTransformer client."
            )

        dim = client.get_sentence_embedding_dimension()

        if dim not in SUPPORTED_DIMS:
            raise ValueError(
                f"Model '{mn}' has {dim} dimensions, which is not supported. "
                f"Supported dimensions are: {', '.join(map(str, SUPPORTED_DIMS))}"
            )

        return hf_embeddings, dim, provider, mn
    else:
        raise ValueError(f"Unsupported embedding provider: {provider}")
