'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Loader2,
    Mic,
    Play,
    Pause,
    RotateCcw,
    Volume2,
    Users
} from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

interface DialogueItem {
    speaker: string
    voice: string
    text: string
}

interface Podcast {
    topic: string
    script: DialogueItem[]
    audio_path: string
}

export default function PodcastView({
    documentId,
    initialTopic = 'Key Concepts'
}: {
    documentId: string
    initialTopic?: string
}) {
    const [podcast, setPodcast] = useState<Podcast | null>(null)
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [playing, setPlaying] = useState(false)
    const [progress, setProgress] = useState(0)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    const fetchExisting = useCallback(
        async (isPolling = false) => {
            if (!isPolling) setLoading(true)
            try {
                const res = await api.get('/generate/existing', {
                    params: { document_id: documentId, topic: initialTopic }
                })
                if (res.data.podcast) {
                    setPodcast(res.data.podcast)
                }
            } catch (e) {
                console.error('Error fetching existing podcast:', e)
            } finally {
                if (!isPolling) setLoading(false)
            }
        },
        [documentId, initialTopic]
    )

    useEffect(() => {
        fetchExisting()
    }, [fetchExisting])

    // Polling for audio if script exists but audio_path is empty
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (podcast && !podcast.audio_path) {
            interval = setInterval(() => {
                fetchExisting(true)
            }, 3000)
        }
        return () => clearInterval(interval)
    }, [podcast, fetchExisting])

    const generatePodcast = async (type: 'single' | 'duo' = 'duo') => {
        setGenerating(true)
        try {
            const res = await api.post(`/generate/podcast?type=${type}`, {
                topic: initialTopic,
                document_id: documentId
            })
            setPodcast(res.data)
        } catch (e) {
            console.error('Error generating podcast:', e)
        } finally {
            setGenerating(false)
        }
    }

    const togglePlay = () => {
        if (!podcast?.audio_path) return

        if (!audioRef.current) {
            const url = `${api.defaults.baseURL?.replace('/api', '')}/${podcast.audio_path}`
            audioRef.current = new Audio(url)
            audioRef.current.ontimeupdate = () => {
                if (audioRef.current) {
                    setProgress(
                        (audioRef.current.currentTime /
                            audioRef.current.duration) *
                            100
                    )
                }
            }
            audioRef.current.onended = () => setPlaying(false)
        }

        if (playing) {
            audioRef.current?.pause()
        } else {
            audioRef.current?.play()
        }
        setPlaying(!playing)
    }

    const resetPlayback = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0
            audioRef.current.play()
            setPlaying(true)
        }
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Mic className="text-blue-600 w-8 h-8" />
                        AI Deep Dive
                    </h2>
                    <p className="text-slate-500 mt-1">
                        Turn your document into an engaging conversation.
                    </p>
                </div>
            </div>

            {!podcast ? (
                <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                            <Users className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">
                            No Podcast Generated Yet
                        </h3>
                        <p className="text-slate-500 mb-8 max-w-sm">
                            Generate a two-person conversational deep dive to
                            learn about this topic naturally.
                        </p>
                        <Button
                            size="lg"
                            onClick={() => generatePodcast('duo')}
                            disabled={generating}
                            className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200"
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                                    Creating Script...
                                </>
                            ) : (
                                <>
                                    <Mic className="w-5 h-5 mr-2" />
                                    Generate 2-Speaker Podcast
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* Audio Player Card */}
                    <Card className="bg-slate-900 text-white overflow-hidden shadow-2xl border-none">
                        <CardContent className="p-8">
                            <div className="flex flex-col items-center">
                                <span className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-2">
                                    {podcast.audio_path
                                        ? 'NOW PLAYING'
                                        : 'SYNTHESIZING AUDIO'}
                                </span>
                                <h3 className="text-2xl font-bold text-center mb-8">
                                    {podcast.topic}
                                </h3>

                                <div className="w-full bg-slate-800 h-2 rounded-full mb-6 overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full transition-all duration-300',
                                            podcast.audio_path
                                                ? 'bg-blue-500'
                                                : 'bg-blue-300 animate-pulse w-full'
                                        )}
                                        style={
                                            podcast.audio_path
                                                ? { width: `${progress}%` }
                                                : {}
                                        }
                                    />
                                </div>

                                <div className="flex items-center gap-8">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={resetPlayback}
                                        disabled={!podcast.audio_path}
                                        className="hover:bg-slate-800 text-slate-300"
                                    >
                                        <RotateCcw className="w-6 h-6" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        onClick={togglePlay}
                                        disabled={!podcast.audio_path}
                                        className="w-16 h-16 rounded-full bg-white text-slate-900 hover:bg-slate-200 shadow-xl disabled:opacity-50 disabled:bg-slate-700"
                                    >
                                        {!podcast.audio_path ? (
                                            <Loader2 className="w-8 h-8 animate-spin" />
                                        ) : playing ? (
                                            <Pause className="w-8 h-8 fill-current" />
                                        ) : (
                                            <Play className="w-8 h-8 fill-current ml-1" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={!podcast.audio_path}
                                        className="hover:bg-slate-800 text-slate-300"
                                    >
                                        <Volume2 className="w-6 h-6" />
                                    </Button>
                                </div>
                                {!podcast.audio_path && (
                                    <p className="text-xs text-slate-500 mt-4 animate-pulse">
                                        Processing voices... This may take up to
                                        a minute.
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Script Section */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-700 flex items-center gap-2 px-2">
                            <BookOpenIcon className="w-4 h-4" />
                            Podcast Script
                        </h4>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {podcast.script.map((line, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        'p-4 rounded-2xl max-w-[85%] shadow-sm border',
                                        line.voice === 'af_bella'
                                            ? 'bg-blue-50 border-blue-100 rounded-bl-none ml-0'
                                            : 'bg-white border-slate-100 rounded-br-none ml-auto text-right'
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span
                                            className={cn(
                                                'text-[10px] font-bold uppercase tracking-wider',
                                                line.voice === 'af_bella'
                                                    ? 'text-blue-600'
                                                    : 'text-slate-500'
                                            )}
                                        >
                                            {line.speaker}
                                        </span>
                                    </div>
                                    <p className="text-slate-700 leading-relaxed text-sm">
                                        {line.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generatePodcast('duo')}
                            disabled={generating}
                        >
                            <RotateCcw className="w-4 h-4 mr-2" /> Regenerate
                            Podcast
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

function BookOpenIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
    )
}
