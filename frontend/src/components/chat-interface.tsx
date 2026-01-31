'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { useCallback } from 'react'

interface Message {
    role: 'user' | 'assistant'
    content: string
}

export default function ChatInterface({ documentId }: { documentId: string }) {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content:
                'Hello! I can help you understand your uploaded documents. Ask me anything!'
        }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    const fetchMessages = useCallback(async () => {
        try {
            const res = await api.get(`/chat/history/${documentId}`)
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
    }, [documentId])

    useEffect(() => {
        fetchMessages()
    }, [fetchMessages])

    const handleSend = async () => {
        if (!input.trim() || loading) return

        const userMsg: Message = { role: 'user', content: input }
        setMessages((prev) => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            const response = await api.post('/chat', {
                message: userMsg.content,
                document_id: documentId
            })

            const assistantMsg: Message = {
                role: 'assistant',
                content: response.data.answer
            }
            setMessages((prev) => [...prev, assistantMsg])
        } catch (error) {
            console.error(error)
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: 'Sorry, I encountered an error answering that.'
                }
            ])
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="flex flex-col h-full border-0 shadow-none rounded-none bg-slate-50/50">
            <div className="p-4 border-b bg-white">
                <h2 className="font-semibold flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-600" />
                    AI Tutor
                </h2>
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
                                        ? 'bg-blue-100'
                                        : 'bg-slate-200'
                                )}
                            >
                                <AvatarFallback>
                                    {msg.role === 'assistant' ? (
                                        <Bot className="w-5 h-5 text-blue-600" />
                                    ) : (
                                        <User className="w-5 h-5 text-slate-600" />
                                    )}
                                </AvatarFallback>
                            </Avatar>

                            <div
                                className={cn(
                                    'p-3 rounded-lg text-sm max-w-[80%]',
                                    msg.role === 'user'
                                        ? 'bg-blue-600 text-white rounded-tr-none'
                                        : 'bg-white border shadow-sm text-slate-800 rounded-tl-none prose prose-sm max-w-none dark:prose-invert'
                                )}
                            >
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-3">
                            <Avatar className="w-8 h-8 bg-blue-100">
                                <AvatarFallback>
                                    <Bot className="w-5 h-5 text-blue-600" />
                                </AvatarFallback>
                            </Avatar>
                            <div className="bg-white border shadow-sm p-3 rounded-lg rounded-tl-none">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="p-4 bg-white border-t">
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        handleSend()
                    }}
                    className="max-w-3xl mx-auto flex gap-2"
                >
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about your document..."
                        className="flex-1"
                        disabled={loading}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={loading || !input.trim()}
                    >
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
            </div>
        </Card>
    )
}
