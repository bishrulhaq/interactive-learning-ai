'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Volume2 } from 'lucide-react'
import api from '@/lib/api'
import { AudioPlayer } from './audio-player'

interface LessonSection {
    title: string
    content: string
    key_points: string[]
}

interface LessonPlan {
    topic: string
    sections: LessonSection[]
    audio_path?: string
}

export default function LessonView({
    workspaceId,
    initialTopic = 'General Overview'
}: {
    workspaceId: number
    initialTopic?: string
}) {
    const [lesson, setLesson] = useState<LessonPlan | null>(null)
    const [loading, setLoading] = useState(true)
    const [narrating, setNarrating] = useState(false)
    const [topic] = useState(initialTopic)

    // TODO: Improve topic selection logic

    const generateLesson = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.post('/generate/lesson', {
                topic,
                workspace_id: workspaceId
            })
            setLesson(res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [workspaceId, topic])

    const narrateLesson = useCallback(async () => {
        if (!lesson || narrating) return

        setNarrating(true)
        try {
            const res = await api.post('/generate/lesson/speech', {
                topic: topic, // Use the topic from state, not lesson.topic
                workspace_id: workspaceId
            })
            setLesson({ ...lesson, ...res.data })
        } catch (e) {
            console.error('Narration failed:', e)
        } finally {
            setNarrating(false)
        }
    }, [lesson, narrating, workspaceId, topic])

    // Auto-load if exists
    useEffect(() => {
        let mounted = true
        const fetchExisting = async () => {
            try {
                const res = await api.get('/generate/existing', {
                    params: { workspace_id: workspaceId, topic }
                })
                if (!mounted) return
                if (res.data.lesson) {
                    setLesson(res.data.lesson)
                }
            } catch (e) {
                console.error('Error fetching existing lesson:', e)
            } finally {
                if (mounted) setLoading(false)
            }
        }
        setLesson(null)
        setLoading(true)
        fetchExisting()
        return () => {
            mounted = false
        }
    }, [workspaceId, topic])

    if (!lesson && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <h3 className="text-xl font-semibold">AI Lesson Generator</h3>
                <p className="text-muted-foreground">
                    Generate a comprehensive lesson plan from this document.
                </p>
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
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">{lesson?.topic}</h2>
                    <div className="flex gap-2 items-center">
                        {!lesson?.audio_path && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={narrateLesson}
                                disabled={narrating}
                            >
                                {narrating ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Volume2 className="w-4 h-4 mr-2" />
                                )}
                                Play Summary
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={generateLesson}
                        >
                            Regenerate
                        </Button>
                    </div>
                </div>

                {lesson?.audio_path && (
                    <div className="w-full">
                        <AudioPlayer
                            src={`${api.defaults.baseURL}/audio/${lesson.audio_path}`}
                            title="Lesson Summary"
                        />
                    </div>
                )}
            </div>

            {lesson?.sections.map((section, idx) => (
                <Card key={idx}>
                    <CardHeader>
                        <CardTitle>{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="prose max-w-none text-foreground/90 dark:prose-invert">
                            {section.content}
                        </div>
                        {section.key_points.length > 0 && (
                            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 p-4 rounded-lg">
                                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                                    Key Points
                                </h4>
                                <ul className="list-disc pl-5 space-y-1 text-blue-800 dark:text-blue-200/90">
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
