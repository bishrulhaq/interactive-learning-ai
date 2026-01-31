'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useParams, useRouter } from 'next/navigation'
import {
    FileText,
    MessageSquare,
    BookOpen,
    Layers,
    ArrowLeft,
    BrainCircuit
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ChatInterface from '@/components/chat-interface'
import LessonView from '@/components/lesson-view'
import FlashcardView from '@/components/flashcard-view'
import QuizView from '@/components/quiz-view'

interface Document {
    id: number
    title: string
    file_path: string
}

export default function StudyPage() {
    const router = useRouter()
    const params = useParams()
    const id = params.id as string
    const [document, setDocument] = useState<Document | null>(null)

    useEffect(() => {
        api.get(`/documents/${id}`).then((res) => setDocument(res.data))
    }, [id])

    const getPdfUrl = (path: string) => {
        if (!path) return ''
        const filename = path.split('\\').pop()?.split('/').pop()
        return `http://localhost:8000/files/${filename}`
    }

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">
            {/* Left: Document View */}
            <div className="w-1/2 p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.back()}
                            className="text-slate-500 hover:text-slate-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            {document?.title || 'Loading...'}
                        </h1>
                    </div>
                    <Badge variant="outline" className="bg-white">
                        ID: {id}
                    </Badge>
                </div>
                <Card className="flex-1 bg-white overflow-hidden shadow-sm border-slate-200">
                    {document ? (
                        <iframe
                            src={getPdfUrl(document.file_path)}
                            className="w-full h-full border-none"
                            title="PDF Viewer"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                            <FileText className="w-16 h-16 mb-4 text-slate-300" />
                            <p className="font-medium text-slate-600">
                                Loading Document...
                            </p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Right: Learning Tools */}
            <div className="w-1/2 bg-white border-l shadow-xl shadow-slate-200/50 flex flex-col">
                <Tabs defaultValue="chat" className="flex flex-col h-full">
                    <div className="border-b px-4 pt-3 bg-white">
                        <TabsList className="grid w-full grid-cols-4 mb-2">
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
                        </TabsList>
                    </div>

                    <TabsContent
                        value="chat"
                        className="flex-1 mt-0 overflow-hidden flex flex-col"
                    >
                        <ChatInterface documentId={id} />
                    </TabsContent>

                    <TabsContent
                        value="lesson"
                        className="flex-1 mt-0 overflow-y-auto bg-slate-50/50"
                    >
                        <LessonView documentId={id} />
                    </TabsContent>

                    <TabsContent
                        value="flashcards"
                        className="flex-1 mt-0 overflow-y-auto bg-slate-50/50"
                    >
                        <FlashcardView documentId={id} />
                    </TabsContent>

                    <TabsContent
                        value="quiz"
                        className="flex-1 mt-0 overflow-y-auto bg-slate-50/50"
                    >
                        <QuizView documentId={id} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
