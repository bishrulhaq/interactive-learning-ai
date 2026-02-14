from backend.database import engine
from sqlalchemy import text


def add_columns():
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # Check if vision columns exist, if not add them
            conn.execute(
                text(
                    "ALTER TABLE app_settings ADD COLUMN enable_vision_processing BOOLEAN DEFAULT TRUE"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE app_settings ADD COLUMN vision_provider VARCHAR DEFAULT 'openai'"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE app_settings ADD COLUMN ollama_vision_model VARCHAR DEFAULT 'llava'"
                )
            )
            trans.commit()
            print("Successfully added vision columns.")
        except Exception as e:
            trans.rollback()
            print(f"Failed (likely columns already exist): {e}")


if __name__ == "__main__":
    add_columns()
