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
    Sparkles
} from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
    const [apiKey, setApiKey] = useState('')
    const [model, setModel] = useState('gpt-4o')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [connectionError, setConnectionError] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning', text: string } | null>(null)
    const router = useRouter()

    useEffect(() => {
        fetchSettings()
    }, [])

    const fetchSettings = async () => {
        setLoading(true)
        setConnectionError(false)
        try {
            console.log("Fetching settings from:", api.defaults.baseURL)
            const res = await api.get('/settings')
            const k = res.data.openai_api_key
            if (k) {
                setApiKey(k)
                setMessage(null)
            } else {
                setMessage({ type: 'warning', text: 'OpenAI API Key is not configured. Please add your key to enable AI features.' })
            }
            if (res.data.openai_model) setModel(res.data.openai_model)
        } catch (err) {
            console.error('Failed to fetch settings', err)
            setConnectionError(true)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage(null)

        try {
            await api.post('/settings', {
                llm_provider: 'openai',
                openai_api_key: apiKey,
                openai_model: model,
                embedding_provider: 'openai',
                embedding_model: 'text-embedding-3-small'
            })
            setMessage({ type: 'success', text: 'Settings saved successfully!' })
        } catch (err) {
            console.error('Failed to save settings', err)
            setMessage({ type: 'error', text: 'Failed to save settings. Please ensure the backend is running at ' + api.defaults.baseURL })
        } finally {
            setSaving(false)
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
                                <Key className="w-5 h-5" />
                                LLM Configuration
                            </CardTitle>
                            <CardDescription>
                                Enter your OpenAI details to enable AI features.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <Key className="w-4 h-4 text-slate-400" />
                                        OpenAI API Key
                                    </label>
                                    <Input
                                        type="password"
                                        placeholder="sk-..."
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        className="bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all font-mono h-12"
                                    />
                                    <p className="text-[10px] text-slate-400">
                                        Your key is stored securely and used only for your requests.
                                    </p>
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
                                                <span className="text-[10px] text-slate-400 font-medium">
                                                    {m === 'gpt-4o' ? 'Most Capable' : 'Faster & Cheaper'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
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
