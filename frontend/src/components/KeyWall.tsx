'use client'

import { ArrowRight, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface KeyWallProps {
    message?: string
    className?: string
}

export function KeyWall({ message, className }: KeyWallProps) {
    const router = useRouter()

    return (
        <div className={cn(
            "p-6 rounded-3xl bg-amber-50 border border-amber-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500",
            className
        )}>
            <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0 shadow-inner">
                    <Key className="w-7 h-7 text-amber-600" />
                </div>
                <div className="flex-1 text-center sm:text-left space-y-1">
                    <h3 className="text-lg font-bold text-amber-900">AI Configuration Required</h3>
                    <p className="text-amber-700/80 text-sm leading-relaxed">
                        {message || "To start chatting with your documents, generating quizzes, or creating podcasts, you'll need to configure your AI settings in the dashboard."}
                    </p>
                </div>
                <Button
                    onClick={() => router.push('/settings')}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-12 px-6 rounded-xl transition-all shadow-lg shadow-amber-200 group"
                >
                    Config Settings
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
            </div>
        </div>
    )
}
