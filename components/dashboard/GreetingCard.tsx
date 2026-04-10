'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface GreetingCardProps {
  fullName: string
  lastEntryAt: string | null // ISO timestamp
}

function getGreeting(name: string): string {
  const h = new Date().getHours()
  const prefix =
    h >= 5 && h < 12
      ? 'Good morning'
      : h >= 12 && h < 18
        ? 'Good afternoon'
        : 'Good evening'
  return name ? `${prefix}, ${name}` : prefix
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatRelative(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function GreetingCard({ fullName, lastEntryAt }: GreetingCardProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Render a same-size placeholder on the server to avoid layout shift
  if (!mounted) {
    return <div className="bg-[#1976D2] rounded-xl p-6 min-h-[88px]" aria-hidden />
  }

  return (
    <div className="bg-[#1976D2] rounded-xl p-6 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold leading-tight">{getGreeting(fullName)}</h1>
          <p className="text-sm text-white/70 mt-1">{formatDate()}</p>
        </div>

        {lastEntryAt && (
          <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 flex-shrink-0">
            <Clock size={13} className="text-white/80 flex-shrink-0" />
            <span className="text-xs text-white/90 whitespace-nowrap">
              Last entry {formatRelative(lastEntryAt)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
