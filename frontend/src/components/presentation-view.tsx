'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
    Loader2,
    RefreshCw,
    Presentation as PresentationIcon
} from 'lucide-react'
import api from '@/lib/api'
import { PresentationViewer } from '@/components/PresentationViewer'
import { Presentation } from '@/types'

export default function PresentationView({
    workspaceId,
    initialTopic = 'Key Concepts'
}: {
    workspaceId: number
    initialTopic?: string
}) {
    const [presentation, setPresentation] = useState<Presentation | null>(null)
    const [loading, setLoading] = useState(true)
    const [generated, setGenerated] = useState(false)

    const generatePresentation = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.post('/generate/presentation', {
                topic: initialTopic,
                workspace_id: workspaceId
            })
            setPresentation(res.data)
            setGenerated(true)
        } catch (e) {
            console.error('Error generating presentation:', e)
        } finally {
            setLoading(false)
        }
    }, [workspaceId, initialTopic])

    useEffect(() => {
        let mounted = true
        const fetchExisting = async () => {
            try {
                const res = await api.get('/generate/existing', {
                    params: { workspace_id: workspaceId, topic: initialTopic }
                })
                if (!mounted) return
                if (res.data.presentation) {
                    setPresentation(res.data.presentation)
                    setGenerated(true)
                }
            } catch (e) {
                console.error('Error fetching existing presentation:', e)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        setGenerated(false)
        setPresentation(null)
        setLoading(true)
        fetchExisting()

        return () => {
            mounted = false
        }
    }, [workspaceId, initialTopic])

    if (!generated && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <div className="p-6 bg-blue-500/10 rounded-full mb-2">
                    <PresentationIcon className="w-12 h-12 text-blue-500" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
                    AI Presentation
                </h3>
                <p className="text-slate-500 max-w-sm mb-6">
                    Turn your documents into a beautifully structured,
                    professional presentation instantly.
                </p>
                <Button
                    size="lg"
                    onClick={generatePresentation}
                    className="gap-2 shadow-sm font-medium"
                >
                    <PresentationIcon className="w-4 h-4" /> Generate
                    Presentation
                </Button>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                <p className="text-sm font-medium text-slate-500 animate-pulse">
                    Crafting your slides...
                </p>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col relative bg-background">
            <div className="p-4 border-b border-border flex justify-between items-center bg-card/60 backdrop-blur-md z-10">
                <h2 className="font-bold text-lg flex items-center gap-2">
                    <PresentationIcon className="w-5 h-5 text-blue-600" />
                    Presentation: {initialTopic}
                </h2>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={generatePresentation}
                    disabled={loading}
                    className="gap-2"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                </Button>
            </div>

            <div className="flex-1 w-full h-full overflow-hidden bg-dot-pattern">
                {presentation && (
                    <PresentationViewer presentation={presentation} />
                )}
            </div>
        </div>
    )
}
