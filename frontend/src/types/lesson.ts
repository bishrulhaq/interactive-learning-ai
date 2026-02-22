export interface LessonSection {
    title: string
    content: string
    key_points: string[]
}

export interface LessonPlan {
    topic: string
    sections: LessonSection[]
    audio_path?: string
}
