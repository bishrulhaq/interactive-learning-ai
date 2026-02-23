export type HfPreset = {
    id: string
    name: string
    desc: string
    dim: number
    size: string
    warn?: string
}

export type SettingsMessage = {
    type: 'success' | 'error' | 'warning'
    text: string
} | null

export type RuntimeInfo = {
    device?: string
    cuda_available?: boolean
    cuda_device_name?: string
} | null
