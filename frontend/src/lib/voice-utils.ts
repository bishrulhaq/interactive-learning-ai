export function inferVoiceGender(
    voiceId: string | undefined | null
): 'female' | 'male' | 'other' {
    if (!voiceId) return 'other'
    const p = voiceId.toLowerCase()
    if (p.startsWith('af_') || p.startsWith('bf_')) return 'female'
    if (p.startsWith('am_') || p.startsWith('bm_')) return 'male'
    return 'other'
}

export function prettyVoiceName(voiceId: string | undefined | null): string {
    if (!voiceId) return 'Unknown Voice'
    const cleaned = voiceId.replace(/^(af|am|bf|bm)_/i, '')
    const words = cleaned.split(/[_\-\s]+/).filter(Boolean)
    return words.map((w) => w.slice(0, 1).toUpperCase() + w.slice(1)).join(' ')
}
