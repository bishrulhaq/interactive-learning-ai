import os
import io
from pathlib import Path
from kokoro_onnx import Kokoro
import soundfile as sf

# Paths to model + voices (resolved relative to backend/ for stability)
_BACKEND_DIR = Path(__file__).resolve().parents[1]  # backend/
_DEFAULT_MODEL = _BACKEND_DIR / "models" / "tts" / "kokoro-v1.0.onnx"
_DEFAULT_VOICES = _BACKEND_DIR / "models" / "tts" / "voices-v1.0.bin"

# Allow overrides (useful for different Kokoro versions / custom paths)
MODEL_PATH = os.getenv("KOKORO_MODEL_PATH", str(_DEFAULT_MODEL))
VOICES_PATH = os.getenv("KOKORO_VOICES_PATH", str(_DEFAULT_VOICES))

_kokoro = None


def get_kokoro():
    global _kokoro
    if _kokoro is None:
        missing = []
        if not os.path.exists(MODEL_PATH):
            missing.append(MODEL_PATH)
        if not os.path.exists(VOICES_PATH):
            missing.append(VOICES_PATH)
        if missing:
            raise FileNotFoundError(
                "Kokoro model files are missing:\n"
                + "\n".join(f"- {p}" for p in missing)
                + "\n\nExpected directory:\n"
                + str(Path(MODEL_PATH).parent)
            )
        try:
            _kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
        except Exception as e:
            # Common cause: corrupted / truncated ONNX download (InvalidProtobuf)
            def _size(p: str) -> str:
                try:
                    return f"{os.path.getsize(p) / 1024 / 1024:.1f} MB"
                except Exception:
                    return "unknown size"

            raise RuntimeError(
                "Failed to initialize Kokoro ONNX runtime.\n"
                f"- model: {MODEL_PATH} ({_size(MODEL_PATH)})\n"
                f"- voices: {VOICES_PATH} ({_size(VOICES_PATH)})\n\n"
                "This usually means the ONNX file is corrupted/truncated or not the expected model version.\n"
                "Fix: re-download the model/voices from a trusted source (e.g. Hugging Face onnx-community Kokoro ONNX),\n"
                "or set env vars KOKORO_MODEL_PATH and KOKORO_VOICES_PATH to point to valid files.\n\n"
                f"Underlying error: {e}"
            ) from e
    return _kokoro


def generate_speech(text: str, voice: str = "af_bella") -> io.BytesIO:
    """
    Generates speech from text and returns a BytesIO object containing the WAV data.
    """
    kokoro = get_kokoro()

    # Verify voice exists, fallback to first available if not
    available_voices = kokoro.get_voices()
    if voice not in available_voices:
        print(
            f"Warning: Voice {voice} not found. Falling back to {available_voices[0]}"
        )
        voice = available_voices[0]

    # Generate audio samples
    samples, sample_rate = kokoro.create(text, voice=voice, speed=1.0, lang="en-us")

    # Convert to WAV bytes
    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, format="WAV")
    buffer.seek(0)

    return buffer
