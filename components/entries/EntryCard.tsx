'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Calendar, MoreHorizontal, Pin } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { togglePin } from '@/lib/actions/entries'
import type { Database } from '@/types/supabase'
import ReadOnlyPreview from '@/components/editor/ReadOnlyPreview'
import TagChip from '@/components/ui/TagChip'

/** Convert a 6-digit hex color + 2-char hex opacity to rgba() to avoid
 *  browser normalisation causing SSR/client hydration mismatches. */
function hexAlpha(hex: string, alpha: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${(parseInt(alpha, 16) / 255).toFixed(3)})`
}

type Entry = Database['public']['Tables']['entries']['Row']

interface EntryTag {
  tag_id: string
  tag_name: string
  color: string
}

interface EntryCardProps {
  entry: Entry
  journalId: string
  accentColor: string
  isLatest: boolean
  onDelete: (entry: Entry) => void
  tags?: EntryTag[]
}

export default function EntryCard({
  entry,
  journalId,
  accentColor,
  isLatest,
  onDelete,
  tags = [],
}: EntryCardProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isPinned, setIsPinned] = useState(entry.is_pinned)
  const [menuOpen, setMenuOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const emojiBg = isDark ? hexAlpha(accentColor, '25') : hexAlpha(accentColor, '15')
  const readTime = Math.max(1, Math.ceil(entry.word_count / 200))

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (!buttonRef.current?.contains(t) && !dropdownRef.current?.contains(t)) {
        setMenuOpen(false)
      }
    }
    function handleScroll() { setMenuOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
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

  function handleMenuToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setMenuOpen((prev) => !prev)
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${entry.entry_date}T00:00:00`))

  const visibleTags = tags.slice(0, 3)
  const extraCount = tags.length - 3

  return (
    <div
      className={`relative flex items-stretch bg-[var(--bg-surface)] rounded-xl overflow-hidden cursor-pointer border border-[var(--border)] transition-transform ${menuOpen ? '' : 'hover:translate-x-0.5'}`}
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

          {/* More menu trigger */}
          <div className="shrink-0">
            <button
              ref={buttonRef}
              onClick={handleMenuToggle}
              className="p-1 rounded hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal size={16} className="text-[var(--text-muted)]" />
            </button>
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
            color: 'var(--text-secondary)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          <ReadOnlyPreview content={entry.content as string} maxChars={160} />
        </div>

        {/* Row 4: tags */}
        {tags.length > 0 && (
          <div
            className="flex flex-wrap gap-1 mt-2"
            onClick={(e) => e.stopPropagation()}
          >
            {visibleTags.map((tag) => (
              <TagChip key={tag.tag_id} tagName={tag.tag_name} color={tag.color} size="sm" />
            ))}
            {extraCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-[#F5F5F5] dark:bg-[#3A3A3A] text-[#757575] dark:text-[#9E9E9E] font-medium">
                +{extraCount} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Dropdown — portal to document.body so overflow-hidden can't clip it */}
      {mounted && menuOpen && menuPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-36 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg py-1"
        >
          <button
            onClick={() => { setMenuOpen(false); handlePinToggle() }}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Pin
              size={13}
              className={isPinned ? 'fill-[#1976D2] text-[#1976D2]' : 'text-[#9E9E9E]'}
            />
            {isPinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            onClick={() => { setMenuOpen(false); router.push(`/journals/${journalId}/entries/${entry.entry_id}`) }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => { setMenuOpen(false); onDelete(entry) }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-[var(--bg-muted)] transition-colors"
          >
            Delete
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
