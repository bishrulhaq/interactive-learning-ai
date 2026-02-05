'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import type { AxiosError } from 'axios'

interface Flashcard {
    front: string
    back: string
}

type ApiErrorData = {
    detail?: string
}
export default function FlashcardView({
    workspaceId,
    initialTopic = 'Key Concepts'
}: {
    workspaceId: number
    initialTopic?: string
}) {
    const [cards, setCards] = useState<Flashcard[]>([])
    const [loading, setLoading] = useState(true)
    const [flipped, setFlipped] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const generateCards = useCallback(async () => {
        setLoading(true)
        setCards([])
        setError(null)
        try {
            const res = await api.post('/generate/flashcards', {
                topic: initialTopic,
                workspace_id: workspaceId
            })
            setCards(res.data.cards)
        } catch (e) {
            console.error(e)
            const axiosErr = e as AxiosError<ApiErrorData>
            const detail = axiosErr.response?.data?.detail
            setError(
                typeof detail === 'string'
                    ? detail
                    : 'Failed to generate flashcards.'
            )
        } finally {
            setLoading(false)
        }
    }, [workspaceId, initialTopic])

    // Auto-load if exists
    useEffect(() => {
        let mounted = true
        const fetchExisting = async () => {
            try {
                const res = await api.get('/generate/existing', {
                    params: { workspace_id: workspaceId, topic: initialTopic }
                })
                if (!mounted) return
                if (res.data.flashcards) {
                    setCards(res.data.flashcards.cards)
                }
            } catch (e) {
                console.error('Error fetching existing flashcards:', e)
            } finally {
                if (mounted) setLoading(false)
            }
        }
        setCards([])
        setLoading(true)
        fetchExisting()
        return () => {
            mounted = false
        }
    }, [workspaceId, initialTopic])

    if (cards.length === 0 && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <h3 className="text-xl font-semibold">AI Flashcards</h3>
                <p className="text-muted-foreground">
                    Generate flashcards to test your knowledge.
                </p>
                {error && (
                    <p className="text-sm text-red-600 dark:text-red-200 max-w-md">
                        {error}
                    </p>
                )}
                <Button onClick={generateCards}>Generate Flashcards</Button>
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
                <h2 className="text-2xl font-bold">Flashcards</h2>
                <Button variant="outline" size="sm" onClick={generateCards}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    New Set
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map((card, idx) => (
                    <div
                        key={idx}
                        className="group h-64 cursor-pointer"
                        style={{ perspective: '1000px' }}
                        onClick={() => setFlipped(flipped === idx ? null : idx)}
                    >
                        <div
                            className="relative w-full h-full duration-500 transition-transform"
                            style={{
                                transformStyle: 'preserve-3d',
                                transform:
                                    flipped === idx
                                        ? 'rotateY(180deg)'
                                        : 'rotateY(0deg)'
                            }}
                        >
                            {/* Front */}
                            <Card
                                className="absolute w-full h-full flex items-center justify-center p-6 text-center bg-card hover:border-blue-400 dark:hover:border-blue-400/50 transition-colors"
                                style={{ backfaceVisibility: 'hidden' }}
                            >
                                <p className="font-semibold text-lg">
                                    {card.front}
                                </p>
                                <span className="absolute bottom-4 text-xs text-muted-foreground">
                                    Click to flip
                                </span>
                            </Card>

                            {/* Back */}
                            <Card
                                className="absolute w-full h-full flex items-center justify-center p-6 text-center bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40"
                                style={{
                                    backfaceVisibility: 'hidden',
                                    transform: 'rotateY(180deg)'
                                }}
                            >
                                <p className="text-foreground">{card.back}</p>
                            </Card>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
