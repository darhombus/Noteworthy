'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SearchX, X, BookOpen, FileText, Lock } from 'lucide-react'
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns'
import { toast } from 'sonner'
import { useUIStore } from '@/store/useUIStore'
import TagChip from '@/components/ui/TagChip'
import { entryHref, journalHref } from '@/lib/utils/href'
import { useSurface } from '@/lib/surface'

interface Tag {
  tag_id: string
  tag_name: string
  color: string
}

interface IndexEntry {
  entry_id: string
  title: string | null
  journal_id: string
  journal_title: string
  journal_color: string
  /** Parent journal hidden flag — drives the /hidden/<jid>/<eid> vs
   *  /hidden/entry/<eid> URL choice on the hidden surface. */
  journal_is_hidden: boolean
  entry_date: string
  word_count: number
  is_pinned: boolean
  is_favorite: boolean
  /** Full lower-cased haystack (title + plain Tiptap text from the
   *  generated `search_text` column). Pre-lowered once at index load
   *  so per-keystroke filtering is just `.includes(query)`. */
  haystack: string
  /** Original-case text used to render the snippet centred on the match. */
  text: string
  tags: Tag[]
}

interface IndexJournal {
  journal_id: string
  title: string
  description: string | null
  color: string
  icon: string
  entry_count: number
  is_favorite: boolean
  /** Pre-lowered title + description for matching. */
  haystack: string
}

interface SnapshotResponse {
  journals: Array<{
    journal_id: string
    title: string
    description: string | null
    color: string
    icon: string
    entry_count: number
    is_favorite: boolean
  }>
  entries: Array<{
    entry_id: string
    title: string | null
    journal_id: string
    journal_title: string
    journal_color: string
    journal_is_hidden: boolean
    entry_date: string
    word_count: number
    is_pinned: boolean
    is_favorite: boolean
    search_text: string
    tags: Tag[]
  }>
}

// Highlight text segments by matched terms using String.indexOf (no regex with user input)
function HighlightedText({
  text,
  terms,
}: {
  text: string
  terms: string[]
}): React.ReactElement {
  if (!terms.length) return <>{text}</>

  const matches: { start: number; end: number }[] = []
  const lowerText = text.toLowerCase()

  for (const term of terms) {
    if (!term.trim()) continue
    const lowerTerm = term.toLowerCase()
    let pos = 0
    while (pos < lowerText.length) {
      const idx = lowerText.indexOf(lowerTerm, pos)
      if (idx === -1) break
      matches.push({ start: idx, end: idx + term.length })
      pos = idx + term.length
    }
  }

  if (!matches.length) return <>{text}</>

  matches.sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const m of matches) {
    const last = merged[merged.length - 1]
    if (!last || m.start > last.end) {
      merged.push({ ...m })
    } else {
      last.end = Math.max(last.end, m.end)
    }
  }

  const nodes: React.ReactNode[] = []
  let cursor = 0
  for (let i = 0; i < merged.length; i++) {
    const { start, end } = merged[i]
    if (start > cursor) nodes.push(<span key={`t-${i}`}>{text.slice(cursor, start)}</span>)
    nodes.push(
      <mark key={`m-${i}`} className="bg-yellow-200 dark:bg-yellow-500/30 rounded-sm not-italic">
        {text.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>)

  return <>{nodes}</>
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-[#1976D2]/10 text-[#1976D2] dark:bg-[#1E3A5F] dark:text-[#64B5F6] border border-[#1976D2]/20 dark:border-[#1E3A5F]">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="hover:opacity-70 transition-opacity ml-0.5"
      >
        <X size={10} />
      </button>
    </span>
  )
}

// Parse #tagname tokens out of a query string
function parseHashTags(query: string): { text: string; tagNames: string[] } {
  const tagNames: string[] = []
  const text = query
    .replace(/#([a-z0-9-]+)/gi, (_, name: string) => {
      tagNames.push(name.toLowerCase())
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { text, tagNames }
}

// Remove a specific #tagname token from a query string
function removeHashTag(query: string, tagName: string): string {
  return query
    .split(/\s+/)
    .filter((token) => token.toLowerCase() !== `#${tagName.toLowerCase()}`)
    .join(' ')
    .trim()
}

/** Cut a snippet centred on the first match. Mirrors the server's old
 *  `LEFT(search_text, 200)` shape when no query word is supplied. */
function buildSnippet(text: string, queryLower: string): string {
  if (!text) return ''
  const SNIPPET_LEN = 200
  if (text.length <= SNIPPET_LEN) return text
  if (!queryLower) return text.slice(0, SNIPPET_LEN)

  const idx = text.toLowerCase().indexOf(queryLower)
  if (idx === -1) return text.slice(0, SNIPPET_LEN)

  const lead = 50
  const start = Math.max(0, idx - lead)
  const end = Math.min(text.length, start + SNIPPET_LEN)
  let snippet = text.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < text.length) snippet = snippet + '…'
  return snippet
}

interface SnapshotState {
  journals: IndexJournal[]
  entries: IndexEntry[]
}

export default function SearchOverlay() {
  const router = useRouter()
  const { isSearchOpen, openSearch, closeSearch } = useUIStore()

  // AppShell wraps this component in <SurfaceFromPath> so useSurface()
  // returns the right value even though the route-group SurfaceProviders
  // (/journals, /hidden) don't reach this far up the tree.
  const surface = useSurface()
  const [vaultLocked, setVaultLocked] = useState(false)

  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [favouritesOnly, setFavouritesOnly] = useState(false)

  // Tags loaded once for #tag → ID lookup. Resolved at runtime against
  // the snapshot, since the snapshot embeds tags per entry already.
  const [tags, setTags] = useState<Tag[]>([])
  const tagsLoadedRef = useRef(false)

  // Snapshot of every journal/entry visible on the current surface.
  // Prefetched in the background as soon as this component mounts (see
  // useEffect below) and refreshed when the surface changes. Filtering
  // is synchronous against this in-memory copy → typing never hits the
  // network → no spinner, no glitch.
  const [snapshot, setSnapshot] = useState<SnapshotState | null>(null)
  const snapshotSurfaceRef = useRef<string | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  const [queryTooLong, setQueryTooLong] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])
  const fetchAbortRef = useRef<AbortController | null>(null)

  // Global Cmd+K / Ctrl+K listener — always active
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openSearch])

  // Prefetch the snapshot in the background as soon as the AppShell
  // mounts (and again whenever the surface changes). By the time the
  // user actually hits Cmd+K the snapshot is already in memory, so the
  // overlay never has to render a loading spinner — typing is
  // synchronous from the very first keystroke.
  //
  // Snapshot is keyed off the active surface; switching /journals →
  // /hidden refetches because the visible set is different.
  const fetchSnapshot = useCallback(() => {
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller

    setSnapshotError(null)
    setVaultLocked(false)
    // Drop any prior snapshot before the new request goes out. Without
    // this, a cached "vault_locked" placeholder ({journals:[],entries:[]})
    // from the pre-unlock fetch would still satisfy `snapshot !== null`
    // for the brief window before the new response lands, so the very
    // first keystroke after unlocking flashed "No results for 'm'"
    // before the real results swapped in. Same risk on a public→hidden
    // surface flip — the prior surface's data would briefly leak as
    // hits against a different scope.
    setSnapshot(null)
    snapshotSurfaceRef.current = null

    fetch(`/api/search/index?surface=${surface}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          if (body.error === 'vault_locked') {
            // Mark as a "loaded, but locked" snapshot so the overlay
            // shows the lock state rather than the empty placeholder.
            setVaultLocked(true)
            setSnapshot({ journals: [], entries: [] })
            snapshotSurfaceRef.current = surface
            return
          }
          // Not signed in — let proxy.ts handle the redirect when the
          // user actually navigates. No need to push from a background
          // prefetch.
          return
        }
        if (!res.ok) {
          setSnapshotError('temporarily_unavailable')
          return
        }
        const data = (await res.json()) as SnapshotResponse
        const entries: IndexEntry[] = data.entries.map((e) => ({
          entry_id: e.entry_id,
          title: e.title,
          journal_id: e.journal_id,
          journal_title: e.journal_title,
          journal_color: e.journal_color,
          journal_is_hidden: e.journal_is_hidden,
          entry_date: e.entry_date,
          word_count: e.word_count,
          is_pinned: e.is_pinned,
          is_favorite: e.is_favorite,
          haystack: (e.search_text ?? '').toLowerCase(),
          text: e.search_text ?? '',
          tags: Array.isArray(e.tags) ? e.tags : [],
        }))
        const journals: IndexJournal[] = data.journals.map((j) => ({
          journal_id: j.journal_id,
          title: j.title,
          description: j.description,
          color: j.color,
          icon: j.icon,
          entry_count: j.entry_count,
          is_favorite: j.is_favorite,
          haystack: `${j.title} ${j.description ?? ''}`.toLowerCase(),
        }))
        setSnapshot({ journals, entries })
        snapshotSurfaceRef.current = surface
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSnapshotError('temporarily_unavailable')
        console.error('Search snapshot fetch failed:', err)
      })
  }, [surface])

  useEffect(() => {
    if (snapshot && snapshotSurfaceRef.current === surface) return
    fetchSnapshot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface])

  // The snapshot is memoized per-surface, so an unlock that happens
  // *after* a previously-cached "vault_locked" prefetch wouldn't trigger
  // the surface effect above (surface didn't change). Re-check on the
  // rising edge of every overlay open while we still hold a locked
  // snapshot. Tracking prev-isSearchOpen via a ref means the effect
  // doesn't loop if the fetch returns vault_locked again.
  const prevSearchOpenRef = useRef(false)
  useEffect(() => {
    const justOpened = isSearchOpen && !prevSearchOpenRef.current
    prevSearchOpenRef.current = isSearchOpen
    if (justOpened && vaultLocked) fetchSnapshot()
  }, [isSearchOpen, vaultLocked, fetchSnapshot])

  // Focus the input on open. The snapshot prefetch above runs in the
  // background, so by the time the overlay opens it's almost always
  // already loaded.
  useEffect(() => {
    if (!isSearchOpen) return
    setSelectedIndex(-1)
    setTimeout(() => inputRef.current?.focus(), 0)

    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true
      fetch('/api/tags')
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: Tag[]) => setTags(data))
        .catch(() => {/* graceful degradation */})
    }
  }, [isSearchOpen])

  // Show an unrecoverable-load toast once if the snapshot couldn't be fetched.
  useEffect(() => {
    if (snapshotError === 'temporarily_unavailable') {
      toast.error('Search is temporarily unavailable. Please try again.')
    }
  }, [snapshotError])

  // Scroll selected result into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      resultRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Derive text + tag parts from the live query (no debounce — local filter)
  const { text: liveText, tagNames: liveTagNames } = parseHashTags(query)
  const queryLower = liveText.trim().toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter(Boolean)

  const hasActiveFilters = !!(
    fromDate ||
    toDate ||
    favouritesOnly ||
    liveTagNames.length > 0
  )

  // Stable serialisations so the memos below don't re-run when the array
  // identity changes but the contents don't.
  const liveTagNamesKey = liveTagNames.join(',')
  const queryWordsKey = queryWords.join(' ')

  // Resolve tag IDs from #patterns using partial (contains) matching, so
  // typing #wo live-matches "work", "writing", etc.
  const liveTagIds = useMemo(() => {
    if (liveTagNames.length === 0) return new Set<string>()
    const set = new Set<string>()
    for (const t of tags) {
      if (liveTagNames.some((p) => t.tag_name.toLowerCase().includes(p))) {
        set.add(t.tag_id)
      }
    }
    return set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, liveTagNamesKey])

  // Sync queryTooLong off the live input length
  useEffect(() => {
    setQueryTooLong(query.length > 200)
  }, [query])

  // Reset highlighted result when filters change
  useEffect(() => {
    setSelectedIndex(-1)
  }, [query, fromDate, toDate, favouritesOnly])

  // ── Derived results — synchronous filter against the snapshot ─────────────
  const { filteredJournals, filteredEntries } = useMemo<{
    filteredJournals: IndexJournal[]
    filteredEntries: IndexEntry[]
  }>(() => {
    if (!snapshot || queryTooLong) return { filteredJournals: [], filteredEntries: [] }

    const hasText = queryLower.length > 0
    const hasTagFilter = liveTagNames.length > 0

    if (!hasText && !hasTagFilter && !fromDate && !toDate && !favouritesOnly) {
      return { filteredJournals: [], filteredEntries: [] }
    }

    // Journals — match on text (when supplied) and apply Favourites
    // only filter. Date/pinned/tag filters are entry-level concepts
    // and don't apply here. Showing the Journals section even with no
    // text lets a user list all favourite journals via the chip alone.
    let journals: IndexJournal[] = []
    const journalFilterActive = hasText || favouritesOnly
    if (journalFilterActive) {
      journals = snapshot.journals.filter((j) => {
        if (favouritesOnly && !j.is_favorite) return false
        if (hasText && !queryWords.every((w) => j.haystack.includes(w))) return false
        return true
      })
      journals.sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
        return 0
      })
      journals = journals.slice(0, 5)
    }

    // Entries — apply text + tag + date + pinned + favourites filters.
    const entries: IndexEntry[] = []
    for (const e of snapshot.entries) {
      if (hasText && !queryWords.every((w) => e.haystack.includes(w))) continue
      if (hasTagFilter && !e.tags.some((t) => liveTagIds.has(t.tag_id))) continue
      if (favouritesOnly && !e.is_favorite) continue
      if (fromDate && e.entry_date < fromDate) continue
      if (toDate && e.entry_date > toDate) continue
      entries.push(e)
      if (entries.length >= 50) break
    }

    return { filteredJournals: journals, filteredEntries: entries }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snapshot,
    queryLower,
    queryWordsKey,
    liveTagNamesKey,
    liveTagIds,
    fromDate,
    toDate,
    favouritesOnly,
    queryTooLong,
  ])

  const totalItems = filteredJournals.length + filteredEntries.length
  // Anything that should produce results: text, tags, or any filter chip.
  const isAnyFilterActive =
    queryLower.length > 0 || liveTagNames.length > 0 || hasActiveFilters
  // Show the welcome prompt only when the user hasn't typed or set any filter.
  const showZeroQuery = !isAnyFilterActive
  // Show "no results" only when (a) the user has actually typed/filtered
  // AND (b) the snapshot has loaded — otherwise we'd flash "no results"
  // for the brief moment between mount and the prefetch landing.
  const showEmpty =
    !vaultLocked &&
    snapshot !== null &&
    totalItems === 0 &&
    isAnyFilterActive
  // Snapshot is still in flight after the user has typed. Common path
  // is the very first hidden-surface search after a vault unlock —
  // fetchSnapshot dropped the previous (locked) snapshot and the new
  // one hasn't landed yet. Render a soft loading line so the area
  // isn't blank while we wait.
  const showLoading =
    !vaultLocked &&
    snapshot === null &&
    !snapshotError &&
    isAnyFilterActive

  function handleClose() {
    closeSearch()
    setQuery('')
    setFromDate('')
    setToDate('')
    setFavouritesOnly(false)
    setQueryTooLong(false)
    setSelectedIndex(-1)
    // Keep the snapshot — prefetch already paid for it and the next
    // open should be instant. The surface-change effect handles
    // refresh when /journals → /hidden flips, and creating a new
    // entry just means it isn't in this snapshot until the user
    // refreshes the page; an acceptable trade for a glitch-free open.
  }

  const handleEntryClick = useCallback(
    (entry: IndexEntry) => {
      router.push(
        entryHref(surface, entry.journal_id, entry.entry_id, {
          standalone: surface === 'hidden' && !entry.journal_is_hidden,
        }),
      )
      handleClose()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, surface],
  )

  const handleJournalClick = useCallback(
    (journalId: string) => {
      router.push(journalHref(surface, journalId))
      handleClose()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, surface],
  )

  // Date preset ranges (Today / This week / This month / This year).
  // Computed once per render — not memoized because the four-call cost
  // is trivial and date-fns has no React-friendly invalidation hook.
  // weekStartsOn matches EntryList's in-journal preset for visual
  // consistency between the two search surfaces.
  const datePresets = (() => {
    const now = new Date()
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    return {
      today: { from: fmt(now), to: fmt(now) },
      week: {
        from: fmt(startOfWeek(now, { weekStartsOn: 1 })),
        to: fmt(endOfWeek(now, { weekStartsOn: 1 })),
      },
      month: { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) },
      year: { from: fmt(startOfYear(now)), to: fmt(endOfYear(now)) },
    } as const
  })()

  const presetLabels = {
    today: 'Today',
    week: 'This week',
    month: 'This month',
    year: 'This year',
  } as const

  function applyDatePreset(preset: keyof typeof datePresets) {
    const { from, to } = datePresets[preset]
    if (fromDate === from && toDate === to) {
      // Clicking an active preset clears the range.
      setFromDate('')
      setToDate('')
      return
    }
    setFromDate(from)
    setToDate(to)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      handleClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      if (selectedIndex < filteredJournals.length) {
        const journal = filteredJournals[selectedIndex]
        if (journal) handleJournalClick(journal.journal_id)
      } else {
        const entry = filteredEntries[selectedIndex - filteredJournals.length]
        if (entry) handleEntryClick(entry)
      }
    }
  }

  if (!isSearchOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onMouseDown={handleClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative w-full max-w-2xl mx-4 bg-[var(--bg-surface)] rounded-xl shadow-2xl border border-[var(--border)] max-h-[70vh] overflow-hidden flex flex-col">

        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search size={18} className="shrink-0 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search journals and entries… use #tag to filter"
            className="flex-1 text-lg bg-transparent text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] text-[#9E9E9E] font-mono shrink-0">
            ESC
          </kbd>
        </div>

        {/* Query too long error */}
        {queryTooLong && (
          <p className="px-4 pt-2 text-xs text-red-500 dark:text-red-400">
            Query too long (max 200 characters)
          </p>
        )}

        {/* Filter row — mirrors the in-journal EntryList layout. Wraps to
            multiple lines on narrow widths instead of scrolling horizontally. */}
        <div className="flex items-center flex-wrap gap-1.5 px-4 py-2.5 border-b border-[var(--border)]">
          <span className="text-xs text-[var(--text-secondary)] mr-0.5">Date:</span>
          {(['today', 'week', 'month', 'year'] as const).map((preset) => {
            const isActive =
              fromDate === datePresets[preset].from && toDate === datePresets[preset].to
            return (
              <button
                key={preset}
                onClick={() => applyDatePreset(preset)}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#1976D2] ${
                  isActive
                    ? 'bg-[#1976D2] text-white border-[#1976D2]'
                    : 'bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1976D2] hover:text-[#1976D2]'
                }`}
              >
                {presetLabels[preset]}
              </button>
            )
          })}

          <span className="text-[var(--border)] select-none">|</span>

          <button
            onClick={() => setFavouritesOnly((v) => !v)}
            className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#1976D2] ${
              favouritesOnly
                ? 'bg-[#1976D2] text-white border-[#1976D2]'
                : 'bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1976D2] hover:text-[#1976D2]'
            }`}
          >
            Favourites only
          </button>

          {/* From + To kept together so they wrap to the next line as a pair. */}
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span>From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-xs text-[var(--text-primary)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span>To</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs text-[var(--text-primary)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
              />
            </label>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-[var(--border)]">
            {fromDate && (
              <FilterChip label={`From: ${fromDate}`} onRemove={() => setFromDate('')} />
            )}
            {toDate && <FilterChip label={`To: ${toDate}`} onRemove={() => setToDate('')} />}
            {favouritesOnly && (
              <FilterChip label="Favourites" onRemove={() => setFavouritesOnly(false)} />
            )}
            {liveTagNames.map((name) => (
              <FilterChip
                key={name}
                label={`#${name}`}
                onRemove={() => setQuery((prev) => removeHashTag(prev, name))}
              />
            ))}
          </div>
        )}

        {/* Results area */}
        <div className="flex-1 overflow-y-auto">
          {/* Vault locked — only happens on hidden surface */}
          {vaultLocked && (
            <div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
              <Lock size={28} />
              <p className="text-sm">Vault is locked — unlock from /hidden to search hidden content</p>
            </div>
          )}

          {/* Default prompt — nothing typed. Doubles as the holding state
              while the prefetch is still in flight: the snapshot almost
              always lands before the user types, so they never see a
              loading state. If they're really fast they'll see this for
              a frame, then results appear as soon as the prefetch resolves. */}
          {!vaultLocked && showZeroQuery && !hasActiveFilters && (
            <p className="text-center text-sm text-[var(--text-muted)] py-10">
              Search journals, entries, and content…
            </p>
          )}

          {/* Snapshot still loading after the user has typed. */}
          {showLoading && (
            <p className="text-center text-sm text-[var(--text-muted)] py-10">
              Loading…
            </p>
          )}

          {/* Empty results — only fires once the snapshot is in. While
              the prefetch is loading we deliberately render nothing so
              the user never sees a "no results" flash that turns into
              actual results half a second later. */}
          {showEmpty && (
            <div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
              <SearchX size={32} />
              <p className="text-sm">
                {queryLower.length > 0
                  ? `No results for “${queryLower}”`
                  : `No entries tagged ${liveTagNames.map((n) => `#${n}`).join(', ')}`}
              </p>
            </div>
          )}

          {/* Grouped results */}
          {totalItems > 0 && (
            <ul className="py-2">
              {/* Journals section */}
              {filteredJournals.length > 0 && (
                <>
                  <li className="flex items-center gap-1.5 px-4 pt-2 pb-1">
                    <BookOpen size={14} className="text-[var(--text-secondary)]" />
                    <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-medium">
                      Journals
                    </span>
                  </li>
                  {filteredJournals.map((journal, i) => (
                    <li key={journal.journal_id}>
                      <button
                        ref={(el) => {
                          resultRefs.current[i] = el
                        }}
                        onClick={() => handleJournalClick(journal.journal_id)}
                        className={`w-full text-left px-4 py-3 rounded-lg mx-2 transition-colors focus:outline-none ${
                          selectedIndex === i
                            ? 'bg-gray-100 dark:bg-slate-700/50'
                            : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                        }`}
                        style={{ width: 'calc(100% - 1rem)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: journal.color }}
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-[var(--text-primary)] truncate">
                                {journal.title}
                              </p>
                              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                                {journal.description
                                  ? journal.description.slice(0, 80)
                                  : <em className="text-gray-400 dark:text-[#616161]">No description</em>}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-[var(--text-secondary)] shrink-0 mt-0.5">
                            {journal.entry_count} {journal.entry_count === 1 ? 'entry' : 'entries'}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                  {filteredEntries.length > 0 && (
                    <li className="border-b border-[var(--border)] my-2" aria-hidden="true" />
                  )}
                </>
              )}

              {/* Entries section */}
              {filteredEntries.length > 0 && (
                <>
                  <li className="flex items-center gap-1.5 px-4 pt-2 pb-1">
                    <FileText size={14} className="text-[var(--text-secondary)]" />
                    <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-medium">
                      Entries
                    </span>
                  </li>
                  {filteredEntries.map((entry, i) => {
                    const flatIndex = filteredJournals.length + i
                    const snippet = buildSnippet(entry.text, queryWords[0] ?? '')
                    return (
                      <li key={entry.entry_id}>
                        <button
                          ref={(el) => {
                            resultRefs.current[flatIndex] = el
                          }}
                          onClick={() => handleEntryClick(entry)}
                          className={`w-full text-left px-4 py-3 rounded-lg mx-2 transition-colors focus:outline-none ${
                            selectedIndex === flatIndex
                              ? 'bg-gray-100 dark:bg-slate-700/50'
                              : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                          }`}
                          style={{ width: 'calc(100% - 1rem)' }}
                        >
                          {/* Journal label */}
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: entry.journal_color }}
                            />
                            <span className="text-xs text-[var(--text-secondary)] truncate">
                              {entry.journal_title}
                            </span>
                          </div>

                          {/* Title */}
                          <p className="font-medium text-sm text-[var(--text-primary)] truncate">
                            {entry.title ?? <em>Untitled</em>}
                          </p>

                          {/* Date + word count */}
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {format(parseISO(entry.entry_date), 'd MMM yyyy')}
                            {' · '}
                            {entry.word_count} words
                          </p>

                          {/* Snippet */}
                          {snippet && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2">
                              <HighlightedText text={snippet} terms={queryWords} />
                            </p>
                          )}

                          {/* Tags */}
                          {entry.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {entry.tags.map((tag) => (
                                <TagChip
                                  key={tag.tag_id}
                                  tagName={tag.tag_name}
                                  color={tag.color}
                                  size="sm"
                                />
                              ))}
                            </div>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
