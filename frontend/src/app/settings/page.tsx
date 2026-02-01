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
    InfoIcon
} from 'lucide-react'
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
    const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small')

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [downloadStatus, setDownloadStatus] = useState('')
    const [abortController, setAbortController] = useState<AbortController | null>(null)

    const [connectionError, setConnectionError] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null)
    const [runtimeInfo, setRuntimeInfo] = useState<{ device: string; cuda_available?: boolean; cuda_device_name?: string | null } | null>(null)
    const router = useRouter()

    useEffect(() => {
        fetchSettings()
    }, [])

    useEffect(() => {
        if (loading) return

        const llmReady = llmProvider === 'openai' ? !!apiKey : !!ollamaUrl
        const embedReady = embeddingProvider === 'openai' ? !!apiKey : true

        if (!llmReady || !embedReady) {
            setMessage({ type: 'warning', text: 'Some configuration fields are missing for your selected providers.' })
        } else if (message?.type === 'warning') {
            setMessage(null)
        }
    }, [llmProvider, embeddingProvider, apiKey, ollamaUrl, loading, message?.type])

    const needsOpenAiKey = llmProvider === 'openai' || embeddingProvider === 'openai'

    const fetchSettings = async () => {
        setLoading(true)
        setConnectionError(false)
        try {
            const res = await api.get('/settings')
            if (res.data.llm_provider) setLlmProvider(res.data.llm_provider)
            if (res.data.openai_api_key) setApiKey(res.data.openai_api_key)
            if (res.data.openai_model) setModel(res.data.openai_model)
            if (res.data.ollama_base_url) setOllamaUrl(res.data.ollama_base_url)
            if (res.data.embedding_provider) setEmbeddingProvider(res.data.embedding_provider)
            if (res.data.embedding_model) setEmbeddingModel(res.data.embedding_model)

            // Runtime hints (CPU/GPU) for advanced guidance.
            try {
                const rt = await api.get('/settings/runtime')
                setRuntimeInfo(rt.data)
            } catch {
                setRuntimeInfo(null)
            }
        } catch {
            setConnectionError(true)
        } finally {
            setLoading(false)
        }
    }

    const cancelDownload = () => {
        if (abortController) {
            abortController.abort()
            setAbortController(null)
            setIsDownloading(false)
            setMessage({ type: 'warning', text: 'Download cancelled by user.' })
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage(null)

        try {
            // Validation check before saving
            const llmReady = llmProvider === 'openai' ? !!apiKey : !!ollamaUrl
            const embedReady = embeddingProvider === 'openai' ? !!apiKey : true // HF is local

            if (!llmReady || !embedReady) {
                setMessage({ type: 'error', text: 'Please fill in all required fields for your selected providers.' })
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
                embedding_model: embeddingModel
            })

            // 2. If it's a local model, trigger the download/pull
            if (llmProvider === 'ollama' || embeddingProvider === 'huggingface') {
                await triggerDownload()
            } else {
                setMessage({ type: 'success', text: 'Settings saved successfully!' })
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to save settings.' })
        } finally {
            setSaving(false)
        }
    }

    const triggerDownload = async () => {
        setIsDownloading(true)
        setDownloadProgress(0)
        setDownloadStatus('Starting download...')

        const controller = new AbortController()
        setAbortController(controller)

        const provider = llmProvider === 'ollama' ? 'ollama' : 'huggingface'
        const name = llmProvider === 'ollama' ? model : embeddingModel

        try {
            const response = await fetch(`${api.defaults.baseURL}/settings/download-model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider,
                    model_name: name,
                    ollama_base_url: ollamaUrl
                }),
                signal: controller.signal
            })

            if (!response.body) throw new Error('No response body')

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { value, done } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6))
                        if (data.error) {
                            setMessage({ type: 'error', text: data.error })
                            setIsDownloading(false)
                            return
                        }
                        if (data.status) setDownloadStatus(data.status)
                        if (data.progress !== undefined) setDownloadProgress(data.progress)
                        if (data.status === 'success') {
                            setMessage({ type: 'success', text: 'Model ready!' })
                            setIsDownloading(false)
                            return
                        }
                    }
                }
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return
            const msg = err instanceof Error ? err.message : 'Unknown error'
            setMessage({ type: 'error', text: 'Download failed: ' + msg })
        } finally {
            setIsDownloading(false)
            setAbortController(null)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
                    <p className="text-slate-500 font-medium animate-pulse">Connecting to backend...</p>
                </div>
            </div>
        )
    }

    if (connectionError) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <Card className="max-w-md w-full border-none shadow-2xl bg-white overflow-hidden">
                    <div className="h-2 bg-red-500" />
                    <CardContent className="p-8 text-center space-y-6">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-slate-900">Connection Failed</h2>
                            <p className="text-slate-500 text-sm">
                                We couldn&apos;t reach the backend server at <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-bold">{api.defaults.baseURL}</code>.
                                Please ensure you have run <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-xs">.\run-dev.ps1</code> in your terminal.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <Button
                                onClick={fetchSettings}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-xl font-bold transition-all shadow-lg shadow-blue-200"
                            >
                                <Save className="w-4 h-4 mr-2" /> Retry Connection
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => router.push('/')}
                                className="w-full text-slate-500 hover:bg-slate-50 h-12 rounded-xl"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8 font-sans text-slate-900">
            <div className="max-w-2xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/')}
                            className="rounded-full hover:bg-white shadow-sm transition-all"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
                            <p className="text-slate-500">Configure your OpenAI Tutor</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSave} className="space-y-6">
                    {isDownloading && (
                        <div className="p-6 rounded-2xl bg-white border-2 border-blue-500 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-300">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <Download className="w-5 h-5 text-blue-600 animate-bounce" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900">Setting up your model...</p>
                                        <p className="text-xs text-slate-500">{downloadStatus}</p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={cancelDownload}
                                    className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg h-8"
                                >
                                    <XCircle className="w-4 h-4 mr-1" /> Stop Download
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs font-medium text-slate-600">
                                    <span>Progress</span>
                                    <span>{downloadProgress}%</span>
                                </div>
                                <Progress value={downloadProgress} className="h-2 bg-slate-100" />
                            </div>

                            <p className="text-[10px] text-center text-slate-400">
                                This might take a few minutes depending on your internet speed.
                            </p>
                        </div>
                    )}

                    {message && (
                        <div className={cn(
                            "p-5 rounded-2xl flex items-center gap-4 border shadow-sm animate-in fade-in slide-in-from-top-4 duration-300",
                            message.type === 'success' ? "bg-emerald-50 text-emerald-800 border-emerald-100" :
                                message.type === 'warning' ? "bg-amber-50 text-amber-800 border-amber-100" :
                                    "bg-red-50 text-red-800 border-red-100"
                        )}>
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                message.type === 'success' ? "bg-emerald-100" :
                                    message.type === 'warning' ? "bg-amber-100" : "bg-red-100"
                            )}>
                                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
                                    message.type === 'warning' ? <Sparkles className="w-5 h-5 text-amber-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
                            </div>
                            <div className="space-y-1">
                                <p className="font-bold text-sm">{message.type === 'success' ? 'All looking good!' : message.type === 'warning' ? 'Configuration Incomplete' : 'Something went wrong'}</p>
                                <p className="text-xs opacity-90">{message.text}</p>
                            </div>
                        </div>
                    )}

                    <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md overflow-hidden">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="flex items-center gap-2 text-lg text-blue-600">
                                LLM Configuration
                            </CardTitle>
                            <CardDescription>
                                Select your provider and configure model details.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-slate-400" />
                                        AI Provider
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { id: 'openai', name: 'OpenAI', icon: Sparkles },
                                            { id: 'ollama', name: 'Ollama (Local)', icon: Cpu }
                                        ].map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setLlmProvider(p.id)
                                                    // Avoid common misconfig: leaving OpenAI model name when switching to Ollama
                                                    if (p.id === 'ollama' && (model === 'gpt-4o' || model === 'gpt-4o-mini')) {
                                                        setModel('llama3')
                                                    }
                                                    if (p.id === 'openai' && model && !model.startsWith('gpt-')) {
                                                        setModel('gpt-4o')
                                                    }
                                                }}
                                                className={cn(
                                                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3",
                                                    llmProvider === p.id
                                                        ? "border-blue-500 bg-blue-50/50"
                                                        : "border-slate-100 bg-white hover:border-slate-200"
                                                )}
                                            >
                                                <p.icon className={cn("w-4 h-4", llmProvider === p.id ? "text-blue-600" : "text-slate-400")} />
                                                <span className={cn("font-bold text-sm", llmProvider === p.id ? "text-blue-700" : "text-slate-600")}>{p.name}</span>
                                                {llmProvider === p.id && <CheckCircle2 className="w-4 h-4 ml-auto text-blue-500" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {llmProvider === 'openai' ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                <Key className="w-4 h-4 text-slate-400" />
                                                OpenAI API Key <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                type="password"
                                                placeholder="sk-..."
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                                className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                            />
                                            {embeddingProvider === 'openai' && (
                                                <p className="text-[11px] text-slate-500">
                                                    This key is also used for OpenAI embeddings.
                                                </p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                <Cpu className="w-4 h-4 text-slate-400" />
                                                Select Model
                                            </label>
                                            <div className="grid grid-cols-2 gap-4">
                                                {['gpt-4o', 'gpt-4o-mini'].map((m) => (
                                                    <div
                                                        key={m}
                                                        onClick={() => setModel(m)}
                                                        className={cn(
                                                            "p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1",
                                                            model === m
                                                                ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/10"
                                                                : "border-slate-100 bg-white hover:border-slate-200"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between font-bold">
                                                            <span className={cn("text-xs uppercase tracking-wider", model === m ? "text-blue-700" : "text-slate-500")}>{m}</span>
                                                            {model === m && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {needsOpenAiKey && (
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                    <Key className="w-4 h-4 text-slate-400" />
                                                    OpenAI API Key <span className="text-red-500">*</span>
                                                </label>
                                                <Input
                                                    type="password"
                                                    placeholder="sk-..."
                                                    value={apiKey}
                                                    onChange={(e) => setApiKey(e.target.value)}
                                                    className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                                />
                                                <p className="text-[11px] text-slate-500">
                                                    Required because Embedding Provider is OpenAI (even if LLM is Ollama).
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 text-slate-400" />
                                                Ollama Base URL <span className="text-red-500">*</span>
                                            </label>
                                            <Input
                                                placeholder="http://localhost:11434"
                                                value={ollamaUrl}
                                                onChange={(e) => setOllamaUrl(e.target.value)}
                                                className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                                <Cpu className="w-4 h-4 text-slate-400" />
                                                Model Name
                                            </label>
                                            <Input
                                                placeholder="e.g. mistral, llama3, phi3"
                                                value={model}
                                                onChange={(e) => setModel(e.target.value)}
                                                className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md overflow-hidden">
                        <CardHeader className="border-b bg-slate-50/50">
                            <CardTitle className="flex items-center gap-2 text-lg text-blue-600">
                                <Sparkles className="w-5 h-5" />
                                Embedding Configuration
                            </CardTitle>
                            <CardDescription>
                                Select how your documents are processed into vectors.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-slate-400" />
                                        Embedding Provider
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { id: 'openai', name: 'OpenAI', icon: Sparkles },
                                            { id: 'huggingface', name: 'Hugging Face (Local)', icon: Cpu }
                                        ].map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => {
                                                    setEmbeddingProvider(p.id)
                                                    if (p.id === 'huggingface' && !HF_EMBEDDING_PRESETS.some(preset => preset.id === embeddingModel)) {
                                                        setEmbeddingModel(HF_EMBEDDING_PRESETS[0].id)
                                                    } else if (p.id === 'openai') {
                                                        setEmbeddingModel('text-embedding-3-small')
                                                    }
                                                }}
                                                className={cn(
                                                    "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3",
                                                    embeddingProvider === p.id
                                                        ? "border-blue-500 bg-blue-50/50"
                                                        : "border-slate-100 bg-white hover:border-slate-200"
                                                )}
                                            >
                                                <p.icon className={cn("w-4 h-4", embeddingProvider === p.id ? "text-blue-600" : "text-slate-400")} />
                                                <span className={cn("font-bold text-sm", embeddingProvider === p.id ? "text-blue-700" : "text-slate-600")}>{p.name}</span>
                                                {embeddingProvider === p.id && <CheckCircle2 className="w-4 h-4 ml-auto text-blue-500" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                            <Cpu className="w-4 h-4 text-slate-400" />
                                            Select Model
                                        </label>
                                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                            <InfoIcon className="w-3 h-3" />
                                            Dimensions matter for existing data
                                        </div>
                                    </div>

                                    {embeddingProvider === 'openai' ? (
                                        <div className="grid grid-cols-1 gap-3">
                                            {[
                                                { id: 'text-embedding-3-small', name: '3-Small (1536 dim)', speed: 'Fastest' },
                                                { id: 'text-embedding-ada-002', name: 'Ada-002 (Legacy 1536)', speed: 'Compatible' }
                                            ].map((m) => (
                                                <div
                                                    key={m.id}
                                                    onClick={() => setEmbeddingModel(m.id)}
                                                    className={cn(
                                                        "p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between",
                                                        embeddingModel === m.id
                                                            ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/10"
                                                            : "border-slate-100 bg-white hover:border-slate-200"
                                                    )}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className={cn("text-xs font-bold", embeddingModel === m.id ? "text-blue-700" : "text-slate-600")}>{m.name}</span>
                                                        <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{m.speed}</span>
                                                    </div>
                                                    {embeddingModel === m.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {runtimeInfo && (
                                                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
                                                    Detected device: <span className="font-mono font-bold">{runtimeInfo.device}</span>
                                                    {runtimeInfo.cuda_available && runtimeInfo.cuda_device_name ? (
                                                        <> ({runtimeInfo.cuda_device_name})</>
                                                    ) : null}
                                                    <div className="mt-1 text-slate-500">
                                                        Hugging Face embeddings will use <span className="font-mono">cuda</span> when available (override with env <span className="font-mono">RAG_HF_DEVICE</span>).
                                                    </div>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-1 gap-3">
                                                {HF_EMBEDDING_PRESETS.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        onClick={() => setEmbeddingModel(m.id)}
                                                        className={cn(
                                                            "p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col gap-1 relative",
                                                            embeddingModel === m.id
                                                                ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/10"
                                                                : "border-slate-100 bg-white hover:border-slate-200"
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex flex-col">
                                                                <span className={cn("text-sm font-bold", embeddingModel === m.id ? "text-blue-700" : "text-slate-700")}>{m.name}</span>
                                                                <span className="text-[9px] font-mono text-slate-400 truncate max-w-[240px]">{m.id}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">{m.dim}d</span>
                                                                {embeddingModel === m.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                                                            </div>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500">{m.desc}</p>
                                                        <div className="flex items-center gap-1.5 mt-1">
                                                            <Download className="w-3 h-3 text-slate-400" />
                                                            <span className="text-[10px] text-slate-400">{m.size}</span>
                                                        </div>
                                                        {m.warn && (
                                                            <div className={cn(
                                                                "mt-2 rounded-lg border px-2 py-1.5 text-[10px] leading-snug",
                                                                runtimeInfo?.device === 'cuda'
                                                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                                                    : "border-red-200 bg-red-50 text-red-800"
                                                            )}>
                                                                {m.warn}
                                                                {runtimeInfo?.device === 'cpu' && (
                                                                    <span className="block mt-1 text-red-700/80">
                                                                        Detected device is CPU. Consider a smaller model (384d/768d) if this fails.
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 h-14 rounded-xl font-bold text-lg transition-all active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-5 h-5 mr-2" /> Save Configuration</>}
                    </Button>
                </form>
            </div>
        </div>
    )
}
