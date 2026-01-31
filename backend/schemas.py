from pydantic import BaseModel
from typing import List


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


class Podcast(BaseModel):
    topic: str
    script: List[PodcastDialogueItem]
    audio_path: str = ""
