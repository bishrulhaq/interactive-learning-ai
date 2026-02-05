'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

interface QuizOption {
    label: string
    text: string
}

interface QuizQuestion {
    question: string
    options: QuizOption[]
    correct_answer: string
    explanation: string
}

interface Quiz {
    topic: string
    questions: QuizQuestion[]
}

interface RawQuizQuestion {
    question: string
    options: string[]
    correct_answer_index: number
    explanation: string
}

export default function QuizView({
    workspaceId,
    initialTopic = 'Key Concepts'
}: {
    workspaceId: number
    initialTopic?: string
}) {
    const [quiz, setQuiz] = useState<Quiz | null>(null)
    const [loading, setLoading] = useState(true)
    const [selectedAnswers, setSelectedAnswers] = useState<{
        [key: number]: string
    }>({})
    const [revealedQuestions, setRevealedQuestions] = useState<{
        [key: number]: boolean
    }>({})

    const generateQuiz = useCallback(async () => {
        setLoading(true)
        setQuiz(null)
        setSelectedAnswers({})
        setRevealedQuestions({})
        try {
            const res = await api.post('/generate/quiz', {
                topic: initialTopic,
                workspace_id: workspaceId
            })

            // Transform backend data (Schema mismatch fix)
            const rawData = res.data
            const formattedQuiz: Quiz = {
                topic: rawData.title || initialTopic,
                questions: rawData.questions.map((q: RawQuizQuestion) => ({
                    question: q.question,
                    explanation: q.explanation,
                    options: q.options.map((optText: string, idx: number) => ({
                        label: String.fromCharCode(65 + idx), // 0->A, 1->B
                        text: optText
                    })),
                    // Convert index to label (0 -> A)
                    correct_answer: String.fromCharCode(
                        65 + q.correct_answer_index
                    )
                }))
            }
            setQuiz(formattedQuiz)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [workspaceId, initialTopic])

    // Auto-load if exists
    useEffect(() => {
        let mounted = true
        const fetchExisting = async () => {
            try {
                const res = await api.get('/generate/existing', {
                    params: { workspace_id: workspaceId, topic: initialTopic }
                })
                if (!mounted) return
                if (res.data.quiz) {
                    const rawData = res.data.quiz
                    const formattedQuiz: Quiz = {
                        topic: rawData.title || initialTopic,
                        questions: rawData.questions.map(
                            (q: RawQuizQuestion) => ({
                                question: q.question,
                                explanation: q.explanation,
                                options: q.options.map(
                                    (optText: string, idx: number) => ({
                                        label: String.fromCharCode(65 + idx),
                                        text: optText
                                    })
                                ),
                                correct_answer: String.fromCharCode(
                                    65 + q.correct_answer_index
                                )
                            })
                        )
                    }
                    setQuiz(formattedQuiz)
                }
            } catch (e) {
                console.error('Error fetching existing quiz:', e)
            } finally {
                if (mounted) setLoading(false)
            }
        }
        setQuiz(null)
        setSelectedAnswers({})
        setRevealedQuestions({})
        setLoading(true)
        fetchExisting()
        return () => {
            mounted = false
        }
    }, [workspaceId, initialTopic])

    const handleOptionSelect = (questionIdx: number, optionLabel: string) => {
        // Prevent changing answer if already revealed/submitted
        if (revealedQuestions[questionIdx]) return

        setSelectedAnswers((prev) => ({
            ...prev,
            [questionIdx]: optionLabel
        }))

        // Instant feedback: Mark as revealed immediately
        setRevealedQuestions((prev) => ({
            ...prev,
            [questionIdx]: true
        }))
    }

    const calculateScore = () => {
        if (!quiz) return 0
        let score = 0
        quiz.questions.forEach((q, idx) => {
            if (selectedAnswers[idx] === q.correct_answer) score++
        })
        return score
    }

    if (!quiz && !loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                <h3 className="text-xl font-semibold">AI Quiz Generator</h3>
                <p className="text-muted-foreground">
                    Generate a multiple-choice quiz to test your mastery.
                </p>
                <Button onClick={generateQuiz}>Generate Quiz</Button>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    return (
        <div className="space-y-6 pt-4 px-4 pb-20">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Quiz: {quiz?.topic}</h2>
                <div className="flex gap-2 items-center">
                    <span className="font-bold text-lg mr-4">
                        Score: {calculateScore()} / {quiz?.questions.length}
                    </span>
                    <Button variant="outline" size="sm" onClick={generateQuiz}>
                        <RefreshCw className="w-4 h-4 mr-2" /> New Quiz
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                {quiz?.questions.map((q, qIdx) => {
                    const isQuestionRevealed = revealedQuestions[qIdx]

                    return (
                        <Card key={qIdx} className="p-6">
                            <h3 className="font-semibold text-lg mb-4">
                                {qIdx + 1}. {q.question}
                            </h3>
                            <div className="space-y-3">
                                {q.options.map((opt) => {
                                    const isSelected =
                                        selectedAnswers[qIdx] === opt.label
                                    const isCorrect =
                                        opt.label === q.correct_answer
                                    let optionClass =
                                        'border p-3 rounded-lg flex items-center cursor-pointer transition-colors text-foreground '

                                    if (isQuestionRevealed) {
                                        if (isCorrect)
                                            optionClass +=
                                                'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-100 '
                                        else if (isSelected && !isCorrect)
                                            optionClass +=
                                                'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/40 text-red-800 dark:text-red-100 '
                                        else
                                            optionClass +=
                                                'bg-muted/30 opacity-70 '
                                    } else {
                                        if (isSelected)
                                            optionClass +=
                                                'bg-blue-50 dark:bg-blue-950/30 border-blue-500 dark:border-blue-400/50 text-blue-900 dark:text-blue-100 '
                                        else
                                            optionClass += 'hover:bg-accent/30 '
                                    }

                                    return (
                                        <div
                                            key={opt.label}
                                            className={optionClass}
                                            onClick={() =>
                                                handleOptionSelect(
                                                    qIdx,
                                                    opt.label
                                                )
                                            }
                                        >
                                            <div
                                                className={cn(
                                                    'w-6 h-6 rounded-full border flex items-center justify-center mr-3 text-sm font-medium',
                                                    isSelected ||
                                                        (isQuestionRevealed &&
                                                            isCorrect)
                                                        ? 'border-transparent bg-background/60 dark:bg-background/10'
                                                        : 'border-border bg-background dark:bg-background/5'
                                                )}
                                            >
                                                {opt.label}
                                            </div>
                                            <span>{opt.text}</span>
                                            {isQuestionRevealed &&
                                                isCorrect && (
                                                    <CheckCircle className="w-5 h-5 ml-auto text-emerald-600 dark:text-emerald-200" />
                                                )}
                                            {isQuestionRevealed &&
                                                isSelected &&
                                                !isCorrect && (
                                                    <XCircle className="w-5 h-5 ml-auto text-red-600 dark:text-red-200" />
                                                )}
                                        </div>
                                    )
                                })}
                            </div>
                            {isQuestionRevealed && (
                                <div className="mt-4 p-4 bg-muted/30 border border-border rounded-lg text-sm text-muted-foreground">
                                    <span className="font-semibold">
                                        Explanation:
                                    </span>{' '}
                                    {q.explanation}
                                </div>
                            )}
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
