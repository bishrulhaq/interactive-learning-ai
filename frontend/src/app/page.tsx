'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
    FileText,
    Upload,
    Loader2,
    BarChart2
} from 'lucide-react'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'

interface Document {
    id: number
    title: string
    created_at: string
    status: string
}

export default function Home() {
    const [documents, setDocuments] = useState<Document[]>([])
    const [loadingDocs, setLoadingDocs] = useState(true)
    const [stats, setStats] = useState({ documents: 0, quizzes: 0 })
    const router = useRouter()

    useEffect(() => {
        fetchDocuments()
        fetchStats()
    }, [])

    const fetchDocuments = async () => {
        try {
            const res = await api.get('/documents')
            setDocuments(res.data)
        } catch (err) {
            console.error('Failed to fetch documents', err)
        } finally {
            setLoadingDocs(false)
        }
    }

    const fetchStats = async () => {
        try {
            const res = await api.get('/stats')
            setStats(res.data)
        } catch (err) {
            console.error('Failed to fetch stats', err)
        }
    }

    const handleDocumentClick = (id: number) => {
        router.push(`/study/${id}`)
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
            {/* ... header and hero ... */}
            <header className="px-6 h-16 bg-white border-b flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-xl text-blue-600">
                    <BookOpen className="w-6 h-6" />
                    <span>EduRAG</span>
                </div>
                <div className="flex items-center gap-4">
                    <Button asChild className="hidden sm:flex">
                        <Link href="/upload">Upload New PDF</Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 py-8 space-y-12">
                {/* Hero Section */}
                <section className="text-center space-y-6 py-12">
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
                        Transform Your Documents into <br />
                        <span className="text-blue-600">
                            Interactive Courses
                        </span>
                    </h1>
                    <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                        Upload any PDF. Our AI tutor will generate lessons,
                        flashcards, and quizzes specifically tailored to your
                        material.
                    </p>
                    <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Button
                            size="lg"
                            className="rounded-full px-8 text-lg h-12 gap-2 shadow-lg hover:shadow-xl transition-all"
                            asChild
                        >
                            <Link href="/upload">
                                Start Learning{' '}
                                <ArrowRight className="w-5 h-5 ml-1" />
                            </Link>
                        </Button>
                    </div>
                </section>

                {/* Dashboard Grid */}
                <div className="grid md:grid-cols-12 gap-6">
                    {/* Quick Upload Card */}
                    <div className="md:col-span-4">
                        <Card className="h-full bg-blue-50 border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader>
                                <CardTitle className="text-blue-700 flex items-center gap-2">
                                    <Upload className="w-5 h-5" /> Quick Upload
                                </CardTitle>
                                <CardDescription className="text-blue-600/80">
                                    Support for PDF documents
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-slate-600 leading-relaxed">
                                    Drag and drop your course materials,
                                    research papers, or textbooks to instantly
                                    generate study aids.
                                </p>
                                <Button
                                    variant="default"
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-none"
                                    asChild
                                >
                                    <Link href="/upload">Upload PDF</Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recent Documents List */}
                    <div className="md:col-span-4">
                        <Card className="h-full shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-slate-800">
                                    <Clock className="w-5 h-5 text-slate-500" />{' '}
                                    Recent Documents
                                </CardTitle>
                                <CardDescription>
                                    Pick up where you left off
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {loadingDocs ? (
                                    <div className="flex justify-center p-4">
                                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="text-center p-4 text-slate-500 text-sm bg-slate-50 rounded-lg">
                                        No documents yet. Upload one to get
                                        started!
                                    </div>
                                ) : (
                                    documents.map((doc) => (
                                        <div
                                            key={doc.id}
                                            onClick={() =>
                                                handleDocumentClick(doc.id)
                                            }
                                            className="p-3 rounded-lg border bg-white hover:bg-slate-50 hover:border-blue-200 transition-all cursor-pointer flex items-center gap-3 group"
                                        >
                                            <div className="p-2 bg-red-50 rounded-md group-hover:bg-red-100 transition-colors">
                                                <FileText className="w-5 h-5 text-red-500" />
                                            </div>
                                            <div className="overflow-hidden flex-1">
                                                <p className="font-medium text-sm truncate text-slate-900">
                                                    {doc.title}
                                                </p>
                                                <p className="text-xs text-slate-500 flex justify-between mt-1">
                                                    <span>
                                                        {new Date(
                                                            doc.created_at
                                                        ).toLocaleDateString()}
                                                    </span>
                                                    <span className="capitalize text-blue-600">
                                                        {doc.status}
                                                    </span>
                                                </p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100" />
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Stats Card */}
                    <div className="md:col-span-4">
                        <Card className="h-full shadow-sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-slate-800">
                                    <BarChart2 className="w-5 h-5 text-green-600" />{' '}
                                    Stats
                                </CardTitle>
                                <CardDescription>
                                    Your learning progress
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-4 text-center">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-3xl font-bold text-slate-800">
                                        {stats.documents}
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">
                                        Documents
                                    </p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <p className="text-3xl font-bold text-slate-800">
                                        {stats.quizzes}
                                    </p>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mt-1">
                                        Quizzes Generated
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    )
}
