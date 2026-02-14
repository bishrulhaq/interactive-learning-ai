"""
Centralized voice configuration for TTS voices.
Maps voice IDs to display names and genders for use in podcast and voice chat features.
"""

from typing import Dict, TypedDict


class VoiceInfo(TypedDict):
    name: str
    gender: str  # "male", "female", or "other"


# Voice configuration mapping voice IDs to metadata
VOICE_CONFIG: Dict[str, VoiceInfo] = {
    # American Female voices (af_)
    "af_bella": {"name": "Bella", "gender": "female"},
    "af_nicole": {"name": "Nicole", "gender": "female"},
    "af_sarah": {"name": "Sarah", "gender": "female"},
    "af_sky": {"name": "Sky", "gender": "female"},
    # American Male voices (am_)
    "am_adam": {"name": "Adam", "gender": "male"},
    "am_michael": {"name": "Michael", "gender": "male"},
    # British Female voices (bf_)
    "bf_emma": {"name": "Emma", "gender": "female"},
    "bf_isabella": {"name": "Isabella", "gender": "female"},
    # British Male voices (bm_)
    "bm_george": {"name": "George", "gender": "male"},
    "bm_lewis": {"name": "Lewis", "gender": "male"},
}


def get_voice_info(voice_id: str) -> VoiceInfo:
    """
    Get voice metadata for a given voice ID.
    Falls back to inferring from voice ID prefix if not in config.
    """
    if voice_id in VOICE_CONFIG:
        return VOICE_CONFIG[voice_id]

    # Infer from voice ID prefix
    prefix = voice_id[:3].lower() if len(voice_id) >= 3 else ""
    if prefix.startswith("af") or prefix.startswith("bf"):
        gender = "female"
    elif prefix.startswith("am") or prefix.startswith("bm"):
        gender = "male"
    else:
        gender = "other"

    # Generate a display name from the voice ID
    # Remove prefix like "af_", "bm_", etc.
    name_part = voice_id
    if len(voice_id) > 3 and voice_id[2] == "_":
        name_part = voice_id[3:]

    # Capitalize and replace underscores with spaces
    name = " ".join(word.capitalize() for word in name_part.split("_"))

    return {"name": name, "gender": gender}


def get_all_voices_with_info(voice_ids: list[str]) -> list[dict]:
    """
    Get a list of voice info dicts including the voice ID.
    """
    result = []
    for voice_id in voice_ids:
        info = get_voice_info(voice_id)
        result.append(
            {
                "id": voice_id,
                "name": info["name"],
                "gender": info["gender"],
            }
        )
    return result
