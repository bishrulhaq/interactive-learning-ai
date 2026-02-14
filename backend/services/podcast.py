import os
import uuid
from sqlalchemy.orm import Session
import numpy as np
import soundfile as sf
from backend.services.rag import get_relevant_context
from backend.services.narration import get_kokoro
from backend.schemas import Podcast
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Storage for podcasts
PODCAST_STORAGE_DIR = "storage/audio/podcasts"
os.makedirs(PODCAST_STORAGE_DIR, exist_ok=True)

# In-memory progress cache: {podcast_id: {"progress": 0-100, "status": "synthesizing"|"complete"|"failed", "message": ""}}
synthesis_progress_cache = {}


def generate_podcast_script(
    topic: str,
    workspace_id: int,
    db: Session,
    podcast_type: str = "duo",
    voice_a: str = "af_bella",
    voice_b: str = "bm_lewis",
) -> Podcast:
    """
    Generates a conversational script based on the workspace context.
    """
    context = get_relevant_context(topic, workspace_id, db)

    from backend.services.generator import get_llm
    from backend.data.voices import get_voice_info

    llm = get_llm(db, workspace_id, temperature=0.7)

    parser = PydanticOutputParser(pydantic_object=Podcast)

    # Get voice names for the prompt
    voice_a_info = get_voice_info(voice_a)
    voice_b_info = get_voice_info(voice_b)
    speaker_a_name = voice_a_info["name"]
    speaker_b_name = voice_b_info["name"]

    if podcast_type == "duo":
        prompt_text = f"""
        You are a world-class podcast scriptwriter. 
        Create a conversational script for a podcast called "Deep Dive" based on the provided CONTEXT.
        
        The podcast features two speakers:
        1. {speaker_a_name} ({voice_a_info["gender"]}, voice: {voice_a}): The curious host who asks insightful questions and keeps the energy high.
        2. {speaker_b_name} ({voice_b_info["gender"]}, voice: {voice_b}): The expert who explains complex concepts in simple terms.
        
        The conversation should be engaging, natural, and educational. Use informal language, filler words (like 'Right', 'Interesting', 'Exactly'), and emotional reactions.
        
        IMPORTANT: Use "{speaker_a_name}" and "{speaker_b_name}" as the speaker names in the script.
        
        CONTEXT:
        {{context}}
        
        TOPIC: {{topic}}
        
        Format the output as a JSON matching the following schema:
        {{format_instructions}}
        """
    else:
        voice_info = get_voice_info(voice_a)
        speaker_name = voice_info["name"]
        prompt_text = f"""
        You are a world-class audiobook narrator. 
        Create a clear, engaging summary script based on the provided CONTEXT.
        
        The narrator is {speaker_name} ({voice_info["gender"]}, voice: {voice_a}).
        
        IMPORTANT: Use "{speaker_name}" as the speaker name in the script.
        
        CONTEXT:
        {{context}}
        
        TOPIC: {{topic}}
        
        Format the output as a JSON matching the following schema:
        {{format_instructions}}
        """

    prompt = ChatPromptTemplate.from_template(prompt_text)

    chain = prompt | llm | parser

    result = chain.invoke(
        {
            "context": context,
            "topic": topic,
            "format_instructions": parser.get_format_instructions(),
        }
    )

    return result


def synthesize_podcast_audio(podcast: Podcast, podcast_id: Optional[int] = None) -> str:
    """
    Synthesizes the entire podcast script into a single WAV file.
    Returns the relative path to the saved file.
    Optionally reports progress if podcast_id is provided.
    """
    # Initialize progress tracking
    if podcast_id:
        synthesis_progress_cache[podcast_id] = {
            "progress": 0,
            "status": "synthesizing",
            "message": "Starting synthesis...",
        }

    try:
        kokoro = get_kokoro()
        all_audio = []
        sample_rate = 24000  # Kokoro default
        total_items = len(podcast.script)

        for idx, item in enumerate(podcast.script):
            # Update progress
            if podcast_id:
                progress = int((idx / total_items) * 90)  # Reserve 10% for file saving
                synthesis_progress_cache[podcast_id] = {
                    "progress": progress,
                    "status": "synthesizing",
                    "message": f"Synthesizing dialogue {idx + 1}/{total_items}...",
                }

            # Generate samples for this line
            # Note: speed=1.1 or 1.2 often sounds more natural for conversation
            samples, sr = kokoro.create(
                item.text, voice=item.voice, speed=1.1, lang="en-us"
            )
            sample_rate = sr
            # Add a small silence (0.5s) between speakers
            silence = np.zeros(int(sample_rate * 0.5))
            all_audio.append(samples)
            all_audio.append(silence)

        # Update progress for file saving
        if podcast_id:
            synthesis_progress_cache[podcast_id] = {
                "progress": 90,
                "status": "synthesizing",
                "message": "Saving audio file...",
            }

        # Concatenate all parts
        final_audio = np.concatenate(all_audio)

        # Save to disk
        filename = f"podcast_{uuid.uuid4().hex}.wav"
        file_path = os.path.join(PODCAST_STORAGE_DIR, filename)

        sf.write(file_path, final_audio, sample_rate)

        # Mark as complete
        if podcast_id:
            synthesis_progress_cache[podcast_id] = {
                "progress": 100,
                "status": "complete",
                "message": "Synthesis complete!",
            }

        return f"audio/podcasts/{filename}"

    except Exception as e:
        logger.exception("Podcast synthesis failed")
        if podcast_id:
            synthesis_progress_cache[podcast_id] = {
                "progress": 0,
                "status": "failed",
                "message": f"Synthesis failed: {str(e)}",
            }
        raise
