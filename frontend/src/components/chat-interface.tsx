'use client'

import { useState, useEffect, useRef } from 'react'
import {
    Send,
    Bot,
    User,
    Loader2,
    Volume2,
    Mic,
    MicOff,
    VolumeX,
    X,
    Headphones
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { useCallback } from 'react'
import type { AxiosError } from 'axios'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

type ApiErrorData = {
    detail?: string
}

type SpeechRecognitionAlternativeLike = {
    transcript: string
    confidence?: number
}

type SpeechRecognitionResultLike = {
    isFinal: boolean
    length: number
    [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionResultListLike = {
    length: number
    [index: number]: SpeechRecognitionResultLike
}

type SpeechRecognitionEventLike = {
    results: SpeechRecognitionResultListLike
}

type SpeechRecognitionLike = {
    lang: string
    interimResults: boolean
    continuous: boolean
    maxAlternatives: number
    onstart: null | (() => void)
    onresult: null | ((event: SpeechRecognitionEventLike) => void)
    onend: null | (() => void)
    start: () => void
    stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

export default function ChatInterface({
    workspaceId
}: {
    workspaceId: number
}) {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content:
                'Hello! I can help you understand your uploaded documents. Ask me anything!'
        }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [autoPlay, setAutoPlay] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [isVoiceMode, setIsVoiceMode] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [voiceTranscript, setVoiceTranscript] = useState('')
    const [voiceResponse, setVoiceResponse] = useState('')

    const scrollRef = useRef<HTMLDivElement>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
    const queueRef = useRef<string[]>([])
    const isProcessingQueueRef = useRef(false)
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const audioBufferRef = useRef<Map<string, string>>(new Map()) // Text -> Blob URL

    const fetchMessages = useCallback(async () => {
        try {
            const res = await api.get(`/chat/history/${workspaceId}`)
            const history = res.data.map(
                (msg: { role: 'user' | 'assistant'; content: string }) => ({
                    role: msg.role,
                    content: msg.content
                })
            )
            if (history.length > 0) {
                setMessages(history)
            }
        } catch (err) {
            console.error('Failed to fetch chat history', err)
        }
    }, [workspaceId])

    useEffect(() => {
        fetchMessages()
    }, [fetchMessages])

    // Auto-scroll to bottom whenever messages or loading state changes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [messages, loading, voiceTranscript])

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        }
    }, [])

    const fetchSentenceAudio = async (text: string) => {
        if (audioBufferRef.current.has(text))
            return audioBufferRef.current.get(text)
        try {
            const res = await fetch(
                `http://localhost:8000/generate/narration?text=${encodeURIComponent(text)}&voice=af_bella`
            )
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            audioBufferRef.current.set(text, url)
            return url
        } catch (err) {
            console.error('Failed to fetch audio for:', text, err)
            return null
        }
    }

    const playNextInQueue = useCallback(
        async (onFinalComplete?: () => void) => {
            if (queueRef.current.length === 0) {
                isProcessingQueueRef.current = false
                setIsSpeaking(false)
                if (onFinalComplete) onFinalComplete()

                // Cleanup buffer
                audioBufferRef.current.forEach((url) =>
                    URL.revokeObjectURL(url)
                )
                audioBufferRef.current.clear()
                return
            }

            isProcessingQueueRef.current = true
            setIsSpeaking(true)
            const textToSpeak = queueRef.current.shift()!

            // Pre-fetch next 2 sentences immediately
            queueRef.current
                .slice(0, 2)
                .forEach((text) => fetchSentenceAudio(text))

            try {
                let url = audioBufferRef.current.get(textToSpeak)
                if (!url) {
                    url = (await fetchSentenceAudio(textToSpeak)) || undefined
                }

                if (!url || !isProcessingQueueRef.current) {
                    playNextInQueue(onFinalComplete)
                    return
                }

                if (!audioRef.current) {
                    audioRef.current = new Audio()
                }

                audioRef.current.src = url
                audioRef.current.onended = () => {
                    playNextInQueue(onFinalComplete)
                }
                audioRef.current.play()
            } catch (err) {
                console.error('Playback failed', err)
                playNextInQueue(onFinalComplete)
            }
        },
        []
    )

    const speak = useCallback(
        async (text: string, onEnded?: () => void) => {
            if (isSpeaking) {
                audioRef.current?.pause()
                queueRef.current = []
                isProcessingQueueRef.current = false
                setIsSpeaking(false)
                if (!isVoiceMode) return
            }

            const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+/g) || [text]
            const cleanSentences = sentences
                .map((s) => s.trim())
                .filter((s) => s.length > 0)

            if (cleanSentences.length === 0) return

            setVoiceResponse(text)
            queueRef.current = cleanSentences
            playNextInQueue(onEnded)
        },
        [isSpeaking, isVoiceMode, playNextInQueue]
    )

    // Use a ref to allow handleVoiceConversation to call startListening without circular dependency
    const startListeningRef = useRef<
        ((isConversational?: boolean) => void) | null
    >(null)

    const handleVoiceConversation = useCallback(
        async (text: string) => {
            if (!text.trim()) {
                if (isVoiceMode && !isMuted) startListeningRef.current?.(true)
                return
            }

            const userMsg: Message = { role: 'user', content: text }
            setMessages((prev) => [...prev, userMsg])
            setLoading(true)
            setVoiceTranscript('')
            setVoiceResponse('Thinking...')

            try {
                const response = await api.post('/chat', {
                    message: text,
                    workspace_id: workspaceId
                })

                const assistantMsg: Message = {
                    role: 'assistant',
                    content: response.data.answer
                }
                setMessages((prev) => [...prev, assistantMsg])

                speak(response.data.answer, () => {
                    if (isVoiceMode && !isMuted) {
                        startListeningRef.current?.(true)
                    }
                })
            } catch (error) {
                console.error(error)
                const axiosErr = error as AxiosError<ApiErrorData>
                const detail = axiosErr.response?.data?.detail
                setVoiceResponse(
                    typeof detail === 'string'
                        ? detail
                        : 'Sorry, I encountered an error.'
                )
            } finally {
                setLoading(false)
            }
        },
        [isVoiceMode, isMuted, workspaceId, speak]
    )

    const startListening = useCallback(
        (isConversational = false) => {
            if (isMuted && isConversational) return

            const SpeechRecognition =
                (
                    window as unknown as {
                        SpeechRecognition?: SpeechRecognitionConstructor
                        webkitSpeechRecognition?: SpeechRecognitionConstructor
                    }
                ).SpeechRecognition ||
                (
                    window as unknown as {
                        SpeechRecognition?: SpeechRecognitionConstructor
                        webkitSpeechRecognition?: SpeechRecognitionConstructor
                    }
                ).webkitSpeechRecognition
            if (!SpeechRecognition) {
                alert('Speech Recognition is not supported in this browser.')
                return
            }

            if (recognitionRef.current) {
                recognitionRef.current.stop()
            }

            const recognition = new SpeechRecognition()
            recognitionRef.current = recognition
            recognition.lang = 'en-US'
            recognition.interimResults = true
            recognition.continuous = isConversational
            recognition.maxAlternatives = 1

            recognition.onstart = () => {
                setIsListening(true)
                setVoiceTranscript('')
            }

            recognition.onresult = (event: SpeechRecognitionEventLike) => {
                let fullTranscript = ''
                for (let i = 0; i < event.results.length; i++) {
                    fullTranscript += event.results[i][0].transcript
                }

                setVoiceTranscript(fullTranscript)

                if (isConversational) {
                    if (silenceTimerRef.current)
                        clearTimeout(silenceTimerRef.current)

                    silenceTimerRef.current = setTimeout(() => {
                        if (fullTranscript.trim()) {
                            recognition.stop()
                            handleVoiceConversation(fullTranscript)
                        }
                    }, 1500)
                } else if (event.results[0].isFinal) {
                    setInput(fullTranscript)
                }
            }

            recognition.onend = () => {
                setIsListening(false)
            }

            recognition.start()
        },
        [isMuted, handleVoiceConversation]
    )

    // Update the ref whenever startListening changes
    useEffect(() => {
        startListeningRef.current = startListening
    }, [startListening])

    const handleSend = async () => {
        if (!input.trim() || loading) return

        const userMsg: Message = { role: 'user', content: input }
        setMessages((prev) => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const response = await api.post('/chat', {
                message: userMsg.content,
                workspace_id: workspaceId
            })

            const assistantMsg: Message = {
                role: 'assistant',
                content: response.data.answer
            }
            setMessages((prev) => [...prev, assistantMsg])

            if (autoPlay || isVoiceMode) {
                speak(response.data.answer)
            }
        } catch (error) {
            console.error(error)
            const axiosErr = error as AxiosError<ApiErrorData>
            const detail = axiosErr.response?.data?.detail
            const msg =
                typeof detail === 'string'
                    ? detail
                    : 'Sorry, I encountered an error answering that.'
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: msg
                }
            ])
        } finally {
            setLoading(false)
        }
    }

    const toggleVoiceMode = () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (isVoiceMode) {
            // Turning off
            setIsVoiceMode(false)
            if (recognitionRef.current) recognitionRef.current.stop()
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.src = '' // Clear source to prevent any further play
            }
            queueRef.current = []
            isProcessingQueueRef.current = false
            setIsSpeaking(false)
        } else {
            // Turning on
            setIsVoiceMode(true)
            setVoiceTranscript('')
            setVoiceResponse('Hello! I am ready to listen.')
            startListening(true)
        }
    }

    return (
        <Card className="flex flex-col h-full border-0 shadow-none rounded-none bg-background">
            <div className="p-4 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-600" />
                    AI Tutor
                </h2>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAutoPlay(!autoPlay)}
                        className={cn(
                            'text-xs gap-2',
                            autoPlay ? 'text-blue-600' : 'text-muted-foreground'
                        )}
                    >
                        {autoPlay ? (
                            <Volume2 className="w-4 h-4" />
                        ) : (
                            <VolumeX className="w-4 h-4" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleVoiceMode}
                        className="text-muted-foreground hover:text-blue-600"
                    >
                        <Headphones className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1 p-4 min-h-0">
                <div className="space-y-4 max-w-3xl mx-auto">
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={cn(
                                'flex gap-3',
                                msg.role === 'user'
                                    ? 'flex-row-reverse'
                                    : 'flex-row'
                            )}
                        >
                            <Avatar
                                className={cn(
                                    'w-8 h-8',
                                    msg.role === 'assistant'
                                        ? 'bg-blue-500/10'
                                        : 'bg-muted'
                                )}
                            >
                                <AvatarFallback>
                                    {msg.role === 'assistant' ? (
                                        <Bot className="w-5 h-5 text-blue-600" />
                                    ) : (
                                        <User className="w-5 h-5 text-muted-foreground" />
                                    )}
                                </AvatarFallback>
                            </Avatar>

                            <div
                                className={cn(
                                    'p-3 rounded-lg text-sm max-w-[80%]',
                                    msg.role === 'user'
                                        ? 'bg-blue-600 text-white dark:bg-blue-500/80 rounded-tr-none'
                                        : 'bg-card border border-border text-foreground rounded-tl-none prose prose-sm max-w-none dark:prose-invert'
                                )}
                            >
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {voiceTranscript && isListening && (
                        <div className="flex gap-3 flex-row-reverse">
                            <Avatar className="w-8 h-8 bg-muted">
                                <AvatarFallback>
                                    <User className="w-5 h-5 text-muted-foreground" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="p-3 rounded-lg text-sm max-w-[80%] bg-blue-600/30 dark:bg-blue-500/20 text-white rounded-tr-none italic animate-pulse">
                                {voiceTranscript}...
                            </div>
                        </div>
                    )}
                    {loading && (
                        <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <Avatar className="w-8 h-8 bg-blue-500/10">
                                <AvatarFallback>
                                    <Bot className="w-5 h-5 text-blue-600" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="bg-card border border-border p-3 rounded-lg rounded-tl-none flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                <span className="text-xs text-muted-foreground font-medium">
                                    Thinking...
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} className="h-4" />
                </div>
            </ScrollArea>

            <div className="p-4 bg-card/60 backdrop-blur-md border-t border-border">
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleSend()
                    }}
                    className="max-w-3xl mx-auto flex gap-2 pr-14"
                >
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about your document..."
                        className="flex-1 bg-background/50"
                        disabled={loading}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => startListening()}
                        className={cn(
                            isListening &&
                                'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-200 border-red-200 dark:border-red-900/40 animate-pulse'
                        )}
                        disabled={loading}
                    >
                        {isListening ? (
                            <MicOff className="w-4 h-4" />
                        ) : (
                            <Mic className="w-4 h-4" />
                        )}
                    </Button>
                    <Button
                        type="submit"
                        size="icon"
                        disabled={loading || !input.trim()}
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
            </div>

            {/* Voice Mode Overlay */}
            {isVoiceMode && (
                <div className="absolute inset-0 z-50 bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-between p-8 text-white animate-in fade-in duration-300">
                    <div className="w-full flex justify-between items-center">
                        <div className="flex items-center gap-2 text-slate-400">
                            <Bot className="w-5 h-5" />
                            <span className="text-sm font-medium">
                                AI Tutor Voice Mode
                            </span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleVoiceMode}
                            className="text-white hover:bg-white/10"
                        >
                            <X className="w-6 h-6" />
                        </Button>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full max-w-2xl text-center min-h-0">
                        {/* Animated Visualizer Orb - Scaled down slightly to fit more text */}
                        <div className="relative shrink-0 scale-90 sm:scale-100">
                            <div
                                className={cn(
                                    'w-32 h-32 sm:w-48 sm:h-48 rounded-full bg-blue-600/20 flex items-center justify-center transition-all duration-500',
                                    isSpeaking
                                        ? 'scale-110 shadow-[0_0_80px_rgba(37,99,235,0.4)]'
                                        : 'scale-100',
                                    isListening
                                        ? 'shadow-[0_0_100px_rgba(37,99,235,0.6)]'
                                        : ''
                                )}
                            >
                                <div
                                    className={cn(
                                        'w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-blue-500 flex items-center justify-center shadow-lg transition-all duration-300',
                                        isListening && 'animate-pulse scale-105'
                                    )}
                                >
                                    {isMuted ? (
                                        <MicOff className="w-8 h-8 sm:w-12 sm:h-12" />
                                    ) : (
                                        <Mic className="w-8 h-8 sm:w-12 sm:h-12" />
                                    )}
                                </div>

                                {loading && (
                                    <div className="absolute inset-0 border-4 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                                )}
                            </div>
                        </div>

                        <div className="w-full flex-1 min-h-0 flex flex-col justify-center gap-4">
                            <div className="max-h-[30vh] sm:max-h-[40vh] overflow-y-auto px-4 custom-scrollbar">
                                <p
                                    className={cn(
                                        'text-lg sm:text-xl md:text-2xl font-medium transition-opacity duration-300 leading-snug',
                                        isSpeaking
                                            ? 'opacity-100'
                                            : 'opacity-60'
                                    )}
                                >
                                    {isSpeaking
                                        ? voiceResponse
                                        : isListening
                                          ? voiceTranscript || 'Listening...'
                                          : "I'm ready"}
                                </p>
                            </div>

                            {voiceTranscript && isListening && (
                                <p className="text-slate-400 text-xs sm:text-sm italic px-8">
                                    &quot;{voiceTranscript}&quot;
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="w-full max-w-xs flex justify-around items-center bg-white/5 rounded-full p-2 backdrop-blur-md">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                setIsMuted(!isMuted)
                                if (!isMuted && recognitionRef.current) {
                                    recognitionRef.current.stop()
                                } else if (isMuted) {
                                    startListening(true)
                                }
                            }}
                            className={cn(
                                'h-14 w-14 rounded-full transition-all',
                                isMuted
                                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                    : 'text-white hover:bg-white/10'
                            )}
                        >
                            {isMuted ? (
                                <MicOff className="w-6 h-6" />
                            ) : (
                                <Mic className="w-6 h-6" />
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                if (isSpeaking) {
                                    audioRef.current?.pause()
                                    setIsSpeaking(false)
                                } else if (voiceResponse) {
                                    speak(voiceResponse)
                                }
                            }}
                            className="h-14 w-14 rounded-full text-white hover:bg-white/10"
                        >
                            {isSpeaking ? (
                                <VolumeX className="w-6 h-6" />
                            ) : (
                                <Volume2 className="w-6 h-6" />
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    )
}
