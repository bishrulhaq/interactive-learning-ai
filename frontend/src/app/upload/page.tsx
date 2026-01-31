'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useDropzone } from 'react-dropzone'
import { Upload, Loader2, AlertCircle } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { AxiosError } from 'axios'

export default function UploadPage() {
    const router = useRouter()
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [progress, setProgress] = useState(0)

    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            const file = acceptedFiles[0]
            if (!file) return

            if (file.type !== 'application/pdf') {
                setError('Only PDF files are supported')
                return
            }

            setUploading(true)
            setError(null)
            setProgress(10)

            const formData = new FormData()
            formData.append('file', file)

            try {
                const interval = setInterval(() => {
                    setProgress((p) => Math.min(p + 10, 90))
                }, 500)

                const response = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })

                clearInterval(interval)
                setProgress(100)

                if (response.data.id) {
                    setTimeout(() => {
                        router.push(`/study/${response.data.id}`)
                    }, 1000)
                }
            } catch (err: unknown) {
                console.error(err)
                if (err instanceof AxiosError && err.response?.data?.detail) {
                    setError(err.response.data.detail)
                } else {
                    setError('Upload failed. Please try again.')
                }
                setUploading(false)
                setProgress(0)
            }
        },
        [router]
    )

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxFiles: 1,
        accept: { 'application/pdf': ['.pdf'] }
    })

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
            <div className="w-full max-w-xl text-center space-y-8">
                <div className="space-y-2">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
                        Upload Document
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        Start by uploading a PDF textbook or article.
                    </p>
                </div>

                <div
                    {...getRootProps()}
                    className={cn(
                        'border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer bg-white shadow-sm hover:shadow-md',
                        isDragActive
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-slate-200 hover:border-blue-400',
                        uploading && 'opacity-50 pointer-events-none'
                    )}
                >
                    <input {...getInputProps()} />
                    <div className="flex flex-col items-center space-y-4">
                        <div className="p-4 bg-slate-100 rounded-full">
                            {uploading ? (
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            ) : (
                                <Upload className="w-8 h-8 text-slate-600" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <p className="font-medium text-lg text-slate-900">
                                {uploading
                                    ? `Processing Document... ${progress}%`
                                    : 'Click to upload or drag & drop'}
                            </p>
                            <p className="text-sm text-slate-500">
                                PDF up to 10MB
                            </p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="flex items-center p-4 text-red-800 bg-red-50 rounded-lg">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    )
}
