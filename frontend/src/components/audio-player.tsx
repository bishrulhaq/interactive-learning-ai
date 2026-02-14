'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    SkipBack,
    SkipForward,
    Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioPlayerProps {
    src: string
    title?: string
    autoPlay?: boolean
    onEnded?: () => void
    className?: string
}

export function AudioPlayer({
    src,
    title,
    autoPlay = false,
    onEnded,
    className
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (autoPlay && audioRef.current) {
            audioRef.current
                .play()
                .catch((e) => console.error('AutoPlay error:', e))
        }
    }, [src, autoPlay])

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause()
            } else {
                audioRef.current.play()
            }
            setIsPlaying(!isPlaying)
        }
    }

    const toggleMute = () => {
        if (audioRef.current) {
            const newMuted = !isMuted
            audioRef.current.muted = newMuted
            setIsMuted(newMuted)
        }
    }

    const handleVolumeChange = (value: number[]) => {
        const newVolume = value[0]
        if (audioRef.current) {
            audioRef.current.volume = newVolume
            setVolume(newVolume)
            if (newVolume === 0) {
                setIsMuted(true)
            } else if (isMuted) {
                setIsMuted(false)
                audioRef.current.muted = false
            }
        }
    }

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime)
        }
    }

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration)
            setIsLoading(false)
        }
    }

    const handleSeek = (value: number[]) => {
        if (audioRef.current) {
            audioRef.current.currentTime = value[0]
            setCurrentTime(value[0])
        }
    }

    const handleSkip = (seconds: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime += seconds
        }
    }

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60)
        const seconds = Math.floor(time % 60)
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    return (
        <div
            className={cn(
                'bg-card border rounded-xl p-4 shadow-sm w-full space-y-4',
                className
            )}
        >
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => {
                    setIsPlaying(false)
                    onEnded?.()
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsLoading(true)}
                onCanPlay={() => setIsLoading(false)}
            />

            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    {title && (
                        <h4 className="font-medium text-sm truncate mb-1">
                            {title}
                        </h4>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration || 0)}</span>
                    </div>
                    <Slider
                        value={[currentTime]}
                        max={duration || 100}
                        step={1}
                        onValueChange={handleSeek}
                        className="w-full"
                    />
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={toggleMute}
                    >
                        {isMuted || volume === 0 ? (
                            <VolumeX className="h-4 w-4" />
                        ) : (
                            <Volume2 className="h-4 w-4" />
                        )}
                    </Button>
                    <Slider
                        value={[isMuted ? 0 : volume]}
                        max={1}
                        step={0.1}
                        onValueChange={handleVolumeChange}
                        className="w-20"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleSkip(-10)}
                    >
                        <SkipBack className="h-4 w-4" />
                    </Button>

                    <Button
                        size="icon"
                        className="h-10 w-10 rounded-full"
                        onClick={togglePlay}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : isPlaying ? (
                            <Pause className="h-5 w-5" />
                        ) : (
                            <Play className="h-5 w-5 ml-0.5" />
                        )}
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleSkip(10)}
                    >
                        <SkipForward className="h-4 w-4" />
                    </Button>
                </div>
                <div className="w-24"></div> {/* Spacer for balance */}
            </div>
        </div>
    )
}
