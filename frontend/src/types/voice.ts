export type VoiceGender = 'male' | 'female' | 'other'

export interface VoiceInfo {
    id: string
    name: string
    gender: VoiceGender
}

export type VoicesResponse = {
    voices: string[]
    voices_info?: VoiceInfo[]
    error?: string
}
