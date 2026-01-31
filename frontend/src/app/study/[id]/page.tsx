"use client"

import { useParams } from 'next/navigation'
import { FileText, MessageSquare, BookOpen, Layers } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ChatInterface from '@/components/chat-interface'
import LessonView from '@/components/lesson-view'
import FlashcardView from '@/components/flashcard-view'

export default function StudyPage() {
    const params = useParams()
    const id = params.id as string

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">
            {/* Left: Document View */}
            <div className="w-1/2 p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                    <h1 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Document Review
                    </h1>
                    <Badge variant="outline" className="bg-white">ID: {id.slice(0, 8)}...</Badge>
                </div>
                <Card className="flex-1 bg-white overflow-hidden shadow-sm border-slate-200">
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                        <FileText className="w-16 h-16 mb-4 text-slate-300" />
                        <p className="font-medium text-slate-600">PDF Preview Placeholder</p>
                        <p className="text-xs max-w-xs text-center mt-2">In a real deployment, the PDF file would be rendered here using an iframe or react-pdf.</p>
                    </div>
                </Card>
            </div>

            {/* Right: Learning Tools */}
            <div className="w-1/2 bg-white border-l shadow-xl shadow-slate-200/50 flex flex-col">
                <Tabs defaultValue="chat" className="flex flex-col h-full">
                    <div className="border-b px-4 pt-3 bg-white">
                        <TabsList className="grid w-full grid-cols-3 mb-2">
                            <TabsTrigger value="chat" className="flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" /> Chat
                            </TabsTrigger>
                            <TabsTrigger value="lesson" className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4" /> Lesson
                            </TabsTrigger>
                            <TabsTrigger value="flashcards" className="flex items-center gap-2">
                                <Layers className="w-4 h-4" /> Cards
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="chat" className="flex-1 mt-0 overflow-hidden">
                        <ChatInterface />
                    </TabsContent>

                    <TabsContent value="lesson" className="flex-1 mt-0 overflow-y-auto bg-slate-50/50">
                        <LessonView documentId={id} />
                    </TabsContent>

                    <TabsContent value="flashcards" className="flex-1 mt-0 overflow-y-auto bg-slate-50/50">
                        <FlashcardView documentId={id} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
