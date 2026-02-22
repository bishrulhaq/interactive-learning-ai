export interface Document {
    id: number
    title: string
    file_type: string
    status: string
    file_path: string
    error_message?: string
    embedding_provider?: string
    embedding_model?: string
}

export interface Workspace {
    id: number
    name: string
    documents: Document[]
    embedding_provider: string
    embedding_model: string
    llm_provider: string
    llm_model: string
    ollama_base_url: string
    created_at: string
}

export interface AppSettings {
    llm_provider?: string
    openai_api_key?: string
    openai_model?: string
    embedding_provider?: string
    embedding_model?: string
    ollama_base_url?: string
}
