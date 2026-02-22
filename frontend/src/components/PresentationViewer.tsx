'use client'

import { useState } from 'react'
import { Presentation } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, List, MessageCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PresentationViewerProps {
    presentation: Presentation
}

export function PresentationViewer({ presentation }: PresentationViewerProps) {
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
    const [showNotes, setShowNotes] = useState(false)

    if (
        !presentation ||
        !presentation.slides ||
        presentation.slides.length === 0
    ) {
        return null
    }

    const currentSlide = presentation.slides[currentSlideIndex]
    const isFirstSlide = currentSlideIndex === 0
    const isLastSlide = currentSlideIndex === presentation.slides.length - 1

    const handlePrevious = () => {
        if (!isFirstSlide) setCurrentSlideIndex(currentSlideIndex - 1)
    }

    const handleNext = () => {
        if (!isLastSlide) setCurrentSlideIndex(currentSlideIndex + 1)
    }

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto p-4 md:p-8 space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
                    {presentation.title}
                </h2>
                <div className="flex items-center gap-2">
                    <Badge
                        variant="outline"
                        className="text-sm px-3 py-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800"
                    >
                        Slide {currentSlideIndex + 1} of{' '}
                        {presentation.slides.length}
                    </Badge>
                </div>
            </div>

            <Card className="flex-1 flex flex-col shadow-xl border-slate-200/60 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 overflow-hidden relative group">
                {/* Decorative top bar */}
                <div className="h-2 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

                <CardHeader className="md:px-12 md:pt-10 pb-4 border-b border-slate-100 dark:border-slate-800/60">
                    <CardTitle className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight leading-tight">
                        {currentSlide.title}
                    </CardTitle>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col md:px-12 py-8 overflow-y-auto w-full prose dark:prose-invert max-w-none">
                    {/* Content Section */}
                    {currentSlide.content && (
                        <div className="text-lg md:text-xl text-slate-700 dark:text-slate-300 mb-8 leading-relaxed font-medium bg-white/50 dark:bg-slate-900/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm backdrop-blur-sm">
                            <ReactMarkdown>
                                {currentSlide.content}
                            </ReactMarkdown>
                        </div>
                    )}

                    {/* Bullet Points Section */}
                    {currentSlide.bullet_points &&
                        currentSlide.bullet_points.length > 0 && (
                            <div className="mt-4 flex-1">
                                <div className="flex items-center gap-2 mb-4 text-blue-600 dark:text-blue-400 font-semibold tracking-wide uppercase text-sm">
                                    <List className="w-4 h-4" />
                                    <span>Key Points</span>
                                </div>
                                <ul className="space-y-4 text-lg text-slate-600 dark:text-slate-400 list-none pl-0">
                                    {currentSlide.bullet_points.map(
                                        (point, index) => (
                                            <li
                                                key={index}
                                                className="flex items-start gap-4 p-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors group/item"
                                            >
                                                <div className="shrink-0 w-2 h-2 mt-2.5 rounded-full bg-blue-500 group-hover/item:scale-150 group-hover/item:bg-indigo-500 transition-all shadow-sm shadow-blue-500/30" />
                                                <span className="leading-relaxed">
                                                    <ReactMarkdown>
                                                        {point}
                                                    </ReactMarkdown>
                                                </span>
                                            </li>
                                        )
                                    )}
                                </ul>
                            </div>
                        )}
                </CardContent>
            </Card>

            {/* Slide Controls and Notes Toggle */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-6">
                <Button
                    variant="outline"
                    className={cn(
                        'gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 border-slate-300 dark:border-slate-700 transition-all',
                        showNotes &&
                            'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-600'
                    )}
                    onClick={() => setShowNotes(!showNotes)}
                >
                    <MessageCircle className="w-4 h-4" />
                    {showNotes ? 'Hide Speaker Notes' : 'Show Speaker Notes'}
                </Button>

                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={handlePrevious}
                        disabled={isFirstSlide}
                        className="gap-2 shadow-sm font-medium w-32"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                    </Button>
                    <div className="flex gap-1.5 px-2">
                        {presentation.slides.map((_, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    'h-2 rounded-full transition-all cursor-pointer',
                                    currentSlideIndex === idx
                                        ? 'w-6 flex-1 bg-blue-600 shadow-sm shadow-blue-500/20'
                                        : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
                                )}
                                onClick={() => setCurrentSlideIndex(idx)}
                            />
                        ))}
                    </div>
                    <Button
                        variant="default"
                        size="lg"
                        className="gap-2 shadow-md shadow-blue-500/20 font-medium w-32 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={handleNext}
                        disabled={isLastSlide}
                    >
                        Next
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Speaker Notes Area */}
            {showNotes && currentSlide.speaker_notes && (
                <Card className="mt-4 border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 animate-in slide-in-from-bottom-2 fade-in">
                    <CardHeader className="py-3 px-4 flex flex-row items-center gap-2 border-b border-amber-100 dark:border-amber-900/30">
                        <MessageCircle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                        <CardTitle className="text-sm font-medium text-amber-800 dark:text-amber-400 uppercase tracking-widest">
                            Speaker Notes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 text-amber-900/80 dark:text-amber-200/70 text-sm leading-relaxed italic prose dark:prose-invert max-w-none prose-p:my-1">
                        <ReactMarkdown>
                            {currentSlide.speaker_notes}
                        </ReactMarkdown>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
