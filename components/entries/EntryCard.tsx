'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, MoreHorizontal, Pin } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { togglePin } from '@/lib/actions/entries'
import type { Database } from '@/types/supabase'
import ReadOnlyPreview from '@/components/editor/ReadOnlyPreview'

type Entry = Database['public']['Tables']['entries']['Row']

interface EntryCardProps {
  entry: Entry
  journalId: string
  accentColor: string
  isLatest: boolean
  onDelete: (entry: Entry) => void
}

export default function EntryCard({ entry, journalId, accentColor, isLatest, onDelete }: EntryCardProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [isPinned, setIsPinned] = useState(entry.is_pinned)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const emojiBg = isDark ? `${accentColor}25` : `${accentColor}15`
  const readTime = Math.max(1, Math.ceil(entry.word_count / 200))

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  async function handlePinToggle() {
    const prev = isPinned
    setIsPinned(!prev)
    const result = await togglePin(entry.entry_id, prev)
    if ('error' in result) {
      setIsPinned(prev)
      toast.error('Failed to update pin')
    }
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${entry.entry_date}T00:00:00`))

  return (
    <div
      className="relative flex items-stretch bg-[var(--bg-surface)] rounded-xl cursor-pointer border border-[var(--border)] transition-transform hover:translate-x-0.5 overflow-hidden"
      onClick={() => router.push(`/journals/${journalId}/entries/${entry.entry_id}`)}
    >
      {/* Accent left bar */}
      <div
        className="w-1 shrink-0"
        style={{
          background: accentColor,
          opacity: isLatest ? 1 : 0.4,
        }}
      />

      {/* Content */}
      <div className="flex-1 py-[18px] pl-[18px] pr-5">
        {/* Row 1: title + badges + menu */}
        <div className="flex items-center gap-2 mb-1.5">
          <h3
            className="text-[15px] font-semibold text-[var(--text-primary)] truncate flex-1"
            style={{ letterSpacing: '-0.2px' }}
          >
            {entry.title || 'Untitled'}
          </h3>

          {isLatest && (
            <span
              className="shrink-0 text-[10px] font-bold px-[9px] py-0.5 rounded-full uppercase"
              style={{
                color: accentColor,
                background: emojiBg,
                letterSpacing: '0.4px',
              }}
            >
              Latest
            </span>
          )}

          <div
            ref={menuRef}
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-1 rounded hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal size={16} className="text-[var(--text-muted)]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handlePinToggle()
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  <Pin
                    size={13}
                    className={isPinned ? 'fill-[#1976D2] text-[#1976D2]' : 'text-[#9E9E9E]'}
                  />
                  {isPinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    router.push(`/journals/${journalId}/entries/${entry.entry_id}`)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(entry)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: date + read time */}
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mb-2">
          <Calendar size={10} />
          <span>{formattedDate}</span>
          <span>·</span>
          <span>{readTime} min read</span>
        </div>

        {/* Row 3: content preview */}
        <div
          className="text-[13px] leading-[1.6] overflow-hidden"
          style={{
            color: isDark ? '#9E9E9E' : '#616161',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          <ReadOnlyPreview content={entry.content as string} maxChars={160} />
        </div>
      </div>
    </div>
  )
}
