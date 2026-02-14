from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class GenerateRequest(BaseModel):
    workspace_id: int
    topic: str


class WorkspaceCreate(BaseModel):
    name: str


class DocumentOut(BaseModel):
    id: int
    workspace_id: int
    title: str
    file_path: str
    file_type: Optional[str]
    status: str
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkspaceOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    # Workspace-specific AI Settings
    embedding_provider: Optional[str] = "openai"
    embedding_model: Optional[str] = "text-embedding-3-small"
    llm_provider: Optional[str] = "openai"
    llm_model: Optional[str] = "gpt-4o"
    ollama_base_url: Optional[str] = "http://localhost:11434"

    class Config:
        from_attributes = True


class WorkspaceDetailOut(WorkspaceOut):
    documents: List[DocumentOut]


class Flashcard(BaseModel):
    front: str
    back: str


class FlashcardSet(BaseModel):
    cards: List[Flashcard]


class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    correct_answer_index: int
    explanation: str


class Quiz(BaseModel):
    title: str
    questions: List[QuizQuestion]


class LessonSection(BaseModel):
    title: str
    content: str
    key_points: List[str]


class LessonPlan(BaseModel):
    topic: str
    sections: List[LessonSection]
    audio_path: Optional[str] = None


class MindMapNode(BaseModel):
    id: str
    label: str
    type: str = "default"  # input, output, default


class MindMapEdge(BaseModel):
    source: str
    target: str
    label: str = ""


class MindMap(BaseModel):
    nodes: List[MindMapNode]
    edges: List[MindMapEdge]


class PodcastDialogueItem(BaseModel):
    speaker: str
    text: str
    voice: str
    voice_name: str = ""
    gender: str = ""


class Podcast(BaseModel):
    topic: str
    script: List[PodcastDialogueItem]
    audio_path: str = ""
    id: Optional[int] = None
    voice_a: Optional[str] = None
    voice_b: Optional[str] = None
    created_at: Optional[datetime] = None


class AppSettings(BaseModel):
    llm_provider: Optional[str] = "openai"
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = "gpt-4o"
    embedding_provider: Optional[str] = "openai"
    embedding_model: Optional[str] = "text-embedding-3-small"
    ollama_base_url: Optional[str] = "http://localhost:11434"
    enable_vision_processing: Optional[bool] = True
    vision_provider: Optional[str] = "openai"
    ollama_vision_model: Optional[str] = "llava"
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AppSettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_model: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    ollama_base_url: Optional[str] = None
    enable_vision_processing: Optional[bool] = None
    vision_provider: Optional[str] = None
    ollama_vision_model: Optional[str] = None
