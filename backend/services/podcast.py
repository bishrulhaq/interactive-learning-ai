import os
import uuid
from sqlalchemy.orm import Session
import numpy as np
import soundfile as sf
from backend.services.rag import get_relevant_context
from backend.services.narration import get_kokoro
from backend.schemas import Podcast
from backend.core.config import settings
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser

# Storage for podcasts
PODCAST_STORAGE_DIR = "storage/audio/podcasts"
os.makedirs(PODCAST_STORAGE_DIR, exist_ok=True)


def generate_podcast_script(
    topic: str, document_id: int, db: Session, podcast_type: str = "duo"
) -> Podcast:
    """
    Generates a conversational script based on the document context.
    """
    context = get_relevant_context(topic, document_id, db)

    llm = ChatOpenAI(
        model="gpt-4o", temperature=0.7, openai_api_key=settings.OPENAI_API_KEY
    )

    parser = PydanticOutputParser(pydantic_object=Podcast)

    if podcast_type == "duo":
        prompt_text = """
        You are a world-class podcast scriptwriter. 
        Create a conversational script for a podcast called "Deep Dive" based on the provided CONTEXT.
        
        The podcast features two speakers:
        1. Alex (Female, voice: af_bella): The curious host who asks insightful questions and keeps the energy high.
        2. Jamie (Male, voice: bm_lewis): The expert who explains complex concepts in simple terms.
        
        The conversation should be engaging, natural, and educational. Use informal language, filler words (like 'Right', 'Interesting', 'Exactly'), and emotional reactions.
        
        CONTEXT:
        {context}
        
        TOPIC: {topic}
        
        Format the output as a JSON matching the following schema:
        {format_instructions}
        """
    else:
        prompt_text = """
        You are a world-class audiobook narrator. 
        Create a clear, engaging summary script based on the provided CONTEXT.
        
        The narrator is Bella (Female, voice: af_bella).
        
        CONTEXT:
        {context}
        
        TOPIC: {topic}
        
        Format the output as a JSON matching the following schema:
        {format_instructions}
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


def synthesize_podcast_audio(podcast: Podcast) -> str:
    """
    Synthesizes the entire podcast script into a single WAV file.
    Returns the relative path to the saved file.
    """
    kokoro = get_kokoro()
    all_audio = []
    sample_rate = 24000  # Kokoro default

    for item in podcast.script:
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

    # Concatenate all parts
    final_audio = np.concatenate(all_audio)

    # Save to disk
    filename = f"podcast_{uuid.uuid4().hex}.wav"
    file_path = os.path.join(PODCAST_STORAGE_DIR, filename)

    sf.write(file_path, final_audio, sample_rate)

    return f"audio/podcasts/{filename}"
