'use client'

import dynamic from 'next/dynamic'

const ThemeToggle = dynamic(() => import('@/components/theme-toggle'), {
    ssr: false,
    loading: () => null
})

export default function ThemeToggleNoSSR() {
    return <ThemeToggle />
}
