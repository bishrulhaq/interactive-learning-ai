export interface QuizOption {
    label: string
    text: string
}

export interface QuizQuestion {
    question: string
    options: QuizOption[]
    correct_answer: string
    explanation: string
}

export interface Quiz {
    topic: string
    questions: QuizQuestion[]
}

export interface RawQuizQuestion {
    question: string
    options: string[]
    correct_answer_index: number
    explanation: string
}
