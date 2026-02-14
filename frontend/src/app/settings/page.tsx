'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'
import {
    ArrowLeft,
    Save,
    Key,
    Cpu,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Sparkles,
    Download,
    XCircle,
    InfoIcon,
    ImageIcon,
    Eye,
    RotateCcw
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

type HfPreset = {
    id: string
    name: string
    desc: string
    dim: number
    size: string
    warn?: string
}

const HF_EMBEDDING_PRESETS: HfPreset[] = [
    {
        id: 'sentence-transformers/all-MiniLM-L6-v2',
        name: 'Fast & Lightweight',
        desc: 'Good for quick processing on standard PCs',
        dim: 384,
        size: 'Approx. 80MB'
    },
    {
        id: 'BAAI/bge-small-en-v1.5',
        name: 'High-Performance Small',
        desc: 'Excellent accuracy for its size',
        dim: 384,
        size: 'Approx. 130MB'
    },
    {
        id: 'sentence-transformers/all-mpnet-base-v2',
        name: 'Balanced (Recommended)',
        desc: 'The industry standard for document retrieval',
        dim: 768,
        size: 'Approx. 420MB'
    },
    {
        id: 'BAAI/bge-base-en-v1.5',
        name: 'Advanced Accuracy',
        desc: 'Slower to download but very precise',
        dim: 768,
        size: 'Approx. 440MB'
    },
    {
        id: 'BAAI/bge-large-en-v1.5',
        name: 'High Quality Large',
        desc: 'Maximum accuracy for complex documents',
        dim: 1024,
        size: 'Approx. 1.3GB',
        warn: 'Heavy model: may be slow on CPU and can fail if you run out of RAM. Recommended: GPU (CUDA) or plenty of system memory.'
    }
]

export default function SettingsPage() {
    const [llmProvider, setLlmProvider] = useState('openai')
    const [apiKey, setApiKey] = useState('')
    const [model, setModel] = useState('gpt-4o')
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
    const [embeddingProvider, setEmbeddingProvider] = useState('openai')
    const [embeddingModel, setEmbeddingModel] = useState(
        'text-embedding-3-small'
    )

    // Vision Settings State
    const [enableVision, setEnableVision] = useState(true)
    const [visionProvider, setVisionProvider] = useState('openai')
    const [ollamaVisionModel, setOllamaVisionModel] = useState('llava')

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{
        type: 'success' | 'error' | 'warning'
        text: string
    } | null>(null)
    const [connectionError, setConnectionError] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [downloadStatus, setDownloadStatus] = useState('')
    const [runtimeInfo, setRuntimeInfo] = useState<{
        device?: string
        cuda_available?: boolean
        cuda_device_name?: string
    } | null>(null)
    const router = useRouter()

    const fetchSettings = async () => {
        setLoading(true)
        setConnectionError(false)
        try {
            const res = await api.get('/settings')
            if (res.data.llm_provider) setLlmProvider(res.data.llm_provider)
            if (res.data.openai_api_key) setApiKey(res.data.openai_api_key)
            if (res.data.openai_model) setModel(res.data.openai_model)
            if (res.data.ollama_base_url) setOllamaUrl(res.data.ollama_base_url)
            if (res.data.embedding_provider)
                setEmbeddingProvider(res.data.embedding_provider)
            if (res.data.embedding_model)
                setEmbeddingModel(res.data.embedding_model)

            // Vision Settings
            if (res.data.enable_vision_processing !== undefined)
                setEnableVision(res.data.enable_vision_processing)
            if (res.data.vision_provider)
                setVisionProvider(res.data.vision_provider)
            if (res.data.ollama_vision_model)
                setOllamaVisionModel(res.data.ollama_vision_model)

            // Runtime hints
            if (res.data.runtime_info) {
                setRuntimeInfo(res.data.runtime_info)
            }
        } catch {
            setConnectionError(true)
        } finally {
            setLoading(false)
        }
    }

    const cancelDownload = async () => {
        try {
            await api.post('/settings/cancel-download')
            setIsDownloading(false)
            setDownloadProgress(0)
            setDownloadStatus('')
        } catch (err) {
            console.error('Failed to cancel download:', err)
        }
    }

    const triggerDownload = async () => {
        setIsDownloading(true)
        setDownloadProgress(0)
        setDownloadStatus('Connecting...')

        const eventSource = new EventSource(
            `${api.defaults.baseURL}/settings/download-progress`
        )

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data.status === 'downloading' || data.status === 'pulling') {
                setDownloadProgress(data.progress || 0)
                setDownloadStatus(data.message || 'Downloading...')
            } else if (data.status === 'completed') {
                setDownloadProgress(100)
                setDownloadStatus('Completed!')
                setTimeout(() => {
                    setIsDownloading(false)
                    eventSource.close()
                }, 2000)
            } else if (data.status === 'error') {
                setMessage({
                    type: 'error',
                    text: data.message || 'Download failed'
                })
                setIsDownloading(false)
                eventSource.close()
            }
        }

        eventSource.onerror = (err) => {
            console.error('EventSource failed:', err)
            eventSource.close()
            setIsDownloading(false)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage(null)

        try {
            // Validation check
            if (llmProvider === 'openai' && !apiKey) {
                setMessage({
                    type: 'error',
                    text: 'OpenAI API Key is required'
                })
                setSaving(false)
                return
            }

            // 1. Save local settings first
            await api.post('/settings', {
                llm_provider: llmProvider,
                openai_api_key: apiKey,
                openai_model: model,
                ollama_base_url: ollamaUrl,
                embedding_provider: embeddingProvider,
                embedding_model: embeddingModel,

                // Vision Settings
                enable_vision_processing: enableVision,
                vision_provider: visionProvider,
                ollama_vision_model: ollamaVisionModel
            })

            // 2. If it's a local model, trigger the download/pull
            if (
                llmProvider === 'ollama' ||
                embeddingProvider === 'huggingface'
            ) {
                await triggerDownload()
            } else {
                setMessage({
                    type: 'success',
                    text: 'Settings saved successfully!'
                })
            }
        } catch {
            setMessage({
                type: 'error',
                text: 'Failed to save settings. Please try again.'
            })
        } finally {
            setSaving(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    const needsOpenAiKey =
        llmProvider === 'openai' ||
        embeddingProvider === 'openai' ||
        (enableVision && visionProvider === 'openai')

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-8">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p className="text-muted-foreground animate-pulse">
                        Loading settings...
                    </p>
                </div>
            </div>
        )
    }

    if (connectionError) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-8 text-center">
                <div className="max-w-md space-y-4">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold">Connection Error</h1>
                    <p className="text-muted-foreground">
                        We couldn&apos;t reach the server. Please check if your
                        backend is running.
                    </p>
                    <Button onClick={() => fetchSettings()} variant="outline">
                        <RotateCcw className="w-4 h-4 mr-2" /> Retry
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8 font-sans text-foreground">
            <div className="max-w-2xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/')}
                            className="rounded-full hover:bg-accent/50 shadow-sm transition-all"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">
                                Settings
                            </h1>
                            <p className="text-muted-foreground">
                                Configure your OpenAI Tutor
                            </p>
                        </div>
                    </div>
                </div>
                <form onSubmit={handleSave} className="space-y-6">
                    {isDownloading && (
                        <div className="p-6 rounded-2xl bg-card border-2 border-blue-500 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-300">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <Download className="w-5 h-5 text-blue-600 animate-bounce" />
                                    </div>
                                    <div>
                                        <p className="font-bold">
                                            Setting up your model...
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {downloadStatus}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={cancelDownload}
                                    className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg h-8"
                                >
                                    <XCircle className="w-4 h-4 mr-1" /> Stop
                                    Download
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                    <span>Progress</span>
                                    <span>{downloadProgress}%</span>
                                </div>
                                <Progress
                                    value={downloadProgress}
                                    className="h-2 bg-muted"
                                />
                            </div>

                            <p className="text-[10px] text-center text-muted-foreground">
                                This might take a few minutes depending on your
                                internet speed.
                            </p>
                        </div>
                    )}

                    {message && (
                        <div
                            className={cn(
                                'p-5 rounded-2xl flex items-center gap-4 border shadow-sm animate-in fade-in slide-in-from-top-4 duration-300',
                                message.type === 'success'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-100 border-emerald-100 dark:border-emerald-900/40'
                                    : message.type === 'warning'
                                      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-100 border-amber-100 dark:border-amber-900/40'
                                      : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-100 border-red-100 dark:border-red-900/40'
                            )}
                        >
                            <div
                                className={cn(
                                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                                    message.type === 'success'
                                        ? 'bg-emerald-100 dark:bg-emerald-900/40'
                                        : message.type === 'warning'
                                          ? 'bg-amber-100 dark:bg-amber-900/40'
                                          : 'bg-red-100 dark:bg-red-900/40'
                                )}
                            >
                                {message.type === 'success' ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-200" />
                                ) : message.type === 'warning' ? (
                                    <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-200" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-200" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <p className="font-bold text-sm">
                                    {message.type === 'success'
                                        ? 'All looking good!'
                                        : message.type === 'warning'
                                          ? 'Configuration Incomplete'
                                          : 'Something went wrong'}
                                </p>
                                <p className="text-xs opacity-90">
                                    {message.text}
                                </p>
                            </div>
                        </div>
                    )}

                    <Card className="border-none shadow-xl bg-card/80 backdrop-blur-md overflow-hidden">
                        <CardHeader className="border-b border-border bg-muted/40">
                            <CardTitle className="flex items-center gap-2 text-lg text-blue-600">
                                LLM Configuration
                            </CardTitle>
                            <CardDescription>
                                Select your provider and configure model
                                details.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-slate-400" />
                                        AI Provider
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            {
                                                id: 'openai',
                                                name: 'OpenAI',
                                                icon: Sparkles
                                            },
                                            {
                                                id: 'ollama',
                                                name: 'Ollama (Local)',
                                                icon: Cpu
                                            }
                                        ].map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setLlmProvider(p.id)
                                                    // Avoid common misconfig: leaving OpenAI model name when switching to Ollama
                                                    if (
                                                        p.id === 'ollama' &&
                                                        (model === 'gpt-4o' ||
                                                            model ===
                                                                'gpt-4o-mini')
                                                    ) {
                                                        setModel('llama3')
                                                    }
                                                    if (
                                                        p.id === 'openai' &&
                                                        model &&
                                                        !model.startsWith(
                                                            'gpt-'
                                                        )
                                                    ) {
                                                        setModel('gpt-4o')
                                                    }
                                                }}
                                                className={cn(
                                                    'p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3',
                                                    llmProvider === p.id
                                                        ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400/50 dark:bg-blue-500/10'
                                                        : 'border-border bg-card hover:border-border'
                                                )}
                                            >
                                                <p.icon
                                                    className={cn(
                                                        'w-4 h-4',
                                                        llmProvider === p.id
                                                            ? 'text-blue-600'
                                                            : 'text-slate-400'
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        'font-bold text-sm',
                                                        llmProvider === p.id
                                                            ? 'text-blue-700'
                                                            : 'text-slate-600'
                                                    )}
                                                >
                                                    {p.name}
                                                </span>
                                                {llmProvider === p.id && (
                                                    <CheckCircle2 className="w-4 h-4 ml-auto text-blue-500" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {llmProvider === 'openai' ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                <Key className="w-4 h-4 text-slate-400" />
                                                OpenAI API Key{' '}
                                                <span className="text-red-500">
                                                    *
                                                </span>
                                            </label>
                                            <Input
                                                type="password"
                                                placeholder="sk-..."
                                                value={apiKey}
                                                onChange={(e) =>
                                                    setApiKey(e.target.value)
                                                }
                                                className="bg-muted/40 border-border focus:bg-background focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                            />
                                            {embeddingProvider === 'openai' && (
                                                <p className="text-[11px] text-muted-foreground">
                                                    This key is also used for
                                                    OpenAI embeddings.
                                                </p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                <Cpu className="w-4 h-4 text-slate-400" />
                                                Select Model
                                            </label>
                                            <div className="grid grid-cols-2 gap-4">
                                                {['gpt-4o', 'gpt-4o-mini'].map(
                                                    (m) => (
                                                        <div
                                                            key={m}
                                                            onClick={() =>
                                                                setModel(m)
                                                            }
                                                            className={cn(
                                                                'p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1',
                                                                model === m
                                                                    ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400/50 dark:bg-blue-500/10 ring-2 ring-blue-500/10'
                                                                    : 'border-border bg-card hover:border-border'
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between font-bold">
                                                                <span
                                                                    className={cn(
                                                                        'text-xs uppercase tracking-wider',
                                                                        model ===
                                                                            m
                                                                            ? 'text-blue-700 dark:text-blue-200'
                                                                            : 'text-muted-foreground'
                                                                    )}
                                                                >
                                                                    {m}
                                                                </span>
                                                                {model ===
                                                                    m && (
                                                                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {needsOpenAiKey && (
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                    <Key className="w-4 h-4 text-slate-400" />
                                                    OpenAI API Key{' '}
                                                    <span className="text-red-500">
                                                        *
                                                    </span>
                                                </label>
                                                <Input
                                                    type="password"
                                                    placeholder="sk-..."
                                                    value={apiKey}
                                                    onChange={(e) =>
                                                        setApiKey(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-muted/40 border-border focus:bg-background focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                                />
                                                <p className="text-[11px] text-muted-foreground">
                                                    Required because Embedding
                                                    Provider is OpenAI (even if
                                                    LLM is Ollama).
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 text-slate-400" />
                                                Ollama Base URL{' '}
                                                <span className="text-red-500">
                                                    *
                                                </span>
                                            </label>
                                            <Input
                                                placeholder="http://localhost:11434"
                                                value={ollamaUrl}
                                                onChange={(e) =>
                                                    setOllamaUrl(e.target.value)
                                                }
                                                className="bg-muted/40 border-border focus:bg-background focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                <Cpu className="w-4 h-4 text-slate-400" />
                                                Model Name
                                            </label>
                                            <Input
                                                placeholder="e.g. mistral, llama3, phi3"
                                                value={model}
                                                onChange={(e) =>
                                                    setModel(e.target.value)
                                                }
                                                className="bg-muted/40 border-border focus:bg-background focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-xl bg-card/80 backdrop-blur-md overflow-hidden">
                        <CardHeader className="border-b border-border bg-muted/40">
                            <CardTitle className="flex items-center gap-2 text-lg text-blue-600">
                                <Sparkles className="w-5 h-5" />
                                Embedding Configuration
                            </CardTitle>
                            <CardDescription>
                                Select how your documents are processed into
                                vectors.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-slate-400" />
                                        Embedding Provider
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            {
                                                id: 'openai',
                                                name: 'OpenAI',
                                                icon: Sparkles
                                            },
                                            {
                                                id: 'huggingface',
                                                name: 'Hugging Face (Local)',
                                                icon: Cpu
                                            }
                                        ].map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setEmbeddingProvider(p.id)
                                                    if (
                                                        p.id ===
                                                            'huggingface' &&
                                                        !HF_EMBEDDING_PRESETS.some(
                                                            (preset) =>
                                                                preset.id ===
                                                                embeddingModel
                                                        )
                                                    ) {
                                                        setEmbeddingModel(
                                                            HF_EMBEDDING_PRESETS[0]
                                                                .id
                                                        )
                                                    } else if (
                                                        p.id === 'openai'
                                                    ) {
                                                        setEmbeddingModel(
                                                            'text-embedding-3-small'
                                                        )
                                                    }
                                                }}
                                                className={cn(
                                                    'p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3',
                                                    embeddingProvider === p.id
                                                        ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400/50 dark:bg-blue-500/10'
                                                        : 'border-border bg-card hover:border-border hover:bg-accent/20'
                                                )}
                                            >
                                                <p.icon
                                                    className={cn(
                                                        'w-4 h-4',
                                                        embeddingProvider ===
                                                            p.id
                                                            ? 'text-blue-600'
                                                            : 'text-slate-400'
                                                    )}
                                                />
                                                <span
                                                    className={cn(
                                                        'font-bold text-sm',
                                                        embeddingProvider ===
                                                            p.id
                                                            ? 'text-blue-700 dark:text-blue-200'
                                                            : 'text-muted-foreground'
                                                    )}
                                                >
                                                    {p.name}
                                                </span>
                                                {embeddingProvider === p.id && (
                                                    <CheckCircle2 className="w-4 h-4 ml-auto text-blue-500" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                            <Cpu className="w-4 h-4 text-slate-400" />
                                            Select Model
                                        </label>
                                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                                            <InfoIcon className="w-3 h-3" />
                                            Dimensions matter for existing data
                                        </div>
                                    </div>

                                    {embeddingProvider === 'openai' ? (
                                        <div className="grid grid-cols-1 gap-3">
                                            {[
                                                {
                                                    id: 'text-embedding-3-small',
                                                    name: '3-Small (1536 dim)',
                                                    speed: 'Fastest'
                                                },
                                                {
                                                    id: 'text-embedding-ada-002',
                                                    name: 'Ada-002 (Legacy 1536)',
                                                    speed: 'Compatible'
                                                }
                                            ].map((m) => (
                                                <div
                                                    key={m.id}
                                                    onClick={() =>
                                                        setEmbeddingModel(m.id)
                                                    }
                                                    className={cn(
                                                        'p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between',
                                                        embeddingModel === m.id
                                                            ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400/50 dark:bg-blue-500/10 ring-2 ring-blue-500/10'
                                                            : 'border-border bg-card hover:border-border hover:bg-accent/20'
                                                    )}
                                                >
                                                    <div className="flex flex-col">
                                                        <span
                                                            className={cn(
                                                                'text-xs font-bold',
                                                                embeddingModel ===
                                                                    m.id
                                                                    ? 'text-blue-700 dark:text-blue-200'
                                                                    : 'text-muted-foreground'
                                                            )}
                                                        >
                                                            {m.name}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-tighter">
                                                            {m.speed}
                                                        </span>
                                                    </div>
                                                    {embeddingModel ===
                                                        m.id && (
                                                        <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {runtimeInfo && (
                                                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-[11px] text-muted-foreground">
                                                    Detected device:{' '}
                                                    <span className="font-mono font-bold">
                                                        {runtimeInfo.device}
                                                    </span>
                                                    {runtimeInfo.cuda_available &&
                                                    runtimeInfo.cuda_device_name ? (
                                                        <>
                                                            {' '}
                                                            (
                                                            {
                                                                runtimeInfo.cuda_device_name
                                                            }
                                                            )
                                                        </>
                                                    ) : null}
                                                    <div className="mt-1 text-muted-foreground/80">
                                                        Hugging Face embeddings
                                                        will use{' '}
                                                        <span className="font-mono">
                                                            cuda
                                                        </span>{' '}
                                                        when available (override
                                                        with env{' '}
                                                        <span className="font-mono">
                                                            RAG_HF_DEVICE
                                                        </span>
                                                        ).
                                                    </div>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-1 gap-3">
                                                {HF_EMBEDDING_PRESETS.map(
                                                    (m) => (
                                                        <div
                                                            key={m.id}
                                                            onClick={() =>
                                                                setEmbeddingModel(
                                                                    m.id
                                                                )
                                                            }
                                                            className={cn(
                                                                'p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1 relative',
                                                                embeddingModel ===
                                                                    m.id
                                                                    ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400/50 dark:bg-blue-500/10 ring-2 ring-blue-500/10'
                                                                    : 'border-border bg-card hover:border-border hover:bg-accent/20'
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex flex-col">
                                                                    <span
                                                                        className={cn(
                                                                            'text-sm font-bold',
                                                                            embeddingModel ===
                                                                                m.id
                                                                                ? 'text-blue-700 dark:text-blue-200'
                                                                                : 'text-foreground'
                                                                        )}
                                                                    >
                                                                        {m.name}
                                                                    </span>
                                                                    <span className="text-[9px] font-mono text-muted-foreground truncate max-w-[240px]">
                                                                        {m.id}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono">
                                                                        {m.dim}d
                                                                    </span>
                                                                    {embeddingModel ===
                                                                        m.id && (
                                                                        <CheckCircle2 className="w-4 h-4 text-blue-500" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {m.desc}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                <Download className="w-3 h-3 text-muted-foreground" />
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {m.size}
                                                                </span>
                                                            </div>
                                                            {m.warn && (
                                                                <div
                                                                    className={cn(
                                                                        'mt-2 rounded-lg border px-2 py-1.5 text-[10px] leading-snug',
                                                                        runtimeInfo?.device ===
                                                                            'cuda'
                                                                            ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-100'
                                                                            : 'border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-100'
                                                                    )}
                                                                >
                                                                    {m.warn}
                                                                    {runtimeInfo?.device ===
                                                                        'cpu' && (
                                                                        <span className="block mt-1 text-red-700/80 dark:text-red-200/80">
                                                                            Detected
                                                                            device
                                                                            is
                                                                            CPU.
                                                                            Consider
                                                                            a
                                                                            smaller
                                                                            model
                                                                            (384d/768d)
                                                                            if
                                                                            this
                                                                            fails.
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Vision Configuration Card */}
                    <Card className="border-none shadow-xl bg-card/80 backdrop-blur-md overflow-hidden">
                        <CardHeader className="border-b border-border bg-muted/40">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-lg text-blue-600">
                                        <Eye className="w-5 h-5" />
                                        Vision Configuration
                                    </CardTitle>
                                    <CardDescription>
                                        Configure how AI sees and analyzes
                                        images in your documents.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-medium text-muted-foreground mr-2">
                                        Enable Vision
                                    </label>
                                    <Switch
                                        checked={enableVision}
                                        onCheckedChange={setEnableVision}
                                    />
                                </div>
                            </div>
                        </CardHeader>

                        {enableVision && (
                            <CardContent className="p-6 space-y-6 animate-in slide-in-from-top-4 duration-300">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                            <ImageIcon className="w-4 h-4 text-slate-400" />
                                            Vision Provider
                                        </label>
                                        <div className="grid grid-cols-2 gap-4">
                                            {[
                                                {
                                                    id: 'openai',
                                                    name: 'OpenAI Vision',
                                                    desc: 'Best accuracy (GPT-4o)',
                                                    icon: Sparkles
                                                },
                                                {
                                                    id: 'ollama',
                                                    name: 'Ollama Vision',
                                                    desc: 'Local privacy (LLaVA)',
                                                    icon: Cpu
                                                }
                                            ].map((p) => (
                                                <div
                                                    key={p.id}
                                                    onClick={() =>
                                                        setVisionProvider(p.id)
                                                    }
                                                    className={cn(
                                                        'p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3',
                                                        visionProvider === p.id
                                                            ? 'border-blue-500 bg-blue-50/50 dark:border-blue-400/50 dark:bg-blue-500/10'
                                                            : 'border-border bg-card hover:border-border hover:bg-accent/20'
                                                    )}
                                                >
                                                    <p.icon
                                                        className={cn(
                                                            'w-4 h-4',
                                                            visionProvider ===
                                                                p.id
                                                                ? 'text-blue-600'
                                                                : 'text-slate-400'
                                                        )}
                                                    />
                                                    <div>
                                                        <div
                                                            className={cn(
                                                                'font-bold text-sm',
                                                                visionProvider ===
                                                                    p.id
                                                                    ? 'text-blue-700 dark:text-blue-200'
                                                                    : 'text-muted-foreground'
                                                            )}
                                                        >
                                                            {p.name}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground/70 font-normal">
                                                            {p.desc}
                                                        </div>
                                                    </div>
                                                    {visionProvider ===
                                                        p.id && (
                                                        <CheckCircle2 className="w-4 h-4 ml-auto text-blue-500" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {visionProvider === 'ollama' && (
                                        <div className="space-y-2 animate-in fade-in duration-300">
                                            <label className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                                <Cpu className="w-4 h-4 text-slate-400" />
                                                Vision Model Name
                                            </label>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="e.g. llava, bakllava, moondream"
                                                    value={ollamaVisionModel}
                                                    onChange={(e) =>
                                                        setOllamaVisionModel(
                                                            e.target.value
                                                        )
                                                    }
                                                    className="bg-muted/40 border-border focus:bg-background focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                                />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                Make sure you have pulled this
                                                model:{' '}
                                                <code className="bg-muted px-1 rounded">
                                                    ollama pull{' '}
                                                    {ollamaVisionModel ||
                                                        'llava'}
                                                </code>
                                            </p>
                                        </div>
                                    )}

                                    {visionProvider === 'openai' && !apiKey && (
                                        <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs border border-amber-200 flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            You need to add an OpenAI API Key
                                            above to use Vision.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        )}
                    </Card>

                    <Button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500/80 dark:hover:bg-blue-500 text-white shadow-none h-14 rounded-xl font-bold text-lg transition-all active:scale-95 disabled:opacity-50 border border-blue-600/20 dark:border-blue-300/20"
                    >
                        {saving ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            <>
                                <Save className="w-5 h-5 mr-2" /> Save
                                Configuration
                            </>
                        )}
                    </Button>
                </form>
            </div>
        </div>
    )
}
