'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
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
    Loader2
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
}

interface Workspace {
    id: number
    name: string
    documents: Document[]
}

export default function StudyPage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string
    const workspaceId = Number(id)
    const [activeTab, setActiveTab] = useState('chat')
    const [workspace, setWorkspace] = useState<Workspace | null>(null)
    const [uploading, setUploading] = useState(false)
    const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
    const [hasApiKey, setHasApiKey] = useState(true)

    const fetchWorkspace = useCallback(async (signal?: AbortSignal) => {
        try {
            const res = await api.get(`/workspaces/${workspaceId}`, { signal })
            setWorkspace(res.data)
        } catch (err) {
            if (err instanceof Error && err.name === 'CanceledError') return
            console.error('Failed to fetch workspace', err)
        }

        try {
            const settingsRes = await api.get('/settings')
            setHasApiKey(!!settingsRes.data.openai_api_key)
        } catch (err) {
            console.error('Failed to fetch settings', err)
        }
    }, [workspaceId])

    useEffect(() => {
        const controller = new AbortController()
        fetchWorkspace(controller.signal)
        return () => controller.abort()
    }, [fetchWorkspace])

    const processingCount = workspace?.documents.filter(d => d.status === 'pending' || d.status === 'processing').length || 0

    useEffect(() => {
        if (!processingCount) return

        const controller = new AbortController()
        const interval = setInterval(() => fetchWorkspace(controller.signal), 3000)

        return () => {
            clearInterval(interval)
            controller.abort()
        }
    }, [processingCount, fetchWorkspace])

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            await api.post(`/workspaces/${workspaceId}/upload`, formData)
            fetchWorkspace()
        } catch (err) {
            console.error('Upload failed', err)
        } finally {
            setUploading(false)
        }
    }

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf': return <FileText className="w-4 h-4 text-red-500" />
            case 'docx': return <File className="w-4 h-4 text-blue-500" />
            case 'pptx': return <FileSpreadsheet className="w-4 h-4 text-orange-500" />
            case 'image': return <ImageIcon className="w-4 h-4 text-emerald-500" />
        }
    }

    const getFileUrl = (doc: Document) => {
        const filename = doc.file_path.split(/[\\/]/).pop()
        return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/files/${filename}`
    }

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100 font-sans relative">
            {/* Left: Workspace Manager */}
            <div className="w-1/2 p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/')}
                            className="text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-blue-600" />
                            {workspace?.name || 'Loading Workspace...'}
                        </h1>
                    </div>
                </div>

                <Card className="flex-1 bg-white overflow-hidden shadow-sm border-slate-200 flex flex-col">
                    <CardHeader className="border-b bg-slate-50/50 py-3 flex flex-row items-center justify-between">
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
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1"
                                asChild
                            >
                                <label htmlFor="workspace-upload" className="cursor-pointer">
                                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                                    Upload
                                </label>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-y-auto">
                        {!workspace ? (
                            <div className="p-8 text-center text-slate-400">Loading documents...</div>
                        ) : workspace.documents.length === 0 ? (
                            <div className="p-12 text-center">
                                <File className="w-12 h-12 mx-auto text-slate-200 mb-2" />
                                <p className="text-sm text-slate-500">No documents yet.</p>
                                <p className="text-xs text-slate-400">Upload PDF, Word, PPT or Images to start.</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {workspace?.documents.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer group"
                                        onClick={() => setPreviewDoc(doc)}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-slate-100 rounded group-hover:bg-blue-50 transition-colors">
                                                {getFileIcon(doc.file_type || 'default')}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-sm font-medium text-slate-900 truncate group-hover:text-blue-600 transition-colors">{doc.title}</p>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{doc.file_type || 'processing'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant={doc.status === 'completed' ? 'default' : 'secondary'}
                                                className={cn(
                                                    "text-[10px] h-5",
                                                    doc.status === 'completed' ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50" : "animate-pulse"
                                                )}
                                            >
                                                {doc.status}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Right: Learning Tools */}
            <div className="w-1/2 bg-white border-l shadow-xl shadow-slate-200/50 flex flex-col relative">
                {workspace && workspace.documents.filter(d => d.status === 'completed').length === 0 && (
                    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                        <div className="p-4 bg-blue-50 rounded-full mb-4">
                            <BrainCircuit className="w-10 h-10 text-blue-500 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">
                            {workspace.documents.length === 0
                                ? "Your Workspace is Empty"
                                : "Processing Documents..."}
                        </h3>
                        <p className="text-slate-600 max-w-md">
                            {workspace.documents.length === 0
                                ? "Upload your first PDF, Word, or PowerPoint file to start learning with AI. Your workspace will then be analyzed for context."
                                : "Our AI is currently analyzing your documents. This usually takes less than a minute. Once completed, all learning tools will be unlocked!"}
                        </p>
                        {workspace.documents.length === 0 && (
                            <Button className="mt-6 gap-2" asChild>
                                <label htmlFor="workspace-upload" className="cursor-pointer">
                                    <Plus className="w-4 h-4" />
                                    Upload Material
                                </label>
                            </Button>
                        )}
                    </div>
                )}

                {workspace && workspace.documents.filter(d => d.status === 'completed').length > 0 && !hasApiKey && (
                    <div className="absolute inset-0 z-[60] bg-white/60 backdrop-blur-[2px] flex items-center justify-center p-8">
                        <KeyWall
                            message="You've uploaded materials, but AI tools require an OpenAI API Key to analyze them. Please add your key in settings."
                            className="max-w-xl shadow-2xl border-amber-200"
                        />
                    </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                    <div className="border-b px-4 pt-3 bg-white">
                        <TabsList className="grid w-full grid-cols-6 mb-2">
                            {/* ... triggers ... */}
                            <TabsTrigger value="chat" className="flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Chat</TabsTrigger>
                            <TabsTrigger value="lesson" className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Lesson</TabsTrigger>
                            <TabsTrigger value="flashcards" className="flex items-center gap-2"><Layers className="w-4 h-4" /> Cards</TabsTrigger>
                            <TabsTrigger value="quiz" className="flex items-center gap-2"><BrainCircuit className="w-4 h-4" /> Quiz</TabsTrigger>
                            <TabsTrigger value="mindmap" className="flex items-center gap-2"><Network className="w-4 h-4" /> Map</TabsTrigger>
                            <TabsTrigger value="podcast" className="flex items-center gap-2"><Mic className="w-4 h-4" /> Podcast</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="chat" forceMount className={cn('flex-1 mt-0 overflow-hidden flex flex-col', activeTab !== 'chat' && 'hidden')}>
                        <ChatInterface workspaceId={workspaceId} />
                    </TabsContent>

                    <TabsContent value="lesson" forceMount className={cn('flex-1 mt-0 overflow-y-auto bg-slate-50/50', activeTab !== 'lesson' && 'hidden')}>
                        <LessonView workspaceId={workspaceId} />
                    </TabsContent>

                    <TabsContent value="flashcards" forceMount className={cn('flex-1 mt-0 overflow-y-auto bg-slate-50/50', activeTab !== 'flashcards' && 'hidden')}>
                        <FlashcardView workspaceId={workspaceId} />
                    </TabsContent>

                    <TabsContent value="quiz" forceMount className={cn('flex-1 mt-0 overflow-y-auto bg-slate-50/50', activeTab !== 'quiz' && 'hidden')}>
                        <QuizView workspaceId={workspaceId} />
                    </TabsContent>

                    <TabsContent value="mindmap" forceMount className={cn('flex-1 mt-0 overflow-y-auto bg-slate-50/50', activeTab !== 'mindmap' && 'hidden')}>
                        <MindMapView workspaceId={workspaceId} />
                    </TabsContent>

                    <TabsContent value="podcast" forceMount className={cn('flex-1 mt-0 overflow-y-auto bg-slate-50/50', activeTab !== 'podcast' && 'hidden')}>
                        <PodcastView workspaceId={workspaceId} />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Document Preview Overlay */}
            {previewDoc && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-8 animate-in fade-in duration-200" onClick={() => setPreviewDoc(null)}>
                    <Card className="w-full max-w-5xl h-full bg-white shadow-2xl flex flex-col overflow-hidden border-none" onClick={e => e.stopPropagation()}>
                        <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between bg-white shrink-0">
                            <div className="flex items-center gap-3 truncate">
                                <div className="p-2 bg-slate-50 rounded">
                                    {getFileIcon(previewDoc.file_type)}
                                </div>
                                <div className="truncate">
                                    <CardTitle className="text-base truncate">{previewDoc.title}</CardTitle>
                                    <p className="text-[10px] text-slate-500 font-mono">{previewDoc.status}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm" className="h-8 gap-2" asChild>
                                    <a href={getFileUrl(previewDoc)} target="_blank" rel="noopener noreferrer">
                                        <Plus className="w-3 h-3 rotate-45" /> Open in New Tab
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
                        <CardContent className="flex-1 p-0 bg-slate-50 overflow-hidden relative">
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
                                        <p className="text-slate-600 font-medium">{previewDoc.title}</p>
                                        <p className="text-sm">Preview not available for this file type.</p>
                                        <Button variant="outline" className="mt-4 gap-2" asChild>
                                            <a href={getFileUrl(previewDoc)} download>
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
