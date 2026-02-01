'use client'

import { useEffect, useState } from 'react'
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
    ArrowRight,
    BookOpen,
    Clock,
    Plus,
    Settings,
    Loader2,
    Sparkles,
    LayoutGrid,
    Search,
    RefreshCw,
    AlertCircle
} from 'lucide-react'
import api from '@/lib/api'
import { KeyWall } from '@/components/KeyWall'

interface Workspace {
    id: number
    name: string
    created_at: string
}

export default function Home() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])
    const [loading, setLoading] = useState(true)
    const [newWorkspaceName, setNewWorkspaceName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [hasApiKey, setHasApiKey] = useState(true)
    const [connectionError, setConnectionError] = useState(false)
    const router = useRouter()

    useEffect(() => {
        fetchInitialData()
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        setConnectionError(false)
        try {
            // Check connection and workspaces
            const wsRes = await api.get('/workspaces')
            setWorkspaces(wsRes.data)

            // Check settings for API key
            const settingsRes = await api.get('/settings')
            setHasApiKey(!!settingsRes.data.openai_api_key)
        } catch (err) {
            console.error('Failed to fetch initial data', err)
            setConnectionError(true)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateWorkspace = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newWorkspaceName.trim()) return

        setIsCreating(true)
        try {
            const res = await api.post('/workspaces', { name: newWorkspaceName })
            router.push(`/study/${res.data.id}`)
        } catch (err) {
            console.error('Failed to create workspace', err)
        } finally {
            setIsCreating(false)
        }
    }

    const filteredWorkspaces = workspaces.filter(ws =>
        ws.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-500/20">
            {/* Ambient Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-blue-500/5 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] bg-indigo-500/5 blur-[120px] rounded-full animate-pulse delay-700" />
            </div>

            {/* Floating Settings Button */}
            <button
                onClick={() => router.push('/settings')}
                className="fixed top-8 right-8 z-50 p-4 rounded-full bg-white border border-slate-200 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-blue-200/50 transition-all hover:scale-110 active:scale-95 group"
            >
                <Settings className="w-6 h-6 text-slate-600 group-hover:rotate-90 transition-transform duration-500" />
            </button>

            <main className="relative z-10 container mx-auto px-6 py-20 lg:py-32">
                {/* Connection Error State */}
                {connectionError && (
                    <div className="max-w-2xl mx-auto mb-12 p-8 rounded-3xl bg-red-50 border border-red-100 shadow-sm text-center space-y-4 animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
                            <AlertCircle className="w-8 h-8 text-red-600" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold text-red-900">Backend Unreachable</h3>
                            <p className="text-red-700/70">
                                We couldn&apos;t connect to the server at <code className="bg-red-100/50 px-1 py-0.5 rounded font-bold">{api.defaults.baseURL}</code>.
                            </p>
                        </div>
                        <Button
                            onClick={fetchInitialData}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 px-8 rounded-xl transition-all shadow-lg shadow-red-200 group"
                        >
                            <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
                            Retry Connection
                        </Button>
                    </div>
                )}

                {/* API Key Warning */}
                {!connectionError && !hasApiKey && !loading && (
                    <div className="max-w-4xl mx-auto mb-16">
                        <KeyWall />
                    </div>
                )}

                {/* Hero section */}
                <div className="max-w-4xl mx-auto text-center space-y-8 mb-24">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-1000">
                        <Sparkles className="w-4 h-4" />
                        <span>Powered by Advanced RAG</span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-600 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-100">
                        Master Any Subject <br />With Your AI Tutor
                    </h1>

                    <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                        Create personalized workspaces, upload your study materials, and let our intelligent assistant guide you through complex concepts with ease.
                    </p>
                </div>

                {/* Main Content Grid */}
                <div className="grid lg:grid-cols-12 gap-12 max-w-7xl mx-auto">
                    {/* Left: Create Workspace */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-8">
                        <section className="animate-in fade-in slide-in-from-left-8 duration-1000 delay-300">
                            <h2 className="text-2xl font-semibold mb-6 flex items-center gap-3">
                                <Plus className="w-6 h-6 text-blue-500" />
                                Start Fresh
                            </h2>
                            <Card className="bg-white border-slate-200 shadow-2xl shadow-slate-200/50 overflow-hidden group rounded-[2rem]">
                                <CardHeader className="pb-4">
                                    <CardTitle className="text-xl">Create Workspace</CardTitle>
                                    <CardDescription className="text-slate-500 font-medium">
                                        Give your new study area a name to begin.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={handleCreateWorkspace} className="space-y-4">
                                        <div className="relative">
                                            <Input
                                                placeholder="e.g., Quantum Physics, Organic Chemistry"
                                                value={newWorkspaceName}
                                                onChange={(e) => setNewWorkspaceName(e.target.value)}
                                                className="bg-slate-50 border-slate-200 h-14 pl-4 pr-12 focus:ring-blue-500/20 transition-all text-lg rounded-2xl"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                <BookOpen className="w-5 h-5" />
                                            </div>
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={isCreating || !newWorkspaceName.trim()}
                                            className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-2xl shadow-lg shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            {isCreating ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Create Workspace'}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        </section>
                    </div>

                    {/* Right: Workspaces List */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-8">
                        <section className="animate-in fade-in slide-in-from-right-8 duration-1000 delay-400">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                                <h2 className="text-2xl font-semibold flex items-center gap-3">
                                    <LayoutGrid className="w-6 h-6 text-indigo-500" />
                                    Your Library
                                </h2>
                                <div className="relative w-full sm:w-64">
                                    <Input
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="bg-white border-slate-200 h-11 pl-10 rounded-full text-sm shadow-sm focus:ring-blue-500/10"
                                    />
                                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-6">
                                {loading ? (
                                    <div className="col-span-full flex flex-col items-center justify-center p-20 bg-white border border-slate-100 rounded-[2rem] shadow-sm">
                                        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                                        <p className="text-slate-400 font-medium animate-pulse">Scanning your library...</p>
                                    </div>
                                ) : filteredWorkspaces.length === 0 ? (
                                    <div className="col-span-full flex flex-col items-center justify-center p-16 bg-white border border-dashed border-slate-200 rounded-[2rem] text-center">
                                        <div className="p-4 bg-slate-50 rounded-full mb-4">
                                            <BookOpen className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <p className="text-slate-500 font-medium">
                                            {searchQuery ? "No matching workspaces found." : "Your library is empty. Start by creating a workspace!"}
                                        </p>
                                    </div>
                                ) : (
                                    filteredWorkspaces.map((ws, idx) => (
                                        <div
                                            key={ws.id}
                                            onClick={() => router.push(`/study/${ws.id}`)}
                                            style={{ animationDelay: `${idx * 100}ms` }}
                                            className="group relative p-8 rounded-[2rem] bg-white border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer shadow-sm hover:shadow-xl hover:shadow-blue-100/50 animate-in fade-in slide-in-from-bottom-4 duration-700"
                                        >
                                            <div className="flex items-start justify-between mb-6 relative z-10">
                                                <div className="p-4 bg-blue-50 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-inner">
                                                    <BookOpen className="w-6 h-6" />
                                                </div>
                                                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                            </div>

                                            <div className="relative z-10">
                                                <h3 className="font-bold text-xl text-slate-800 mb-2 group-hover:text-slate-900 transition-colors truncate">
                                                    {ws.name}
                                                </h3>
                                                <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                                                    <Clock className="w-4 h-4" />
                                                    {new Date(ws.created_at).toLocaleDateString(undefined, {
                                                        month: 'long',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    )
}
