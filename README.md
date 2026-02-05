# Interactive Learning AI Platform

This is a Retrieval-Augmented Generation (RAG) app designed to help students and educators generate study materials from their own documents. Upload PDFs / Word / PowerPoint (and optionally images), then chat with your content and generate lesson plans, flashcards, quizzes, mindmaps, and podcasts.

## 🚀 Features

*   **Document ingestion**: Upload PDF/Word/PPT/Image documents which are chunked, embedded, and stored in Postgres (`pgvector`).
*   **Interactive Chat**: Ask questions and get answers based strictly on the content of your uploaded documents.
*   **Content Generation**:
    *   **Lesson Plans**: Generate structured lesson plans for specific topics.
    *   **Flashcards**: Create study flashcards (front/back) for revision.
    *   **Quizzes**: Generate multiple-choice quizzes to test knowledge.
    *   **Mindmaps**: Generate a concept map.
    *   **Podcasts**: Generate scripts + audio.
*   **Modern UI**: A responsive and beautiful interface built with Next.js and Tailwind CSS.

## 🛠️ Tech Stack

### Backend
*   **Framework**: FastAPI (Python)
*   **AI/LLM**: LangChain (OpenAI and/or Ollama)
*   **Database**: PostgreSQL with `pgvector`
*   **Embeddings**: OpenAI or Hugging Face (SentenceTransformers)
*   **Async processing**: Celery + Redis

### Frontend
*   **Framework**: Next.js (React)
*   **Styling**: Tailwind CSS, Lucide React
*   **Language**: TypeScript

## ⚡ Quick Start

To start the entire environment (Database, Backend, and Frontend) at once:

### Windows
1.  Open PowerShell in the project root.
2.  Run the starter script:
    ```powershell
    .\run-dev.ps1
    ```

### Linux
1.  Open a terminal in the project root.
2.  Run the starter script:
    ```bash
    ./dev.sh
    ```
    Or with sudo if Docker requires it:
    ```bash
    sudo ./dev.sh
    ```

Both scripts will automatically:
- Start PostgreSQL + Redis via Docker Compose
- Start FastAPI backend on `http://localhost:8000`
- Start Celery worker (used for document processing)
- Start Next.js frontend on `http://localhost:3000`

### Dev stability notes
- **Backend reload**: The scripts start Uvicorn with `--reload-dir backend` so editing `frontend/` won't constantly restart the backend (reduces "Backend Unreachable").
- **Worker logs**: Celery is started with `--logfile storage/logs/celery.log` so the UI can show worker output.
- **Linux permissions**: If Docker access is denied on Linux, the `dev.sh` script will automatically attempt to re-run with sudo. Alternatively, add your user to the docker group: `sudo usermod -aG docker $USER` (requires logout/login).
- **Virtual environment**: On Linux, `dev.sh` automatically creates and activates the Python virtual environment. On Windows, `run-dev.ps1` assumes the venv exists in `backend/venv`.

---

## ⚙️ Prerequisites

*   **Docker Desktop** (for the database)
*   **Python 3.12+** (3.13 works too)
*   **Node.js 18+**
*   **Ollama** (optional, for local LLM): install and run on `http://localhost:11434`

## 🔧 Provider setup (Settings UI)
Open `http://localhost:3000/settings`.

### Common configurations
- **OpenAI embeddings + Ollama LLM**
  - Requires **OpenAI API key** (for embeddings)
  - Requires **Ollama running** + **model pulled**

- **Hugging Face embeddings (local) + Ollama LLM**
  - No OpenAI key required (unless you upload images)
  - First run may download the embedding model and take time

### Image uploads
Image uploads currently require **OpenAI Vision** (an OpenAI API key). If you don’t have a key, upload PDF/Word/PPT instead.

## 🧠 Embeddings model changes + reprocessing
Embeddings from different models/providers are **not compatible**. If you change embedding settings, existing documents must be **re-processed**.

The backend will block chat/generation with an actionable error until you reprocess mismatched documents (refresh icon).

## 👀 Debugging: Queue and Worker Output in the UI
On a workspace page like `http://localhost:3000/study/1`:
- **Queue**: shows Celery active/reserved/scheduled tasks.
- **Output**: tails `storage/logs/celery.log` (worker logs + tracebacks).

If Output is empty, ensure the worker is running via `run-dev.ps1` (or start Celery with the logfile flag).

## ⚙️ Advanced: Hugging Face device selection (CPU/GPU)
The app auto-detects CUDA at runtime and will prefer GPU when available for Hugging Face embeddings.

- **Override**: set env var `RAG_HF_DEVICE=cpu|cuda|auto` (default `auto`)
- Settings page also displays detected device.

## Troubleshooting
### “Backend Unreachable” / Axios “Network Error”
- Backend is restarting (dev reload) or not running.
- Use the updated `run-dev.ps1` and avoid saving backend files during critical requests.
- Verify backend health at `http://localhost:8000/health`.

### Ollama `/api/chat` returns 500 (runner terminated)
- Usually wrong model name or insufficient RAM/VRAM.
- Pick a smaller model (e.g. `llama3.2:3b`) and pull it: `ollama pull llama3.2:3b`.