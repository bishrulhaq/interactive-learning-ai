'use client'

import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ThemeChoice = 'light' | 'dark'

function getIsDark(): boolean {
    if (typeof document === 'undefined') return false
    return document.documentElement.classList.contains('dark')
}

function applyTheme(theme: ThemeChoice) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    try {
        localStorage.setItem('theme', theme)
    } catch {
        // ignore
    }
}

export default function ThemeToggle() {
    const [isDark, setIsDark] = useState<boolean>(() => getIsDark())
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

    return (
        <div className="fixed bottom-6 right-6 z-50">
            <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={label}
                title={label}
                className={cn(
                    'rounded-full shadow-lg backdrop-blur-md bg-background/70',
                    'hover:bg-accent/70',
                    'border-border'
                )}
                onClick={() => {
                    const next: ThemeChoice = isDark ? 'light' : 'dark'
                    applyTheme(next)
                    setIsDark(next === 'dark')
                }}
            >
                {isDark ? (
                    <Sun className="h-4 w-4" />
                ) : (
                    <Moon className="h-4 w-4" />
                )}
            </Button>
        </div>
    )
}
