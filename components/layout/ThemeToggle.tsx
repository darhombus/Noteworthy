'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'

const CYCLE = ['light', 'dark', 'system'] as const
type ThemeName = (typeof CYCLE)[number]

const ICON = { light: Sun, dark: Moon, system: Monitor }
const LABEL = { light: 'Light', dark: 'Dark', system: 'System' }

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-9 h-9" />

  const current: ThemeName = (CYCLE as readonly string[]).includes(theme ?? '')
    ? (theme as ThemeName)
    : 'system'
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
  const Icon = ICON[current]

  return (
    <button
      onClick={() => setTheme(next)}
      className="p-2 rounded-lg border border-[var(--border)] hover:bg-[#EEEEEE] dark:hover:bg-[#333333] transition-colors text-gray-700 dark:text-[#BDBDBD] focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none"
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[current]}`}
    >
      <Icon size={18} />
    </button>
  )
}
