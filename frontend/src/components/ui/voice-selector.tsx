'use client'

import { useRef, useState, useMemo } from 'react'
import {
    ChevronLeft,
    ChevronRight,
    Volume2,
    User,
    UserRound,
    Users
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { VoiceInfo, VoiceGender } from '@/types/voice'

interface VoiceSelectorProps {
    voices: string[]
    voicesInfo: VoiceInfo[]
    selectedVoice: string
    onSelect: (voiceId: string) => void
    onPlaySample?: (voiceId: string) => void
    isPlayingSample?: boolean
    playingVoiceId?: string | null
    showAllVoices?: boolean
    onToggleShowAll?: () => void
    className?: string
}

function inferGender(voiceId: string): VoiceGender {
    const p = voiceId.toLowerCase()
    if (p.startsWith('af_') || p.startsWith('bf_')) return 'female'
    if (p.startsWith('am_') || p.startsWith('bm_')) return 'male'
    return 'other'
}

function getDisplayName(voiceId: string, voicesInfo: VoiceInfo[]): string {
    const info = voicesInfo.find((v) => v.id === voiceId)
    if (info?.name) return info.name
    // Fallback: clean up the voice ID
    const cleaned = voiceId.replace(/^(af|am|bf|bm)_/i, '')
    const words = cleaned.split(/[_\-\s]+/).filter(Boolean)
    return words.map((w) => w.slice(0, 1).toUpperCase() + w.slice(1)).join(' ')
}

function getGender(voiceId: string, voicesInfo: VoiceInfo[]): VoiceGender {
    const info = voicesInfo.find((v) => v.id === voiceId)
    if (info?.gender === 'male' || info?.gender === 'female') return info.gender
    return inferGender(voiceId)
}

function GenderIcon({
    gender,
    className
}: {
    gender: VoiceGender
    className?: string
}) {
    if (gender === 'female') {
        return <UserRound className={cn('text-pink-500', className)} />
    }
    if (gender === 'male') {
        return <User className={cn('text-blue-500', className)} />
    }
    return <Users className={cn('text-slate-500', className)} />
}

export function VoiceSelector({
    voices,
    voicesInfo,
    selectedVoice,
    onSelect,
    onPlaySample,
    isPlayingSample,
    playingVoiceId,
    showAllVoices = false,
    onToggleShowAll,
    className
}: VoiceSelectorProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(true)

    const recommendedVoices = useMemo(() => {
        const preferred = [
            'af_bella',
            'bm_lewis',
            'af_sarah',
            'am_adam',
            'bf_emma',
            'am_michael',
            'bf_isabella',
            'af_nicole',
            'bm_george',
            'af_sky'
        ]
        const existing = new Set(voices)
        const picked: string[] = preferred.filter((v) => existing.has(v))
        for (const v of voices) {
            if (picked.length >= 10) break
            if (!picked.includes(v)) picked.push(v)
        }
        return picked.slice(0, 10)
    }, [voices])

    const displayVoices = useMemo(() => {
        const base = showAllVoices ? voices : recommendedVoices
        const out = [...base]
        if (
            selectedVoice &&
            !out.includes(selectedVoice) &&
            voices.includes(selectedVoice)
        ) {
            out.unshift(selectedVoice)
        }
        return out.length ? out : ['af_bella']
    }, [showAllVoices, voices, recommendedVoices, selectedVoice])

    const updateScrollState = () => {
        if (!scrollRef.current) return
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
        setCanScrollLeft(scrollLeft > 0)
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10)
    }

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollRef.current) return
        const amount = 200
        scrollRef.current.scrollBy({
            left: direction === 'left' ? -amount : amount,
            behavior: 'smooth'
        })
        setTimeout(updateScrollState, 300)
    }

    return (
        <div className={cn('space-y-3', className)}>
            {/* Header with toggle */}
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Select Voice
                </span>
                {onToggleShowAll && (
                    <button
                        type="button"
                        onClick={onToggleShowAll}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {showAllVoices ? 'Show recommended' : 'Show all'}
                    </button>
                )}
            </div>

            {/* Carousel container */}
            <div className="relative group">
                {/* Left scroll button */}
                {canScrollLeft && (
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                )}

                {/* Scrollable cards */}
                <div
                    ref={scrollRef}
                    onScroll={updateScrollState}
                    className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {displayVoices.map((voiceId) => {
                        const isSelected = voiceId === selectedVoice
                        const isPlaying =
                            playingVoiceId === voiceId && isPlayingSample
                        const gender = getGender(voiceId, voicesInfo)
                        const name = getDisplayName(voiceId, voicesInfo)

                        return (
                            <div
                                key={voiceId}
                                className={cn(
                                    'flex-shrink-0 w-28 rounded-xl border p-3 cursor-pointer transition-all duration-200',
                                    isSelected
                                        ? 'border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/10'
                                        : 'border-border bg-card hover:border-blue-500/50 hover:bg-muted/50'
                                )}
                                onClick={() => onSelect(voiceId)}
                            >
                                {/* Avatar */}
                                <div
                                    className={cn(
                                        'w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center transition-colors',
                                        isSelected
                                            ? 'bg-blue-500/20'
                                            : 'bg-muted'
                                    )}
                                >
                                    <GenderIcon
                                        gender={gender}
                                        className="w-6 h-6"
                                    />
                                </div>

                                {/* Name */}
                                <p
                                    className={cn(
                                        'text-sm font-medium text-center truncate',
                                        isSelected
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-foreground'
                                    )}
                                    title={name}
                                >
                                    {name}
                                </p>

                                {/* Play sample button */}
                                {onPlaySample && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onPlaySample(voiceId)
                                        }}
                                        className={cn(
                                            'w-full mt-2 h-7 text-xs gap-1',
                                            isPlaying
                                                ? 'text-blue-600 bg-blue-500/10'
                                                : 'text-muted-foreground'
                                        )}
                                    >
                                        <Volume2 className="w-3 h-3" />
                                        {isPlaying ? 'Stop' : 'Play'}
                                    </Button>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Right scroll button */}
                {canScrollRight && (
                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Info text */}
            <p className="text-xs text-muted-foreground">
                Showing {showAllVoices ? 'all' : 'recommended'} voices (
                {displayVoices.length})
            </p>
        </div>
    )
}
