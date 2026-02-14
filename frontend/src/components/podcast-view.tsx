'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { VoiceSelector } from '@/components/ui/voice-selector'
import {
    Loader2,
    Mic,
    RotateCcw,
    Users,
    User,
    UserRound,
    Trash2,
    BookOpen
} from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { inferVoiceGender, prettyVoiceName } from '@/lib/voice-utils'
import { AudioPlayer } from './audio-player'
import type {
    VoiceInfo,
    VoicesResponse,
    Podcast,
    PodcastVersion,
    VoicePairPreset
} from '@/types'

export default function PodcastView({
    workspaceId,
    initialTopic = 'Key Concepts'
}: {
    workspaceId: number
    initialTopic?: string
}) {
    const [podcast, setPodcast] = useState<Podcast | null>(null)
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [pollTimedOut, setPollTimedOut] = useState(false)
    const pollAttemptsRef = useRef(0)
    const [voices, setVoices] = useState<string[]>([])
    const [voicesInfo, setVoicesInfo] = useState<VoiceInfo[]>([])
    const [voiceA, setVoiceA] = useState('af_bella')
    const [voiceB, setVoiceB] = useState('bm_lewis')
    const [voicesTouched, setVoicesTouched] = useState(false)
    const [showAllVoices, setShowAllVoices] = useState(false)
    const sampleAudioRef = useRef<HTMLAudioElement | null>(null)
    const sampleCacheRef = useRef<Map<string, string>>(new Map()) // voice -> Blob URL
    const [samplePlayingVoice, setSamplePlayingVoice] = useState<string | null>(
        null
    )
    const [recentPresets, setRecentPresets] = useState<VoicePairPreset[]>([])
    const [presetNotice, setPresetNotice] = useState<string | null>(null)
    const [versions, setVersions] = useState<PodcastVersion[]>([])
    const [selectedVersionId, setSelectedVersionId] = useState<number | null>(
        null
    )
    const [maxVersions, setMaxVersions] = useState(3)
    const [synthesisProgress, setSynthesisProgress] = useState(0)
    const [synthesisMessage, setSynthesisMessage] = useState('')

    const speakers = useMemo(() => {
        if (!podcast?.script?.length) return []
        const out: string[] = []
        for (const item of podcast.script) {
            if (!out.includes(item.speaker)) out.push(item.speaker)
            if (out.length >= 2) break
        }
        return out
    }, [podcast?.script])

    const presetsKey = useMemo(() => {
        return `podcast:voice-presets:${workspaceId}:${initialTopic}`
    }, [workspaceId, initialTopic])

    // Create a lookup map for voice names
    const voiceNameMap = useMemo(() => {
        const map: Record<string, string> = {}
        for (const info of voicesInfo) {
            map[info.id] = info.name
        }
        return map
    }, [voicesInfo])

    // Helper to get display name for a voice
    const getVoiceDisplayName = (voiceId: string) => {
        return voiceNameMap[voiceId] || prettyVoiceName(voiceId)
    }

    const fetchExisting = useCallback(
        async (isPolling = false) => {
            if (!isPolling) setLoading(true)
            try {
                const res = await api.get('/generate/existing', {
                    params: { workspace_id: workspaceId, topic: initialTopic }
                })
                if (res.data.podcast) {
                    setPodcast(res.data.podcast)
                }
            } catch (e) {
                console.error('Error fetching existing podcast:', e)
            } finally {
                if (!isPolling) setLoading(false)
            }
        },
        [workspaceId, initialTopic]
    )

    useEffect(() => {
        pollAttemptsRef.current = 0
        setPollTimedOut(false)
        fetchExisting()
    }, [fetchExisting])

    useEffect(() => {
        let cancelled = false
        const loadVoices = async () => {
            try {
                const res = await api.get<VoicesResponse>('/tts/voices')
                const list = Array.isArray(res.data?.voices)
                    ? res.data.voices
                    : []
                const info = Array.isArray(res.data?.voices_info)
                    ? res.data.voices_info
                    : []
                if (!cancelled) {
                    setVoices(list)
                    setVoicesInfo(info)
                }
            } catch {
                if (!cancelled) {
                    setVoices([])
                    setVoicesInfo([])
                }
            }
        }
        loadVoices()
        return () => {
            cancelled = true
        }
    }, [])

    // Load podcast versions
    const loadVersions = useCallback(async () => {
        try {
            const res = await api.get('/podcasts/versions', {
                params: {
                    workspace_id: workspaceId,
                    topic: initialTopic,
                    type: 'duo'
                }
            })
            const versionsList = res.data?.versions || []
            setVersions(versionsList)
            setMaxVersions(res.data?.max_versions || 3)

            // If we have versions, load the first one
            if (versionsList.length > 0 && !selectedVersionId) {
                const firstVersion = versionsList[0]
                setSelectedVersionId(firstVersion.id)
                // Load full podcast data for this version
                const podcastRes = await api.get(`/podcasts/${firstVersion.id}`)
                setPodcast(podcastRes.data)
                setVoiceA(firstVersion.voice_a)
                setVoiceB(firstVersion.voice_b)
            }
        } catch (e) {
            console.error('Error loading versions:', e)
        }
    }, [workspaceId, initialTopic, selectedVersionId])

    useEffect(() => {
        loadVersions()
    }, [loadVersions])

    useEffect(() => {
        const cache = sampleCacheRef.current
        return () => {
            // cleanup sample cache
            cache.forEach((url) => URL.revokeObjectURL(url))
            cache.clear()
        }
    }, [])

    useEffect(() => {
        // Load recent presets for this workspace/topic.
        try {
            const raw = localStorage.getItem(presetsKey)
            if (!raw) return
            const parsed = JSON.parse(raw) as VoicePairPreset[]
            if (Array.isArray(parsed)) {
                setRecentPresets(
                    parsed
                        .filter(
                            (p) =>
                                typeof p?.voiceA === 'string' &&
                                typeof p?.voiceB === 'string' &&
                                typeof p?.ts === 'number'
                        )
                        .slice(0, 6)
                )
            }
        } catch {
            // ignore
        }
    }, [presetsKey])

    useEffect(() => {
        if (!presetNotice) return
        const t = setTimeout(() => setPresetNotice(null), 2200)
        return () => clearTimeout(t)
    }, [presetNotice])

    const savePreset = useCallback(
        (a: string, b: string) => {
            const now = Date.now()
            setRecentPresets((prev) => {
                const already = prev.some(
                    (p) => p.voiceA === a && p.voiceB === b
                )
                if (already) {
                    setPresetNotice(
                        'This voice pair is already saved in your recent presets.'
                    )
                } else {
                    setPresetNotice('Saved voice pair to recent presets.')
                }
                const next = [{ voiceA: a, voiceB: b, ts: now }, ...prev]
                const seen = new Set<string>()
                const deduped: VoicePairPreset[] = []
                for (const p of next) {
                    const key = `${p.voiceA}::${p.voiceB}`
                    if (seen.has(key)) continue
                    seen.add(key)
                    deduped.push(p)
                    if (deduped.length >= 6) break
                }
                try {
                    localStorage.setItem(presetsKey, JSON.stringify(deduped))
                } catch {
                    // ignore
                }
                return deduped
            })
        },
        [presetsKey]
    )

    // If user hasn't touched voices yet, use the most recent preset (when no script exists).
    useEffect(() => {
        if (voicesTouched) return
        if (!recentPresets.length) return
        if (podcast?.script?.length) return
        setVoiceA(recentPresets[0].voiceA)
        setVoiceB(recentPresets[0].voiceB)
    }, [voicesTouched, recentPresets, podcast?.script])

    // If we loaded an existing podcast and user hasn't touched voice selection,
    // seed selectors from the script.
    useEffect(() => {
        if (!podcast?.script?.length || voicesTouched) return
        const uniqueSpeakers: string[] = []
        const speakerVoice: Record<string, string> = {}
        for (const item of podcast.script) {
            if (!uniqueSpeakers.includes(item.speaker))
                uniqueSpeakers.push(item.speaker)
            if (!speakerVoice[item.speaker])
                speakerVoice[item.speaker] = item.voice
            if (uniqueSpeakers.length >= 2) break
        }
        if (uniqueSpeakers[0] && speakerVoice[uniqueSpeakers[0]]) {
            setVoiceA(speakerVoice[uniqueSpeakers[0]])
        }
        if (uniqueSpeakers[1] && speakerVoice[uniqueSpeakers[1]]) {
            setVoiceB(speakerVoice[uniqueSpeakers[1]])
        }
    }, [podcast?.script, voicesTouched])

    // SSE listener for real-time synthesis progress
    useEffect(() => {
        if (!podcast || podcast.audio_path || !podcast.id) return

        const eventSource = new EventSource(
            `${api.defaults.baseURL}/podcast/synthesis/progress/${podcast.id}`
        )

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                setSynthesisProgress(data.progress || 0)
                setSynthesisMessage(data.message || '')

                if (data.status === 'complete') {
                    // Synthesis complete, reload podcast data and versions
                    fetchExisting(true)
                    loadVersions()
                    eventSource.close()
                } else if (data.status === 'failed') {
                    console.error('Synthesis failed:', data.message)
                    setPollTimedOut(true)
                    eventSource.close()
                }
            } catch (e) {
                console.error('Error parsing SSE data:', e)
            }
        }

        eventSource.onerror = (error) => {
            console.error('SSE connection error:', error)
            eventSource.close()
            // Fallback to polling if SSE fails
            setPollTimedOut(true)
        }

        return () => {
            eventSource.close()
        }
    }, [podcast, fetchExisting, loadVersions])

    const playVoiceSample = useCallback(
        async (voice: string) => {
            try {
                if (samplePlayingVoice === voice) {
                    sampleAudioRef.current?.pause()
                    setSamplePlayingVoice(null)
                    return
                }

                const cached = sampleCacheRef.current.get(voice)
                let url = cached
                if (!url) {
                    const base = String(
                        api.defaults.baseURL || 'http://localhost:8000'
                    ).replace(/\/$/, '')
                    const sampleText = 'Hello! This is a sample of my voice.'
                    const res = await fetch(
                        `${base}/generate/narration?text=${encodeURIComponent(
                            sampleText
                        )}&voice=${encodeURIComponent(voice)}`
                    )
                    const blob = await res.blob()
                    url = URL.createObjectURL(blob)
                    sampleCacheRef.current.set(voice, url)
                }

                if (!sampleAudioRef.current)
                    sampleAudioRef.current = new Audio()
                sampleAudioRef.current.pause()
                sampleAudioRef.current.src = url
                sampleAudioRef.current.onended = () =>
                    setSamplePlayingVoice(null)
                await sampleAudioRef.current.play()
                setSamplePlayingVoice(voice)
            } catch (e) {
                console.error('Failed to play voice sample', e)
                setSamplePlayingVoice(null)
            }
        },
        [samplePlayingVoice]
    )

    const selectVersion = useCallback(
        async (versionId: number) => {
            try {
                setSelectedVersionId(versionId)
                const res = await api.get(`/podcasts/${versionId}`)
                setPodcast(res.data)
                // Update voice selectors to match the selected version
                const version = versions.find((v) => v.id === versionId)
                if (version) {
                    setVoiceA(version.voice_a)
                    setVoiceB(version.voice_b)
                }
            } catch (e) {
                console.error('Error selecting version:', e)
            }
        },
        [versions]
    )

    const deleteVersion = useCallback(
        async (versionId: number) => {
            if (!confirm('Delete this podcast version?')) return
            try {
                await api.delete(`/podcasts/${versionId}`)
                // Refresh versions list
                await loadVersions()
                // If we deleted the selected version, clear the podcast
                if (selectedVersionId === versionId) {
                    setPodcast(null)
                    setSelectedVersionId(null)
                }
            } catch (e) {
                console.error('Error deleting version:', e)
            }
        },
        [selectedVersionId, loadVersions]
    )

    const generatePodcast = async (type: 'single' | 'duo' = 'duo') => {
        setGenerating(true)
        pollAttemptsRef.current = 0
        setPollTimedOut(false)
        try {
            if (type === 'duo') savePreset(voiceA, voiceB)
            const res = await api.post(`/generate/podcast?type=${type}`, {
                topic: initialTopic,
                workspace_id: workspaceId,
                ...(type === 'duo'
                    ? { voice_a: voiceA, voice_b: voiceB }
                    : { voice: voiceA })
            })
            setPodcast(res.data)
            // Update selected version if we got an id back
            if (res.data?.id) {
                setSelectedVersionId(res.data.id)
            }
            // Refresh versions list
            await loadVersions()
        } catch (e: unknown) {
            const error = e as { response?: { data?: { detail?: string } } }
            const detail = error.response?.data?.detail
            if (detail) {
                alert(detail)
            } else {
                console.error('Error generating podcast:', e)
            }
        } finally {
            setGenerating(false)
        }
    }

    const retryAudio = async () => {
        pollAttemptsRef.current = 0
        setPollTimedOut(false)

        // Immediately clear audio_path to trigger SSE listener
        if (podcast) {
            setPodcast({ ...podcast, audio_path: '' })
        }

        try {
            savePreset(voiceA, voiceB)
            await api.post(`/generate/podcast/resynthesize?type=duo`, {
                topic: initialTopic,
                workspace_id: workspaceId,
                voice_a: voiceA,
                voice_b: voiceB
            })
            fetchExisting(true)
            loadVersions()
        } catch (e) {
            console.error('Error re-synthesizing podcast audio:', e)
        }
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Mic className="text-blue-600 w-8 h-8" />
                        AI Deep Dive
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Turn your document into an engaging conversation.
                    </p>
                </div>
            </div>

            {/* Podcast Versions */}
            {versions.length > 0 && (
                <Card className="border border-border bg-card/60 backdrop-blur-md">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                Saved Versions ({versions.length}/{maxVersions})
                            </p>
                        </div>
                        <div
                            className="flex gap-3 overflow-x-auto pb-2"
                            style={{ scrollbarWidth: 'none' }}
                        >
                            {versions.map((v) => (
                                <div
                                    key={v.id}
                                    className={cn(
                                        'relative flex-shrink-0 rounded-lg border p-3 cursor-pointer transition-all min-w-[140px]',
                                        selectedVersionId === v.id
                                            ? 'border-blue-500 bg-blue-500/10 shadow-md'
                                            : 'border-border bg-muted/30 hover:border-blue-500/50'
                                    )}
                                    onClick={() => selectVersion(v.id)}
                                >
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            deleteVersion(v.id)
                                        }}
                                        className="absolute top-1 right-1 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                        title="Delete version"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                    <div className="flex items-center gap-2 mb-2">
                                        {inferVoiceGender(v.voice_a) ===
                                        'female' ? (
                                            <UserRound className="w-4 h-4 text-pink-500" />
                                        ) : (
                                            <User className="w-4 h-4 text-blue-500" />
                                        )}
                                        <span className="text-sm font-medium">
                                            {v.voice_a_name || 'Unknown'}
                                        </span>
                                    </div>
                                    {v.voice_b && (
                                        <div className="flex items-center gap-2">
                                            {inferVoiceGender(v.voice_b) ===
                                            'female' ? (
                                                <UserRound className="w-4 h-4 text-pink-500" />
                                            ) : (
                                                <User className="w-4 h-4 text-blue-500" />
                                            )}
                                            <span className="text-sm font-medium">
                                                {v.voice_b_name || 'Unknown'}
                                            </span>
                                        </div>
                                    )}
                                    {!v.audio_path && (
                                        <div className="mt-2 text-xs text-amber-500 flex items-center gap-1">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Generating...
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Voice profiles (saved + previewable) */}
            <Card className="border border-border bg-card/60 backdrop-blur-md">
                <CardContent className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">
                                Narrators
                            </p>
                            <p className="text-sm text-foreground">
                                Pick voices, preview tone, and re-synthesize
                                anytime.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAllVoices((v) => !v)}
                                className="text-xs text-muted-foreground hover:text-foreground"
                                title="Toggle recommended/all voices"
                            >
                                {showAllVoices
                                    ? 'Show recommended'
                                    : 'Show all'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={retryAudio}
                                disabled={generating || !podcast}
                                title="Re-synthesize using selected voices"
                            >
                                Re-synthesize audio
                            </Button>
                        </div>
                    </div>

                    {presetNotice && (
                        <div className="text-xs text-muted-foreground">
                            {presetNotice}
                        </div>
                    )}

                    {recentPresets.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                                Recent voice pairs
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {recentPresets.map((p) => (
                                    <button
                                        key={`${p.voiceA}::${p.voiceB}`}
                                        type="button"
                                        onClick={() => {
                                            setVoicesTouched(true)
                                            setVoiceA(p.voiceA)
                                            setVoiceB(p.voiceB)
                                        }}
                                        className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-muted/40"
                                        title="Apply this voice pair"
                                    >
                                        <span className="font-mono">
                                            {getVoiceDisplayName(p.voiceA)} +{' '}
                                            {getVoiceDisplayName(p.voiceB)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* Speaker A */}
                        <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                {inferVoiceGender(voiceA) === 'female' ? (
                                    <UserRound className="w-5 h-5 text-pink-500" />
                                ) : inferVoiceGender(voiceA) === 'male' ? (
                                    <User className="w-5 h-5 text-blue-500" />
                                ) : (
                                    <Users className="w-5 h-5 text-slate-500" />
                                )}
                                <div>
                                    <p className="text-sm font-semibold">
                                        {getVoiceDisplayName(voiceA)}
                                    </p>
                                </div>
                            </div>
                            <VoiceSelector
                                voices={voices}
                                voicesInfo={voicesInfo}
                                selectedVoice={voiceA}
                                onSelect={(v) => {
                                    setVoicesTouched(true)
                                    setVoiceA(v)
                                }}
                                onPlaySample={playVoiceSample}
                                isPlayingSample={!!samplePlayingVoice}
                                playingVoiceId={samplePlayingVoice}
                                showAllVoices={showAllVoices}
                                onToggleShowAll={() =>
                                    setShowAllVoices((v) => !v)
                                }
                            />
                        </div>

                        {/* Speaker B */}
                        <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                {inferVoiceGender(voiceB) === 'female' ? (
                                    <UserRound className="w-5 h-5 text-pink-500" />
                                ) : inferVoiceGender(voiceB) === 'male' ? (
                                    <User className="w-5 h-5 text-blue-500" />
                                ) : (
                                    <Users className="w-5 h-5 text-slate-500" />
                                )}
                                <div>
                                    <p className="text-sm font-semibold">
                                        {getVoiceDisplayName(voiceB)}
                                    </p>
                                </div>
                            </div>
                            <VoiceSelector
                                voices={voices}
                                voicesInfo={voicesInfo}
                                selectedVoice={voiceB}
                                onSelect={(v) => {
                                    setVoicesTouched(true)
                                    setVoiceB(v)
                                }}
                                onPlaySample={playVoiceSample}
                                isPlayingSample={!!samplePlayingVoice}
                                playingVoiceId={samplePlayingVoice}
                                showAllVoices={showAllVoices}
                                onToggleShowAll={() =>
                                    setShowAllVoices((v) => !v)
                                }
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!podcast ? (
                <Card className="border-dashed border-2 bg-muted/20">
                    <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
                            <Users className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">
                            No Podcast Generated Yet
                        </h3>
                        <p className="text-muted-foreground mb-8 max-w-sm">
                            Generate a two-person conversational deep dive to
                            learn about this topic naturally.
                        </p>
                        <Button
                            size="lg"
                            onClick={() => generatePodcast('duo')}
                            disabled={generating}
                            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500/80 dark:hover:bg-blue-500 shadow-lg shadow-blue-200 dark:shadow-none border border-blue-600/20 dark:border-blue-300/20"
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                                    Creating Script...
                                </>
                            ) : (
                                <>
                                    <Mic className="w-5 h-5 mr-2" />
                                    Generate 2-Speaker Podcast
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* Audio Player Card */}
                    <Card className="bg-slate-900 text-white overflow-hidden border-none">
                        <CardContent className="p-8">
                            <div className="flex flex-col items-center">
                                <span className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-2">
                                    {podcast.audio_path
                                        ? 'NOW PLAYING'
                                        : 'SYNTHESIZING AUDIO'}
                                </span>
                                <h3 className="text-2xl font-bold text-center mb-8">
                                    {podcast.topic}
                                </h3>

                                {podcast.audio_path ? (
                                    <div className="w-full max-w-2xl">
                                        <AudioPlayer
                                            src={`${api.defaults.baseURL}/${podcast.audio_path}`}
                                            title={podcast.topic}
                                            className="bg-slate-800/50 border-slate-700 text-slate-100"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4 py-8 w-full max-w-2xl">
                                        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />

                                        {/* Progress Bar */}
                                        {synthesisProgress > 0 && (
                                            <div className="w-full space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-slate-400">
                                                        {synthesisMessage}
                                                    </span>
                                                    <span className="text-blue-400 font-semibold">
                                                        {synthesisProgress}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-full transition-all duration-300 ease-out"
                                                        style={{
                                                            width: `${synthesisProgress}%`
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <p className="text-slate-400 animate-pulse text-center">
                                            {pollTimedOut
                                                ? 'Audio is taking too long or failed. You can retry synthesis.'
                                                : synthesisProgress > 0
                                                  ? 'Synthesizing audio...'
                                                  : 'Processing voices... This may take up to a minute.'}
                                        </p>
                                        {pollTimedOut && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={retryAudio}
                                                className="bg-transparent border-white/15 text-white hover:bg-white/10"
                                            >
                                                Retry Audio
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Script Section */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-slate-700 flex items-center gap-2 px-2">
                            <BookOpen className="w-4 h-4" />
                            Podcast Script
                        </h4>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {podcast.script.map((line, idx) => (
                                <div
                                    key={idx}
                                    className={cn(
                                        'p-4 rounded-2xl max-w-[85%] shadow-sm border',
                                        line.speaker === (speakers[0] || 'Alex')
                                            ? 'bg-blue-50 border-blue-100 rounded-bl-none ml-0'
                                            : 'bg-white border-slate-100 rounded-br-none ml-auto text-right'
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span
                                            className={cn(
                                                'text-[10px] font-bold uppercase tracking-wider',
                                                line.speaker ===
                                                    (speakers[0] || 'Alex')
                                                    ? 'text-blue-600'
                                                    : 'text-slate-500'
                                            )}
                                        >
                                            {line.speaker}
                                        </span>
                                    </div>
                                    <p className="text-slate-700 leading-relaxed text-sm">
                                        {line.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generatePodcast('duo')}
                            disabled={generating}
                        >
                            <RotateCcw className="w-4 h-4 mr-2" /> Regenerate
                            Podcast
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
