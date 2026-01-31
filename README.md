# Interactive Learning AI Platform

This is a Retrieval-Augmented Generation (RAG) application designed to help students and educators generate study materials from their own documents. By uploading PDF textbooks or lecture notes, the system enables users to chat with their content and automatically generate structured lesson plans, flashcards, and quizzes.

## 🚀 Features

*   **Document Ingestion**: Upload PDF documents which are automatically chunked, embedded, and stored in a vector database.
*   **Interactive Chat**: Ask questions and get answers based strictly on the content of your uploaded documents.
*   **Content Generation**:
    *   **Lesson Plans**: Generate structured lesson plans for specific topics.
    *   **Flashcards**: Create study flashcards (front/back) for revision.
    *   **Quizzes**: Generate multiple-choice quizzes to test knowledge.
*   **Modern UI**: A responsive and beautiful interface built with Next.js and Tailwind CSS.

## 🛠️ Tech Stack

### Backend
*   **Framework**: FastAPI (Python)
*   **AI/LLM**: LangChain, OpenAI GPT-4o
*   **Database**: PostgreSQL with `pgvector`
*   **Embeddings**: OpenAI Embeddings (configurable)

### Frontend
*   **Framework**: Next.js (React)
*   **Styling**: Tailwind CSS, Lucide React
*   **Language**: TypeScript

## ⚙️ Prerequisites

*   **Docker Desktop** (for the database)
*   **Python 3.10+**
*   **Node.js 18+**