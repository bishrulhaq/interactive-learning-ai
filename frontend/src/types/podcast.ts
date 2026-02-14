export interface DialogueItem {
    speaker: string
    voice: string
    text: string
    voice_name?: string
    gender?: string
}

export interface Podcast {
    topic: string
    script: DialogueItem[]
    audio_path: string
    id?: number
    voice_a?: string
    voice_b?: string
    created_at?: string
}

export interface PodcastVersion {
    id: number
    voice_a: string
    voice_b: string
    voice_a_name: string
    voice_b_name: string
    audio_path: string
    created_at: string | null
}

export type VoicePairPreset = {
    voiceA: string
    voiceB: string
    ts: number
}
