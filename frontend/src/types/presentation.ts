export interface PresentationSlide {
    title: string
    content: string
    bullet_points: string[]
    speaker_notes: string
}

export interface Presentation {
    title: string
    slides: PresentationSlide[]
}
