
import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    PROJECT_NAME: str = "RAG Educational Platform"
    PROJECT_VERSION: str = "1.0.0"

    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "password")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5300")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "rag_db")

    DATABASE_URL: str = (
    f"postgresql+psycopg2://{POSTGRES_USER}:"
    f"{POSTGRES_PASSWORD}@"
    f"{POSTGRES_SERVER}:"
    f"{POSTGRES_PORT}/"
    f"{POSTGRES_DB}"
)
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    # "openai" or "huggingface"
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "openai") 
    EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "text-embedding-3-small")

settings = Settings()
