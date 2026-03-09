'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'

const THEMES = ['light', 'dark', 'system'] as const
type Theme = (typeof THEMES)[number]

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-9 h-9" />

  const current = (theme as Theme) ?? 'system'

  function cycleTheme() {
    const idx = THEMES.indexOf(current)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

  const label =
    current === 'light' ? 'Switch to dark mode' :
    current === 'dark'  ? 'Switch to system mode' :
                          'Switch to light mode'

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none"
      aria-label={label}
    >
      {current === 'light'  && <Sun size={18} />}
      {current === 'dark'   && <Moon size={18} />}
      {current === 'system' && <Monitor size={18} />}
    </button>
  )
}
