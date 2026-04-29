'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, BookOpen, Loader2, Calendar, Search, SearchX, X } from 'lucide-react'
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { createEntry } from '@/lib/actions/entries'
import { useSurface } from '@/lib/surface'
import { entryHref } from '@/lib/utils/href'

/** Convert a 6-digit hex color + 2-char hex opacity to rgba() to avoid
 *  browser normalisation causing SSR/client hydration mismatches. */
function hexAlpha(hex: string, alpha: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${(parseInt(alpha, 16) / 255).toFixed(3)})`
}
import BookIcon from '@/components/ui/BookIcon'
import EntryCard from './EntryCard'
import DeleteEntryModal from './DeleteEntryModal'
import type { Database } from '@/types/supabase'

type EntryBase = Database['public']['Tables']['entries']['Row']
type Journal = Database['public']['Tables']['journals']['Row']

interface EntryTag {
  tag_id: string
  tag_name: string
  color: string
}

type Entry = EntryBase & { tags?: EntryTag[] }

interface EntryListProps {
  journal: Journal
  entries: Entry[]
}

interface SearchResult {
  entry: Entry
  /** Lower-cased haystack used to find/match the query — derived from the
   *  entry's `search_text` (or title fallback). Snippet centring uses
   *  this same string so highlights line up exactly. */
  haystack: string
  snippet: string
  matchedTerms: string[]
}

// Highlight text using String.indexOf — no regex with user input
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

// Parse #tagname tokens from a query string
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

/** Cut a snippet centred on the first match, with ellipses when we're not
 *  at the boundaries. Mirrors the server's `LEFT(search_text, 200)` shape
 *  when no match is found, so the highlight component still has something
 *  to render for tag/date-only filtering. */
function buildSnippet(haystack: string, queryLower: string): string {
  if (!haystack) return ''
  const SNIPPET_LEN = 200
  if (haystack.length <= SNIPPET_LEN) return haystack
  if (!queryLower) return haystack.slice(0, SNIPPET_LEN)

  const idx = haystack.toLowerCase().indexOf(queryLower)
  if (idx === -1) return haystack.slice(0, SNIPPET_LEN)

  const lead = 50
  const start = Math.max(0, idx - lead)
  const end = Math.min(haystack.length, start + SNIPPET_LEN)
  let snippet = haystack.slice(start, end)
  if (start > 0) snippet = '…' + snippet
  if (end < haystack.length) snippet = snippet + '…'
  return snippet
}

export default function EntryList({ journal, entries }: EntryListProps) {
  const router = useRouter()
  const surface = useSurface()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Search state — fully client-side. Every entry on this page already
  // arrived from the server with `search_text` (the materialized
  // generated column from migration 020) prefilled, so filtering is just
  // an in-memory string scan. No fetch, no debounce, no spinner.
  const [searchQuery, setSearchQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [queryTooLong, setQueryTooLong] = useState(false)

  const accent = journal.color ?? '#1976D2'

  useEffect(() => { setMounted(true) }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  const lastUpdated = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

  // Pre-compute, for every entry, the lower-cased match haystack (title
  // + plain Tiptap text from the generated search_text column) AND the
  // body-only preview text used for the snippet. Splitting them means
  // searches still match against the title, but the snippet rendered
  // back to the user mirrors the regular EntryCard preview — body text
  // only, never duplicating the heading shown directly above it.
  const entryHaystacks = useMemo(() => {
    const map = new Map<string, { match: string; body: string }>()
    for (const e of entries) {
      const match = (e.search_text ?? `${e.title ?? ''}`).toLowerCase()
      // search_text is `coalesce(title,'') || ' ' || extract_tiptap_text(content)`.
      // Strip exactly that prefix so the snippet contains body text only.
      const titlePrefix = `${e.title ?? ''} `
      const raw = e.search_text ?? ''
      const body = raw.startsWith(titlePrefix) ? raw.slice(titlePrefix.length) : raw
      map.set(e.entry_id, { match, body })
    }
    return map
  }, [entries])

  // Derive text and tag patterns from the live query — debouncing isn't
  // needed when filtering happens locally with no network in play.
  const { text: queryText, tagNames: liveTagNames } = parseHashTags(searchQuery)
  const queryLower = queryText.trim().toLowerCase()
  const isTextSearchActive = queryLower.length > 0
  const isTagFilterActive = liveTagNames.length > 0

  useEffect(() => {
    if (queryText.length > 200) {
      setQueryTooLong(true)
    } else if (queryTooLong) {
      setQueryTooLong(false)
    }
  }, [queryText, queryTooLong])

  // Apply tag/date/pinned filters first — these are reused by both modes.
  const filteredEntries = useMemo(() => {
    let result = entries

    if (isTagFilterActive) {
      result = result.filter((e) =>
        liveTagNames.some((pattern) =>
          (e.tags ?? []).some((t) => t.tag_name.toLowerCase().includes(pattern)),
        ),
      )
    }
    if (pinnedOnly) result = result.filter((e) => e.is_pinned)
    if (fromDate)   result = result.filter((e) => e.entry_date >= fromDate)
    if (toDate)     result = result.filter((e) => e.entry_date <= toDate)

    return result
  // liveTagNames is a fresh array each render — depend on its serialised form
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, isTagFilterActive, liveTagNames.join(','), pinnedOnly, fromDate, toDate])

  // Client-side text-search results. Splits the query into words so a
  // multi-word query "lov morn" matches "loving morning" without needing
  // them adjacent. Cap at 50 results so a no-op query against a huge
  // journal doesn't pay rendering cost it doesn't need.
  const searchResults: SearchResult[] = useMemo(() => {
    if (!isTextSearchActive || queryTooLong) return []
    const words = queryLower.split(/\s+/).filter(Boolean)
    const out: SearchResult[] = []
    for (const e of filteredEntries) {
      const indexed = entryHaystacks.get(e.entry_id)
      if (!indexed) continue
      // require every word to appear somewhere in the match haystack
      // (title + body) so title-only matches still surface.
      if (!words.every((w) => indexed.match.includes(w))) continue
      // Snippet centres on the first body match. If the only match is in
      // the title, fall back to the body's leading slice rather than the
      // title text — the title is already shown above the snippet.
      const snippet = buildSnippet(indexed.body, words[0] ?? '')
      out.push({ entry: e, haystack: indexed.match, snippet, matchedTerms: words })
      if (out.length >= 50) break
    }
    return out
  }, [filteredEntries, entryHaystacks, queryLower, isTextSearchActive, queryTooLong])

  function clearAllFilters() {
    setSearchQuery('')
    setFromDate('')
    setToDate('')
    setPinnedOnly(false)
  }

  function setDatePreset(preset: 'today' | 'week' | 'month' | 'year') {
    const now = new Date()
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    switch (preset) {
      case 'today': {
        const d = fmt(now)
        setFromDate(d)
        setToDate(d)
        break
      }
      case 'week':
        setFromDate(fmt(startOfWeek(now, { weekStartsOn: 1 })))
        setToDate(fmt(endOfWeek(now, { weekStartsOn: 1 })))
        break
      case 'month':
        setFromDate(fmt(startOfMonth(now)))
        setToDate(fmt(endOfMonth(now)))
        break
      case 'year':
        setFromDate(fmt(startOfYear(now)))
        setToDate(fmt(endOfYear(now)))
        break
    }
  }

  async function handleNewEntry() {
    if (isCreating) return
    setIsCreating(true)

    const today = new Date().toLocaleDateString('en-CA')
    const result = await createEntry({
      journal_id: journal.journal_id,
      entry_date: today,
    })

    if ('error' in result) {
      // Refresh the page so any entry that was created server-side (despite the
      // client-side error, e.g. a Supabase timeout) becomes visible rather than
      // silently duplicated on a retry.
      router.refresh()
      toast.error('Could not create entry — the page has been refreshed.')
      setIsCreating(false)
      return
    }

    router.push(entryHref(surface, journal.journal_id, result.entry_id, {
      standalone: surface === 'hidden' && !journal.is_hidden,
    }))
  }

  const hasDatePinFilters = !!(fromDate || toDate || pinnedOnly)
  const hasActiveFilters = hasDatePinFilters || liveTagNames.length > 0
  const isAnyClientFilterActive = isTagFilterActive || hasDatePinFilters
  const showSearchEmpty = isTextSearchActive && searchResults.length === 0 && !queryTooLong

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      {/* Journal hero banner */}
      <div
        className="rounded-2xl p-7 mb-7 border"
        style={{
          background: isDark
            ? `linear-gradient(160deg, ${hexAlpha(accent, '12')} 0%, ${hexAlpha(accent, '05')} 100%)`
            : `linear-gradient(160deg, ${hexAlpha(accent, '18')} 0%, ${hexAlpha(accent, '05')} 100%)`,
          borderColor: hexAlpha(accent, '25'),
        }}
      >
        <div className="flex items-start gap-5">
          {/* Book icon */}
          <div
            className="shrink-0"
            style={{ filter: `drop-shadow(0 6px 16px ${hexAlpha(accent, '40')})` }}
          >
            <BookIcon color={accent} size={68} />
          </div>

          {/* Info + action */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1
                  className="text-[22px] font-bold text-[var(--text-primary)] truncate"
                  style={{ letterSpacing: '-0.4px' }}
                >
                  {journal.title}
                </h1>
                {journal.description && (
                  <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                    {journal.description}
                  </p>
                )}
              </div>
              <button
                onClick={handleNewEntry}
                disabled={isCreating}
                className="flex items-center gap-2 px-5 py-[10px] rounded-[10px] text-white text-[13px] font-semibold shrink-0 disabled:opacity-70 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
                style={{
                  background: accent,
                  boxShadow: `0 4px 14px ${hexAlpha(accent, '45')}`,
                }}
              >
                {isCreating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <PenLine size={15} />
                )}
                {isCreating ? 'Creating…' : 'New Entry'}
              </button>
            </div>

            {/* Stat pills */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <span className="flex items-center gap-1.5 px-[14px] py-[5px] rounded-full text-xs bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)]">
                <BookOpen size={11} />
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
              <span className="flex items-center gap-1.5 px-[14px] py-[5px] rounded-full text-xs bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)]">
                <Calendar size={11} />
                {lastUpdated}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search + filter area */}
      <div className="mb-5">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] mb-3">
          <Search size={16} className="shrink-0 text-[#9E9E9E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries… use #tagname to filter by tag"
            className="flex-1 text-sm bg-transparent text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={clearAllFilters}
              className="p-0.5 rounded text-[#9E9E9E] hover:text-[#757575] transition-colors"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {queryTooLong && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-2 px-1">
            Query too long (max 200 characters)
          </p>
        )}

        {/* Filter row — date presets + custom range + pinned */}
        <div className="flex flex-col gap-2">
          {/* Quick date presets */}
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-xs text-[var(--text-secondary)] mr-0.5">Date:</span>
            {(['today', 'week', 'month', 'year'] as const).map((preset) => {
              const labels = { today: 'Today', week: 'This week', month: 'This month', year: 'This year' }
              const now = new Date()
              const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
              const presetRanges = {
                today: { from: fmt(now), to: fmt(now) },
                week: { from: fmt(startOfWeek(now, { weekStartsOn: 1 })), to: fmt(endOfWeek(now, { weekStartsOn: 1 })) },
                month: { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) },
                year: { from: fmt(startOfYear(now)), to: fmt(endOfYear(now)) },
              }
              const isActive = fromDate === presetRanges[preset].from && toDate === presetRanges[preset].to
              return (
                <button
                  key={preset}
                  onClick={() => isActive ? (setFromDate(''), setToDate('')) : setDatePreset(preset)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#1976D2] ${
                    isActive
                      ? 'bg-[#1976D2] text-white border-[#1976D2]'
                      : 'bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1976D2] hover:text-[#1976D2]'
                  }`}
                >
                  {labels[preset]}
                </button>
              )
            })}

            {/* Divider */}
            <span className="text-[var(--border)] select-none">|</span>

            {/* Custom range */}
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

            {/* Pinned only */}
            <button
              onClick={() => setPinnedOnly((v) => !v)}
              className={`text-xs px-3 py-1 rounded-lg border font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#1976D2] ${
                pinnedOnly
                  ? 'bg-[#1976D2] text-white border-[#1976D2]'
                  : 'bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1976D2] hover:text-[#1976D2]'
              }`}
            >
              Pinned only
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fromDate && (
              <FilterChip label={`From: ${fromDate}`} onRemove={() => setFromDate('')} />
            )}
            {toDate && <FilterChip label={`To: ${toDate}`} onRemove={() => setToDate('')} />}
            {pinnedOnly && (
              <FilterChip label="Pinned" onRemove={() => setPinnedOnly(false)} />
            )}
            {liveTagNames.map((name) => (
              <FilterChip
                key={name}
                label={`#${name}`}
                onRemove={() => setSearchQuery((prev) => removeHashTag(prev, name))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Full-text search results */}
      {isTextSearchActive && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-base font-bold text-[var(--text-primary)]"
              style={{ letterSpacing: '-0.2px' }}
            >
              Search Results
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'}
            </span>
          </div>

          {showSearchEmpty && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <SearchX className="w-10 h-10 text-[#E0E0E0] dark:text-[#3A3A3A]" />
              <p className="text-base text-[var(--text-secondary)]">
                No entries match your search
              </p>
              <button
                onClick={clearAllFilters}
                className="text-sm text-[#1976D2] hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="flex flex-col gap-3">
              {searchResults.map((result) => (
                <button
                  key={result.entry.entry_id}
                  onClick={() =>
                    router.push(
                      entryHref(surface, journal.journal_id, result.entry.entry_id, {
                        // Search results within EntryList are always scoped to
                        // the current journal — share the parent's hidden flag.
                        standalone: surface === 'hidden' && !journal.is_hidden,
                      }),
                    )
                  }
                  className="w-full text-left bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors"
                >
                  {/* Title */}
                  <p className="font-medium text-[15px] text-[var(--text-primary)] truncate">
                    {result.entry.title ?? <em>Untitled</em>}
                  </p>

                  {/* Date + word count */}
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {format(parseISO(result.entry.entry_date), 'd MMM yyyy')}
                    {' · '}
                    {result.entry.word_count} words
                  </p>

                  {/* Snippet */}
                  {result.snippet && (
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                      <HighlightedText text={result.snippet} terms={result.matchedTerms} />
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Normal / tag-filtered entry list */}
      {!isTextSearchActive && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-base font-bold text-[var(--text-primary)]"
              style={{ letterSpacing: '-0.2px' }}
            >
              {isAnyClientFilterActive ? 'Filtered Entries' : 'All Entries'}
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {filteredEntries.length === 0 ? (
            isAnyClientFilterActive ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <SearchX className="w-10 h-10 text-[#E0E0E0] dark:text-[#3A3A3A]" />
                <p className="text-base text-[var(--text-secondary)]">
                  No entries match the active filters
                </p>
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-[#1976D2] hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <BookOpen className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A] mb-4" />
                <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">
                  No entries yet
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-6">
                  Start writing your first entry.
                </p>
                <button
                  onClick={handleNewEntry}
                  disabled={isCreating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-70"
                  style={{ background: accent }}
                >
                  {isCreating && <Loader2 size={15} className="animate-spin" />}
                  {isCreating ? 'Creating…' : 'Create your first entry'}
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {(() => {
                const latestEntry = filteredEntries.reduce<typeof filteredEntries[0] | null>((a, b) => {
                  if (!a) return b
                  if (a.entry_date !== b.entry_date) return a.entry_date > b.entry_date ? a : b
                  return new Date(a.created_at).getTime() >= new Date(b.created_at).getTime() ? a : b
                }, null)
                return filteredEntries.map((entry) => (
                  <EntryCard
                    key={entry.entry_id}
                    entry={entry}
                    journalId={journal.journal_id}
                    accentColor={accent}
                    isLatest={entry.entry_id === latestEntry?.entry_id}
                    onDelete={setDeleteTarget}
                    tags={entry.tags}
                    parentJournalIsHidden={journal.is_hidden}
                  />
                ))
              })()}
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <DeleteEntryModal
          entryId={deleteTarget.entry_id}
          journalId={journal.journal_id}
          parentJournalIsHidden={journal.is_hidden}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
