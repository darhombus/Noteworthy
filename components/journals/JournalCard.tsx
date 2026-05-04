'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Calendar, Star, Pencil, Download, Trash2, EyeOff, Eye } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { toggleFavourite } from '@/lib/actions/journals'
import { hideJournal, unhideJournal } from '@/lib/actions/vault'
import { useSurface } from '@/lib/surface'
import { journalHref } from '@/lib/utils/href'
import ExportModal from '@/components/ExportModal'
import BookIcon from '@/components/ui/BookIcon'
import type { Database } from '@/types/supabase'

function hexAlpha(hex: string, alpha: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${(parseInt(alpha, 16) / 255).toFixed(3)})`
}

type Journal = Database['public']['Tables']['journals']['Row']

interface JournalCardProps {
  journal: Journal
  onEdit: () => void
  onDelete: () => void
}

export default function JournalCard({ journal, onEdit, onDelete }: JournalCardProps) {
  const router = useRouter()
  const surface = useSurface()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isFav, setIsFav] = useState(journal.is_favorite)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const isDark = mounted && resolvedTheme === 'dark'
  const accent = journal.color ?? '#1976D2'
  const emojiBg = isDark ? hexAlpha(accent, '25') : hexAlpha(accent, '15')

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

  async function handleFavToggle() {
    const prev = isFav
    setIsFav(!prev)
    const result = await toggleFavourite(journal.journal_id, prev)
    if ('error' in result) {
      setIsFav(prev)
      toast.error('Failed to update favourite')
    } else {
      router.refresh()
    }
  }

  async function handleHideToggle() {
    if (surface === 'hidden') {
      const result = await unhideJournal(journal.journal_id)
      if ('error' in result) {
        if (result.error === 'vault_locked') {
          toast.error('Vault is locked — unlock to unhide journals')
        } else {
          toast.error(result.error)
        }
        return
      }
      toast.success('Journal unhidden')
      router.refresh()
      return
    }

    const result = await hideJournal(journal.journal_id)
    if ('error' in result) {
      if (result.error.startsWith('no_vault')) {
        toast.error('Set up your vault first', {
          action: {
            label: 'Set up',
            onClick: () => router.push('/hidden'),
          },
          actionButtonStyle: {
            background: '#1976D2',
            color: '#FFFFFF',
            fontWeight: 600,
          },
        })
      } else {
        toast.error(result.error)
      }
      return
    }
    toast.success('Journal hidden')
    router.refresh()
  }

  function handleMenuToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // Initial guess: just below the button. useLayoutEffect measures the
      // real height afterward and flips above if we'd fall off the viewport.
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setMenuOpen((prev) => !prev)
  }

  // Flip the dropdown above the button if it would be clipped below the
  // viewport — mirrors native <select> behaviour so journals at the bottom
  // of the grid don't lose their menu offscreen.
  useLayoutEffect(() => {
    if (!menuOpen || !menuPos || !dropdownRef.current || !buttonRef.current) return
    const menuRect = dropdownRef.current.getBoundingClientRect()
    const btnRect = buttonRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const wouldClip = menuRect.bottom > viewportH - 8
    if (!wouldClip) return
    const flippedTop = Math.max(8, btnRect.top - menuRect.height - 4)
    if (Math.abs(flippedTop - menuPos.top) > 1) {
      setMenuPos({ top: flippedTop, right: menuPos.right })
    }
  }, [menuOpen, menuPos])

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

  return (
    <div
      className={`relative bg-[var(--bg-surface)] rounded-[14px] overflow-hidden cursor-pointer border border-[var(--border)] transition-transform ${menuOpen ? '' : 'hover:-translate-y-0.5'}`}
      style={{
        boxShadow: isDark
          ? undefined
          : '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
      }}
      onClick={() => router.push(journalHref(surface, journal.journal_id))}
    >
      {/* Color strip */}
      <div className="h-1" style={{ background: accent }} />

      {/* Card body */}
      <div className="px-5 pt-5 pb-[18px]">
        {/* Top row */}
        <div className="flex items-start gap-3.5 mb-4">
          {/* Book icon */}
          <div className="shrink-0">
            <BookIcon color={accent} size={52} />
          </div>

          {/* Title + description */}
          <div className="flex-1 min-w-0 pt-1">
            <h3
              className="text-[15px] font-bold text-[var(--text-primary)] truncate"
              style={{ letterSpacing: '-0.3px' }}
            >
              {journal.title}
            </h3>
            {journal.description && (
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                {journal.description}
              </p>
            )}
          </div>

          {/* Favourite indicator — sits beside the meatball, mirroring
              the pin indicator placement on EntryCard */}
          {isFav && (
            <Star
              size={13}
              className="shrink-0 fill-amber-400 text-amber-400 mt-2"
              aria-label="Favourite"
            />
          )}

          {/* More menu trigger */}
          <div className="shrink-0">
            <button
              ref={buttonRef}
              onClick={handleMenuToggle}
              className="p-1.5 rounded-lg hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal size={16} className="text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-[10px] py-0.5 rounded-full"
            style={{ color: accent, background: emojiBg }}
          >
            {journal.entry_count} {journal.entry_count === 1 ? 'entry' : 'entries'}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Calendar size={11} />
            {formattedDate}
          </span>
        </div>
      </div>

      {/* Export modal — portalled to document.body so the card's overflow:hidden
          and hover transform cannot create a containing block for the fixed overlay */}
      {mounted && showExportModal && createPortal(
        <ExportModal
          scope="journal"
          journalId={journal.journal_id}
          onClose={() => setShowExportModal(false)}
        />,
        document.body,
      )}

      {/* Dropdown — portal to document.body so overflow-hidden can't clip it */}
      {mounted && menuOpen && menuPos && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-48 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg py-1 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setMenuOpen(false); handleFavToggle() }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Star
              size={14}
              className={isFav ? 'fill-amber-400 text-amber-400 shrink-0' : 'text-[#9E9E9E] shrink-0'}
            />
            <span>{isFav ? 'Remove favourite' : 'Add to favourites'}</span>
          </button>

          <button
            onClick={() => { setMenuOpen(false); onEdit() }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Pencil size={14} className="text-[#9E9E9E] shrink-0" />
            <span>Edit journal</span>
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setShowExportModal(true) }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Download size={14} className="text-[#9E9E9E] shrink-0" />
            <span>Export journal</span>
          </button>

          <button
            onClick={() => { setMenuOpen(false); handleHideToggle() }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            {surface === 'hidden'
              ? <Eye size={14} className="text-[#9E9E9E] shrink-0" />
              : <EyeOff size={14} className="text-[#9E9E9E] shrink-0" />}
            <span>{surface === 'hidden' ? 'Unhide journal' : 'Hide journal'}</span>
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          <button
            onClick={() => { setMenuOpen(false); onDelete() }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={14} className="shrink-0" />
            <span>Delete journal</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
