import os
import io
from kokoro_onnx import Kokoro
import soundfile as sf

# Path to model and voices
MODEL_PATH = "backend/models/tts/kokoro-v0_19.onnx"
VOICES_PATH = "backend/models/tts/voices.bin"

_kokoro = None


def get_kokoro():
    global _kokoro
    if _kokoro is None:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(VOICES_PATH):
            raise FileNotFoundError(
                f"Kokoro model files not found in {os.path.dirname(MODEL_PATH)}"
            )
        _kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
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
