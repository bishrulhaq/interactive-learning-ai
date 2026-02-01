from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from backend.core.config import settings

# Helper for psycopg2 to understand vector type if needed,
# but pgvector-python usually handles it via UserDefinedType or automatically with sqlalchemy-pgvector
# For now, standard create_engine.

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
