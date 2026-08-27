from typing import List, Optional

# pyrefly: ignore [missing-import]
from pydantic import BaseModel, EmailStr, Field


# --- Auth -------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class RegisterResponse(BaseModel):
    recovery_key: str
    message: str = "Account created. Store the recovery key safely -- it is shown only once."


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RecoverRequest(BaseModel):
    email: EmailStr
    recovery_key: str
    new_password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Subjects / Documents -----------------------------------------------------

class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class SubjectOut(BaseModel):
    id: int
    name: str
    document_count: int
    storage_used_mb: float
    storage_limit_mb: int
    overall_mastery: float


class DocumentOut(BaseModel):
    id: int
    subject_id: int
    filename: str
    file_size_bytes: int
    page_count: Optional[int]
    chunk_count: int
    status: str


# --- RAG Query -----------------------------------------------------------------

class QueryRequest(BaseModel):
    subject_id: int
    document_id: int
    question: str = Field(min_length=1, max_length=2000)
    document_ids: Optional[List[int]] = None  # checklist filter — scoped doc IDs


class SourceChunk(BaseModel):
    document: str
    snippet: str
    score: float


class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceChunk]


class ChatMessageOut(BaseModel):
    id: int
    role: str          # 'user' | 'assistant'
    content: str
    sources: Optional[List[SourceChunk]] = None
    created_at: str


# --- Quiz ------------------------------------------------------------------------

class QuizGenerateRequest(BaseModel):
    subject_id: int
    topic: str
    num_questions: int = Field(default=5, ge=1, le=20)
    difficulty: str = Field(default="Mixed")
    document_ids: Optional[List[int]] = None  # checklist filter — scoped doc IDs


class QuizOption(BaseModel):
    id: str
    text: str


class QuizQuestion(BaseModel):
    question: str
    source_document: Optional[str] = None
    options: List[QuizOption]
    correct_option_id: str
    explanation: str


class QuizGenerateResponse(BaseModel):
    topic: str
    questions: List[QuizQuestion]


class QuizAnswer(BaseModel):
    question_index: int
    selected_option_id: str
    correct_option_id: str


class QuizSubmitRequest(BaseModel):
    subject_id: int
    topic: str
    answers: List[QuizAnswer]


class QuizSubmitResponse(BaseModel):
    score: float
    correct_count: int
    total_count: int
    mastery_score: float
    is_weak: bool


# --- Analytics ---------------------------------------------------------------

class WeakTopic(BaseModel):
    topic: str
    subject: str
    mastery_score: float


class DashboardOut(BaseModel):
    overall_mastery: float
    weak_topics: List[WeakTopic]
    document_count: int


class QuizHistoryEntry(BaseModel):
    date: str
    subject: str
    topic: str
    score: float


class AnalyticsOverviewOut(BaseModel):
    total_subjects: int
    total_documents: int
    total_quizzes_taken: int
    average_quiz_score: float
    quiz_score_trend: List[QuizHistoryEntry]
    strong_count: int
    good_count: int
    weak_count: int
