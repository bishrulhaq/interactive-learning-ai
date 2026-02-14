'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import type { AxiosError } from 'axios'
import {
    FileText,
    MessageSquare,
    BookOpen,
    Layers,
    ArrowLeft,
    BrainCircuit,
    Network,
    Mic,
    Plus,
    File,
    Image as ImageIcon,
    FileSpreadsheet,
    Loader2,
    Sparkles,
    AlertCircle,
    InfoIcon,
    RotateCcw,
    XCircle,
    X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ChatInterface from '@/components/chat-interface'
import LessonView from '@/components/lesson-view'
import FlashcardView from '@/components/flashcard-view'
import QuizView from '@/components/quiz-view'
import MindMapView from '@/components/mindmap-view'
import PodcastView from '@/components/podcast-view'
import { KeyWall } from '@/components/KeyWall'

interface Document {
    id: number
    title: string
    file_type: string
    status: string
    file_path: string
    error_message?: string
    embedding_provider?: string
    embedding_model?: string
}

interface Workspace {
    id: number
    name: string
    documents: Document[]
    embedding_provider: string
    embedding_model: string
    llm_provider: string
    llm_model: string
    ollama_base_url: string
}

interface AppSettings {
    llm_provider?: string
    openai_api_key?: string
    openai_model?: string
    embedding_provider?: string
    embedding_model?: string
    ollama_base_url?: string
}

type ApiErrorData = {
    detail?: string
}

export default function StudyPage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string
    const workspaceId = Number(id)
    const [activeTab, setActiveTab] = useState('chat')
    const [workspace, setWorkspace] = useState<Workspace | null>(null)
    const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(
        null
    )
    const [uploading, setUploading] = useState(false)
    const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
    const [isAiReady, setIsAiReady] = useState(true)

    const fetchWorkspace = useCallback(
        async (signal?: AbortSignal) => {
            let currentWorkspace: Workspace | null = null

            try {
                const res = await api.get(`/workspaces/${workspaceId}`, {
                    signal
                })
                currentWorkspace = res.data
                setWorkspace(currentWorkspace)
            } catch (err) {
                if (err instanceof Error && err.name === 'CanceledError') return
                console.error('Failed to fetch workspace', err)
            }

            try {
                const settingsRes = await api.get('/settings')
                setGlobalSettings(settingsRes.data)
                const appSettings = settingsRes.data

                const llmProvider =
                    currentWorkspace?.llm_provider || appSettings.llm_provider
                const embedProvider =
                    currentWorkspace?.embedding_provider ||
                    appSettings.embedding_provider
                const apiKey = appSettings.openai_api_key
                const ollamaUrl =
                    currentWorkspace?.ollama_base_url ||
                    appSettings.ollama_base_url

                const llmReady =
                    llmProvider === 'openai' ? !!apiKey : !!ollamaUrl
                const embedReady = embedProvider === 'openai' ? !!apiKey : true

                setIsAiReady(llmReady && embedReady)
            } catch (err) {
                console.error('Failed to fetch settings', err)
            }
        },
        [workspaceId]
    )

    useEffect(() => {
        const controller = new AbortController()
        fetchWorkspace(controller.signal)
        return () => controller.abort()
    }, [fetchWorkspace])

    const processingCount =
        workspace?.documents.filter(
            (d) => d.status === 'pending' || d.status === 'processing'
        ).length || 0
    const embeddingProvider =
        workspace?.embedding_provider ||
        globalSettings?.embedding_provider ||
        'openai'
    const hasOpenAiKey = !!globalSettings?.openai_api_key

    useEffect(() => {
        if (!processingCount) return

        const controller = new AbortController()
        const interval = setInterval(
            () => fetchWorkspace(controller.signal),
            3000
        )

        return () => {
            clearInterval(interval)
            controller.abort()
        }
    }, [processingCount, fetchWorkspace])

    const [uploadError, setUploadError] = useState<string | null>(null)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
        if (isImage && !hasOpenAiKey) {
            setUploadError(
                'Image uploads currently require OpenAI Vision (API key). Add your key in Settings or upload a PDF/Word/PPT instead.'
            )
            if (e.target) e.target.value = ''
            return
        }

        setUploading(true)
        setUploadError(null)
        const formData = new FormData()
        formData.append('file', file)

        try {
            await api.post(`/workspaces/${workspaceId}/upload`, formData)
            fetchWorkspace()
        } catch (err: unknown) {
            console.error('Upload failed', err)

            const backend = api.defaults.baseURL || 'http://localhost:8000'
            const axiosErr = err as AxiosError<ApiErrorData>
            const serverDetail = axiosErr.response?.data?.detail
            const status = axiosErr.response?.status

            // Axios network errors often have no `response`
            if (!axiosErr.response) {
                const msg = axiosErr.message ? ` (${axiosErr.message})` : ''
                setUploadError(
                    `Could not reach backend at ${backend}. Is it running?${msg}`
                )
                return
            }

            const detail =
                (typeof serverDetail === 'string' && serverDetail) ||
                (status ? `Upload failed (HTTP ${status}).` : null) ||
                'An unexpected error occurred during upload.'

            setUploadError(detail)
        } finally {
            setUploading(false)
            // Reset the input so the same file can be uploaded again if needed
            if (e.target) e.target.value = ''
        }
    }

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf':
                return <FileText className="w-4 h-4 text-red-500" />
            case 'docx':
                return <File className="w-4 h-4 text-blue-500" />
            case 'pptx':
                return <FileSpreadsheet className="w-4 h-4 text-orange-500" />
            case 'image':
                return <ImageIcon className="w-4 h-4 text-emerald-500" />
        }
    }

    const handleDeleteDocument = async (docId: number) => {
        if (
            !confirm(
                'Are you sure you want to delete this document? All associated learning content will remain, but chat search will no longer include this document.'
            )
        )
            return
        try {
            await api.delete(`/documents/${docId}`)
            fetchWorkspace()
        } catch (err) {
            console.error('Delete failed', err)
        }
    }

    const handleReprocess = async (docId: number) => {
        try {
            await api.post(`/documents/${docId}/reprocess`)
            fetchWorkspace()
        } catch (err) {
            console.error('Reprocess failed', err)
        }
    }

    const getFileUrl = (doc: Document) => {
        const filename = doc.file_path.split(/[\\/]/).pop()
        return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/files/${filename}`
    }

    return (
        <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans relative">
            {/* Left: Workspace Manager */}
            <div className="w-1/2 p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/')}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div className="flex flex-col">
                            <h1 className="font-bold text-lg flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-blue-600" />
                                {workspace?.name || 'Loading Workspace...'}
                            </h1>
                            {workspace && (
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-2 bg-blue-50/50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-200 border-blue-100 dark:border-blue-400/30 flex items-center gap-1"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        {workspace.llm_provider ||
                                            globalSettings?.llm_provider ||
                                            'openai'}
                                        :{' '}
                                        {workspace.llm_model ||
                                            globalSettings?.openai_model ||
                                            'gpt-4o'}
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-2 bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-200 border-indigo-100 dark:border-indigo-400/30 flex items-center gap-1"
                                    >
                                        <Layers className="w-3 h-3" />
                                        {workspace.embedding_provider ||
                                            globalSettings?.embedding_provider ||
                                            'openai'}
                                        :{' '}
                                        {(
                                            workspace.embedding_model ||
                                            globalSettings?.embedding_model ||
                                            'text-embedding-3-small'
                                        )
                                            .split('/')
                                            .pop()}
                                    </Badge>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <Card className="flex-1 overflow-hidden shadow-sm flex flex-col">
                    <CardHeader className="border-b border-border bg-muted/40 py-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            Workspace Documents
                        </CardTitle>
                        <div className="relative">
                            <input
                                type="file"
                                id="workspace-upload"
                                className="hidden"
                                onChange={handleFileUpload}
                                disabled={uploading}
                            />
                            {isAiReady && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 gap-1"
                                    asChild
                                >
                                    <label
                                        htmlFor="workspace-upload"
                                        className="cursor-pointer"
                                    >
                                        {uploading ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Plus className="w-3 h-3" />
                                        )}
                                        Upload
                                    </label>
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    {uploadError && (
                        <div className="bg-red-50 border-b border-red-100 p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-red-800">
                                    Upload Failed
                                </p>
                                <p className="text-xs text-red-600/80">
                                    {uploadError}
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setUploadError(null)}
                                className="h-6 w-6 p-0 hover:bg-red-100/50 text-red-500"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                    {processingCount > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                            <InfoIcon className="w-4 h-4 text-blue-600 dark:text-blue-200 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-blue-900">
                                    Processing in progress
                                </p>
                                <p className="text-xs text-blue-700/80 dark:text-blue-200/80">
                                    This can take a few minutes. If you&apos;re
                                    using Hugging Face embeddings for the first
                                    time, the model may download and take
                                    longer.
                                </p>
                            </div>
                        </div>
                    )}
                    <CardContent className="p-0 flex-1 overflow-y-auto">
                        {!workspace ? (
                            <div className="p-8 text-center text-muted-foreground">
                                Loading documents...
                            </div>
                        ) : workspace.documents.length === 0 ? (
                            <div className="p-12 text-center">
                                <File className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                                <p className="text-sm text-muted-foreground">
                                    No documents yet.
                                </p>
                                <p className="text-xs text-muted-foreground/80">
                                    Upload PDF, Word, PPT or Images to start.
                                </p>
                                <p className="text-[11px] text-muted-foreground/80 mt-2">
                                    {embeddingProvider === 'huggingface'
                                        ? 'First-time Hugging Face embeddings may download a model in the background (slower on first run).'
                                        : 'If Embedding Provider is OpenAI, you need a valid OpenAI API key.'}
                                </p>
                                <p className="text-[11px] text-muted-foreground/80 mt-1">
                                    Note: Image uploads currently require OpenAI
                                    Vision (API key).
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {workspace?.documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="p-4 flex items-center justify-between hover:bg-accent/40 transition-colors cursor-pointer group"
                                        onClick={() => setPreviewDoc(doc)}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-muted rounded group-hover:bg-blue-500/10 transition-colors">
                                                {getFileIcon(
                                                    doc.file_type || 'default'
                                                )}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-sm font-medium truncate group-hover:text-blue-600 transition-colors">
                                                    {doc.title}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                                    {doc.file_type ||
                                                        'processing'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <div className="flex items-center gap-1">
                                                {doc.status === 'completed' && (
                                                    <div
                                                        className={cn(
                                                            'text-[9px] px-1.5 py-0.5 rounded-full border flex items-center gap-1',
                                                            doc.embedding_model ===
                                                                (workspace.embedding_model ||
                                                                    globalSettings?.embedding_model ||
                                                                    'text-embedding-3-small')
                                                                ? 'bg-slate-50 text-slate-500 border-slate-100'
                                                                : 'bg-amber-50 text-amber-600 border-amber-100'
                                                        )}
                                                    >
                                                        {doc.embedding_model
                                                            ?.split('/')
                                                            .pop() || 'unknown'}
                                                        {doc.embedding_model !==
                                                            (workspace.embedding_model ||
                                                                globalSettings?.embedding_model ||
                                                                'text-embedding-3-small') && (
                                                            <AlertCircle className="w-2 h-2" />
                                                        )}
                                                    </div>
                                                )}
                                                <Badge
                                                    variant={
                                                        doc.status ===
                                                        'completed'
                                                            ? 'default'
                                                            : doc.status ===
                                                                'failed'
                                                              ? 'destructive'
                                                              : 'secondary'
                                                    }
                                                    className={cn(
                                                        'text-[10px] h-5',
                                                        doc.status ===
                                                            'completed'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50'
                                                            : doc.status ===
                                                                'failed'
                                                              ? 'bg-red-50 text-red-700 border-red-100'
                                                              : 'animate-pulse'
                                                    )}
                                                >
                                                    {doc.status}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {doc.status !== 'completed' &&
                                                    doc.status !== 'pending' &&
                                                    doc.status !==
                                                        'processing' && (
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-6 w-6 text-slate-400 hover:text-blue-600"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleReprocess(
                                                                    doc.id
                                                                )
                                                            }}
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
                                                        </Button>
                                                    )}
                                                {doc.embedding_model !==
                                                    (workspace.embedding_model ||
                                                        globalSettings?.embedding_model ||
                                                        'text-embedding-3-small') &&
                                                    doc.status ===
                                                        'completed' && (
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            title="Re-process with current model"
                                                            className="h-6 w-6 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                handleReprocess(
                                                                    doc.id
                                                                )
                                                            }}
                                                        >
                                                            <RotateCcw className="w-3 h-3" />
                                                        </Button>
                                                    )}
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 text-slate-400 hover:text-red-600"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDeleteDocument(
                                                            doc.id
                                                        )
                                                    }}
                                                >
                                                    <XCircle className="w-3 h-3" />
                                                </Button>
                                            </div>

                                            {doc.status === 'failed' &&
                                                doc.error_message && (
                                                    <div
                                                        className="flex items-center gap-1 text-[9px] text-red-500 font-medium max-w-[120px] truncate"
                                                        title={
                                                            doc.error_message
                                                        }
                                                    >
                                                        <AlertCircle className="w-2 h-2" />
                                                        {doc.error_message}
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Right: Learning Tools */}
            <div className="w-1/2 bg-card border-l border-border shadow-xl shadow-black/5 dark:shadow-black/30 flex flex-col relative">
                {workspace &&
                    workspace.documents.filter((d) => d.status === 'completed')
                        .length === 0 && (
                        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                            <div className="p-4 bg-blue-500/10 rounded-full mb-4">
                                <BrainCircuit className="w-10 h-10 text-blue-500 animate-pulse" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">
                                {workspace.documents.length === 0
                                    ? 'Your Workspace is Empty'
                                    : 'Processing Documents...'}
                            </h3>
                            <p className="text-muted-foreground max-w-md">
                                {workspace.documents.length === 0
                                    ? 'Upload your first PDF, Word, or PowerPoint file to start learning with AI. Your workspace will then be analyzed for context.'
                                    : 'Our AI is currently analyzing your documents. This usually takes less than a minute. Once completed, all learning tools will be unlocked!'}
                            </p>
                            {workspace.documents.length === 0 && isAiReady && (
                                <Button className="mt-6 gap-2" asChild>
                                    <label
                                        htmlFor="workspace-upload"
                                        className="cursor-pointer"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Upload Material
                                    </label>
                                </Button>
                            )}
                            {workspace.documents.length === 0 && !isAiReady && (
                                <div className="mt-6">
                                    <KeyWall
                                        message="To start learning, you'll need to upload documents. Please configure your AI settings first."
                                        className="max-w-md mx-auto"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                {workspace &&
                    workspace.documents.filter((d) => d.status === 'completed')
                        .length > 0 &&
                    !isAiReady && (
                        <div className="absolute inset-0 z-[60] bg-background/60 backdrop-blur-[2px] flex items-center justify-center p-8">
                            <KeyWall
                                message="You've uploaded materials, but AI tools require proper configuration to analyze them. Please check your settings."
                                className="max-w-xl shadow-2xl border-amber-200"
                            />
                        </div>
                    )}

                <Tabs
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="flex flex-col h-full"
                >
                    <div className="border-b border-border px-4 pt-3 bg-card">
                        <TabsList className="grid w-full grid-cols-7 mb-2">
                            {/* ... triggers ... */}
                            <TabsTrigger
                                value="chat"
                                className="flex items-center gap-2"
                            >
                                <MessageSquare className="w-4 h-4" /> Chat
                            </TabsTrigger>
                            <TabsTrigger
                                value="lesson"
                                className="flex items-center gap-2"
                            >
                                <BookOpen className="w-4 h-4" /> Lesson
                            </TabsTrigger>
                            <TabsTrigger
                                value="flashcards"
                                className="flex items-center gap-2"
                            >
                                <Layers className="w-4 h-4" /> Cards
                            </TabsTrigger>
                            <TabsTrigger
                                value="quiz"
                                className="flex items-center gap-2"
                            >
                                <BrainCircuit className="w-4 h-4" /> Quiz
                            </TabsTrigger>
                            <TabsTrigger
                                value="mindmap"
                                className="flex items-center gap-2"
                            >
                                <Network className="w-4 h-4" /> Map
                            </TabsTrigger>
                            <TabsTrigger
                                value="podcast"
                                className="flex items-center gap-2"
                            >
                                <Mic className="w-4 h-4" /> Podcast
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent
                        value="chat"
                        className="flex-1 mt-0 overflow-hidden flex flex-col"
                    >
                        {activeTab === 'chat' ? (
                            <ChatInterface workspaceId={workspaceId} />
                        ) : null}
                    </TabsContent>

                    <TabsContent
                        value="lesson"
                        className="flex-1 mt-0 overflow-y-auto bg-muted/30"
                    >
                        {activeTab === 'lesson' ? (
                            <LessonView workspaceId={workspaceId} />
                        ) : null}
                    </TabsContent>

                    <TabsContent
                        value="flashcards"
                        className="flex-1 mt-0 overflow-y-auto bg-muted/30"
                    >
                        {activeTab === 'flashcards' ? (
                            <FlashcardView workspaceId={workspaceId} />
                        ) : null}
                    </TabsContent>

                    <TabsContent
                        value="quiz"
                        className="flex-1 mt-0 overflow-y-auto bg-muted/30"
                    >
                        {activeTab === 'quiz' ? (
                            <QuizView workspaceId={workspaceId} />
                        ) : null}
                    </TabsContent>

                    <TabsContent
                        value="mindmap"
                        className="flex-1 mt-0 overflow-y-auto bg-muted/30"
                    >
                        {activeTab === 'mindmap' ? (
                            <MindMapView workspaceId={workspaceId} />
                        ) : null}
                    </TabsContent>

                    <TabsContent
                        value="podcast"
                        className="flex-1 mt-0 overflow-y-auto bg-muted/30"
                    >
                        {activeTab === 'podcast' ? (
                            <PodcastView workspaceId={workspaceId} />
                        ) : null}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Document Preview Overlay */}
            {previewDoc && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-8 animate-in fade-in duration-200"
                    onClick={() => setPreviewDoc(null)}
                >
                    <Card
                        className="w-full max-w-5xl h-full bg-card shadow-2xl flex flex-col overflow-hidden border-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between bg-card shrink-0">
                            <div className="flex items-center gap-3 truncate">
                                <div className="p-2 bg-muted/40 rounded">
                                    {getFileIcon(previewDoc.file_type)}
                                </div>
                                <div className="truncate">
                                    <CardTitle className="text-base truncate">
                                        {previewDoc.title}
                                    </CardTitle>
                                    <p className="text-[10px] text-muted-foreground font-mono">
                                        {previewDoc.status}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-2"
                                    asChild
                                >
                                    <a
                                        href={getFileUrl(previewDoc)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <Plus className="w-3 h-3 rotate-45" />{' '}
                                        Open in New Tab
                                    </a>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-red-50 hover:text-red-500 rounded-full"
                                    onClick={() => setPreviewDoc(null)}
                                >
                                    <Plus className="w-5 h-5 rotate-45" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-0 bg-muted/30 overflow-hidden relative">
                            {previewDoc.file_type === 'pdf' ? (
                                <iframe
                                    src={`${getFileUrl(previewDoc)}#toolbar=0`}
                                    className="w-full h-full border-none"
                                />
                            ) : previewDoc.file_type === 'image' ? (
                                <div className="w-full h-full flex items-center justify-center p-4">
                                    <div className="relative w-full h-full">
                                        <Image
                                            src={getFileUrl(previewDoc)}
                                            alt={previewDoc.title}
                                            fill
                                            className="object-contain shadow-lg rounded-sm"
                                            unoptimized
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                                    <div className="p-6 bg-slate-100 rounded-full">
                                        {getFileIcon(previewDoc.file_type)}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-slate-600 font-medium">
                                            {previewDoc.title}
                                        </p>
                                        <p className="text-sm">
                                            Preview not available for this file
                                            type.
                                        </p>
                                        <Button
                                            variant="outline"
                                            className="mt-4 gap-2"
                                            asChild
                                        >
                                            <a
                                                href={getFileUrl(previewDoc)}
                                                download
                                            >
                                                Download to View
                                            </a>
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
