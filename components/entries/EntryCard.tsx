'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Calendar, MoreHorizontal, Pin, EyeOff, Eye, Star, Trash2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { togglePin, toggleEntryFavourite } from '@/lib/actions/entries'
import { hideEntry, unhideEntry } from '@/lib/actions/vault'
import { useSurface } from '@/lib/surface'
import { entryHref } from '@/lib/utils/href'
import type { Database } from '@/types/supabase'
import { extractPlainText, type RichTextNode } from '@/lib/utils/extractPlainText'
import TagChip from '@/components/ui/TagChip'
import IndividuallyHiddenIndicator from '@/components/hidden/IndividuallyHiddenIndicator'

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
  /** True if the parent journal is hidden — only meaningful in the
   *  hidden surface, where it switches the entry URL between the
   *  nested `/hidden/<jid>/<eid>` and standalone `/hidden/entry/<eid>`
   *  forms. Ignored on the public surface. */
  parentJournalIsHidden?: boolean
  /** Set when the card is rendered inside a hidden journal's entry list.
   *  Suppresses the per-entry hide/unhide menu item (rule: an entry
   *  inside a hidden journal cannot be individually hidden) and surfaces
   *  the IndividuallyHiddenIndicator when entry.is_hidden is also true. */
  contextIsHiddenJournal?: boolean
  /** When true, restrict the dropdown menu to "Unhide" + "Delete" only.
   *  Used on the standalone-hidden page where pin/favourite are not
   *  meaningful management actions for entries the user is triaging. */
  restrictedMenu?: boolean
  /** When provided, renders a coloured-dot + label inline in the meta
   *  row. Used on /hidden/standalone where each card represents an
   *  entry from a different parent journal. */
  parentJournalLabel?: { title: string; color: string }
}

export default function EntryCard({
  entry,
  journalId,
  accentColor,
  isLatest,
  onDelete,
  tags = [],
  parentJournalIsHidden = true,
  contextIsHiddenJournal = false,
  restrictedMenu = false,
  parentJournalLabel,
}: EntryCardProps) {
  const router = useRouter()
  const surface = useSurface()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isPinned, setIsPinned] = useState(entry.is_pinned)
  const [isFav, setIsFav] = useState(entry.is_favorite)
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
    } else {
      router.refresh()
    }
  }

  async function handleFavToggle() {
    const prev = isFav
    setIsFav(!prev)
    const result = await toggleEntryFavourite(entry.entry_id, prev)
    if ('error' in result) {
      setIsFav(prev)
      toast.error('Failed to update favourite')
    } else {
      router.refresh()
    }
  }

  async function handleHideToggle() {
    if (surface === 'hidden') {
      const result = await unhideEntry(entry.entry_id)
      if ('error' in result) {
        if (result.error === 'vault_locked') {
          toast.error('Vault is locked — unlock to unhide entries')
        } else {
          toast.error(result.error)
        }
        return
      }
      toast.success('Entry unhidden')
      router.refresh()
      return
    }

    const result = await hideEntry(entry.entry_id)
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
    toast.success('Entry hidden')
    router.refresh()
  }

  function handleMenuToggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      // Initial guess: place the menu just below the button. The real height
      // isn't known until after render, so useLayoutEffect below measures the
      // actual dropdown and flips it above the button if it would overflow.
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setMenuOpen((prev) => !prev)
  }

  // After the dropdown mounts, measure it and flip upward if it would be
  // clipped below the viewport — matches the browser's native select behaviour
  // and stops the bottom rows of entry cards from losing their menu offscreen.
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
  }).format(new Date(`${entry.entry_date}T00:00:00`))

  // Plain-text preview snippet derived from the stored entry content.
  const previewSnippet = (() => {
    const raw = entry.content
    if (raw == null) return ''
    let text = ''
    if (typeof raw === 'string') {
      text = raw
    } else if (typeof raw === 'object') {
      try {
        text = extractPlainText(raw as RichTextNode)
      } catch {
        text = ''
      }
    }
    if (!text) return ''
    return text.length > 110 ? text.slice(0, 110) + '…' : text
  })()

  const visibleTags = tags.slice(0, 3)
  const extraCount = tags.length - 3

  return (
    <div
      className={`relative flex items-stretch bg-[var(--bg-surface)] rounded-xl overflow-hidden cursor-pointer border border-[var(--border)] transition-transform ${menuOpen ? '' : 'hover:translate-x-0.5'}`}
      onClick={() =>
        router.push(
          entryHref(surface, journalId, entry.entry_id, {
            standalone: surface === 'hidden' && !parentJournalIsHidden,
          }),
        )
      }
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

          {/* Last edited badge first, then the status indicators (pin,
              favourite, individually-hidden), then the meatball. Order
              reads left → right as: title · LAST EDITED · indicators · ⋯ */}
          {isLatest && (
            <span
              className="shrink-0 text-[10px] font-bold px-[9px] py-0.5 rounded-full uppercase"
              style={{
                color: accentColor,
                background: emojiBg,
                letterSpacing: '0.4px',
              }}
            >
              Last edited
            </span>
          )}

          {isPinned && (
            <Pin
              size={12}
              className="shrink-0 fill-[#1976D2] text-[#1976D2]"
              aria-label="Pinned"
            />
          )}

          {isFav && (
            <Star
              size={12}
              className="shrink-0 fill-amber-400 text-amber-400"
              aria-label="Favourite"
            />
          )}

          {/* Inline-hidden indicator — surfaces only inside a hidden
              journal where the entry has its own is_hidden flag set. The
              user can't unhide it from this view (model rule: entries
              inside a hidden journal don't expose hide/unhide); the
              tooltip explains why it'll stay hidden after a journal
              unhide. */}
          {contextIsHiddenJournal && entry.is_hidden && (
            <IndividuallyHiddenIndicator />
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

        {/* Row 2: date + read time (+ optional parent journal label) */}
        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mb-2">
          {parentJournalLabel ? (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: parentJournalLabel.color }}
                aria-hidden
              />
              <span className="truncate max-w-[160px]">
                {parentJournalLabel.title}
              </span>
              <span>·</span>
            </>
          ) : (
            <Calendar size={10} />
          )}
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
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {previewSnippet && <span>{previewSnippet}</span>}
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
          className="w-48 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg py-1 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {!restrictedMenu && (
            <>
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
                onClick={() => { setMenuOpen(false); handlePinToggle() }}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
              >
                <Pin
                  size={14}
                  className={isPinned ? 'fill-[#1976D2] text-[#1976D2] shrink-0' : 'text-[#9E9E9E] shrink-0'}
                />
                <span>{isPinned ? 'Unpin entry' : 'Pin entry'}</span>
              </button>
            </>
          )}

          {/* Hide / unhide:
              - Public surface: "Hide entry" (default).
              - Hidden surface, parent-journal context: SUPPRESSED — model
                rule says an entry inside a hidden journal cannot be
                individually hidden/unhidden. To unhide an individually
                hidden entry, the user first unhides the parent journal,
                then unhides the entry from the system journal view.
              - Hidden surface, otherwise (standalone hidden entries):
                "Unhide entry". */}
          {!contextIsHiddenJournal && (
            <button
              onClick={() => { setMenuOpen(false); handleHideToggle() }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
            >
              {surface === 'hidden'
                ? <Eye size={14} className="text-[#9E9E9E] shrink-0" />
                : <EyeOff size={14} className="text-[#9E9E9E] shrink-0" />}
              <span>{surface === 'hidden' ? 'Unhide entry' : 'Hide entry'}</span>
            </button>
          )}

          {/* Divider only when something sits above Delete — keeps the
              menu visually tight in the (restrictedMenu + hidden journal)
              edge case where Delete would be the sole item. */}
          {(!restrictedMenu || !contextIsHiddenJournal) && (
            <div className="my-1 border-t border-[var(--border)]" />
          )}

          <button
            onClick={() => { setMenuOpen(false); onDelete(entry) }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 size={14} className="shrink-0" />
            <span>Delete entry</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
