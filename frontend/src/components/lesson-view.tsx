"use client"

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface LessonSection {
    title: string
    content: string
    key_points: string[]
}

interface LessonPlan {
    topic: string
    sections: LessonSection[]
}

export default function LessonView({ documentId, initialTopic = "General Overview" }: { documentId: string, initialTopic?: string }) {
    const [lesson, setLesson] = useState<LessonPlan | null>(null)
    const [loading, setLoading] = useState(false)
    const [topic, setTopic] = useState(initialTopic)

    // TODO: Improve topic selection logic

    const generateLesson = async () => {
        setLoading(true)
        try {
            const res = await api.post('/generate/lesson', {
                topic,
                document_id: documentId
            })
            setLesson(res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    // Auto-load if exists or generate new
    useEffect(() => { generateLesson() }, [])

    if (!lesson && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <h3 className="text-xl font-semibold">AI Lesson Generator</h3>
                <p className="text-slate-500">Generate a comprehensive lesson plan from this document.</p>
                <Button onClick={generateLesson}>Generate Lesson</Button>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6 pt-4 px-4 pb-20">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{lesson?.topic}</h2>
                <Button variant="outline" size="sm" onClick={generateLesson}>Regenerate</Button>
            </div>

            {lesson?.sections.map((section, idx) => (
                <Card key={idx}>
                    <CardHeader>
                        <CardTitle>{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="prose max-w-none text-slate-700">
                            {section.content}
                        </div>
                        {section.key_points.length > 0 && (
                            <div className="bg-blue-50 p-4 rounded-lg">
                                <h4 className="font-semibold text-blue-900 mb-2">Key Points</h4>
                                <ul className="list-disc pl-5 space-y-1 text-blue-800">
                                    {section.key_points.map((kp, k) => (
                                        <li key={k}>{kp}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
