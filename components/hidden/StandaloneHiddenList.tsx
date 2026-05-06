'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Search,
  SearchX,
  X,
} from 'lucide-react'
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
import EntryCard from '@/components/entries/EntryCard'
import DeleteEntryModal from '@/components/entries/DeleteEntryModal'
import { entryHref } from '@/lib/utils/href'
import { useSurface } from '@/lib/surface'
import type { Database } from '@/types/supabase'

type EntryRow = Database['public']['Tables']['entries']['Row']

interface EntryTag {
  tag_id: string
  tag_name: string
  color: string
}

export interface StandaloneHiddenEntry extends EntryRow {
  parentJournalTitle: string
  parentJournalColor: string
  tags: EntryTag[]
}

interface SearchResult {
  entry: StandaloneHiddenEntry
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

interface Props {
  entries: StandaloneHiddenEntry[]
}

/** Read-only listing of every entry where entry.is_hidden=true and the
 *  parent journal is public. Mirrors the public per-journal entry list
 *  search/filter UI exactly: date presets, custom range, pinned-only,
 *  favourites-only, and #tag tokens — driven by the entries' embedded
 *  tags so a brand-new tag matches without a separate /api/tags load. */
export default function StandaloneHiddenList({ entries }: Props) {
  const router = useRouter()
  const surface = useSurface()
  const [deleteTarget, setDeleteTarget] = useState<EntryRow | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [favouritesOnly, setFavouritesOnly] = useState(false)
  const [queryTooLong, setQueryTooLong] = useState(false)

  // Pre-compute, for every entry, the lower-cased match haystack
  // (title + plain text + parent-journal title) AND the body-only
  // preview text used for the snippet.
  const entryHaystacks = useMemo(() => {
    const map = new Map<string, { match: string; body: string }>()
    for (const e of entries) {
      // Match haystack includes title, body, parent journal title, and
      // tag names — so a plain-text query finds an entry by tag (covers
      // brand-new tags) just like the public per-journal search.
      const tagText = (e.tags ?? []).map((t) => t.tag_name).join(' ')
      const baseMatch =
        (e.search_text ?? `${e.title ?? ''}`).toLowerCase() +
        ' ' +
        e.parentJournalTitle.toLowerCase() +
        (tagText ? ' ' + tagText.toLowerCase() : '')
      const titlePrefix = `${e.title ?? ''} `
      const raw = e.search_text ?? ''
      const body = raw.startsWith(titlePrefix) ? raw.slice(titlePrefix.length) : raw
      map.set(e.entry_id, { match: baseMatch, body })
    }
    return map
  }, [entries])

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

  // Stable sort: pinned first, then most-recently updated.
  const sortedEntries = useMemo(() => {
    const out = [...entries]
    out.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return out
  }, [entries])

  // Apply tag/date/pinned/favourites filters first.
  const filteredEntries = useMemo(() => {
    let result = sortedEntries

    if (isTagFilterActive) {
      result = result.filter((e) =>
        liveTagNames.some((pattern) =>
          (e.tags ?? []).some((t) => t.tag_name.toLowerCase().includes(pattern)),
        ),
      )
    }
    if (pinnedOnly)     result = result.filter((e) => e.is_pinned)
    if (favouritesOnly) result = result.filter((e) => e.is_favorite)
    if (fromDate)       result = result.filter((e) => e.entry_date >= fromDate)
    if (toDate)         result = result.filter((e) => e.entry_date <= toDate)

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedEntries, isTagFilterActive, liveTagNames.join(','), pinnedOnly, favouritesOnly, fromDate, toDate])

  const searchResults: SearchResult[] = useMemo(() => {
    if (!isTextSearchActive || queryTooLong) return []
    const words = queryLower.split(/\s+/).filter(Boolean)
    const out: SearchResult[] = []
    for (const e of filteredEntries) {
      const indexed = entryHaystacks.get(e.entry_id)
      if (!indexed) continue
      if (!words.every((w) => indexed.match.includes(w))) continue
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
    setFavouritesOnly(false)
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

  const hasDatePinFilters = !!(fromDate || toDate || pinnedOnly || favouritesOnly)
  const hasActiveFilters = hasDatePinFilters || liveTagNames.length > 0
  const isAnyClientFilterActive = isTagFilterActive || hasDatePinFilters
  const showSearchEmpty = isTextSearchActive && searchResults.length === 0 && !queryTooLong

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/hidden"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-3"
        >
          <ArrowLeft size={14} />
          Back to Hidden
        </Link>

        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Hidden Entries
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {entries.length} standalone {entries.length === 1 ? 'entry' : 'entries'}
            {' · read-only system journal'}
          </p>
        </div>
      </div>

      {/* Search + filter area — same shape as EntryList for the public surface */}
      <div className="mb-5">
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

        <div className="flex flex-col gap-2">
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

            <span className="text-[var(--border)] select-none">|</span>

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
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fromDate && (
              <FilterChip label={`From: ${fromDate}`} onRemove={() => setFromDate('')} />
            )}
            {toDate && <FilterChip label={`To: ${toDate}`} onRemove={() => setToDate('')} />}
            {pinnedOnly && (
              <FilterChip label="Pinned" onRemove={() => setPinnedOnly(false)} />
            )}
            {favouritesOnly && (
              <FilterChip label="Favourites" onRemove={() => setFavouritesOnly(false)} />
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

      {/* Empty entire-list state — surfaces when there are no standalone
          hidden entries at all, before any filter is applied. */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <SearchX className="w-10 h-10 text-[#E0E0E0] dark:text-[#3A3A3A] mb-3" />
          <p className="text-base text-[var(--text-secondary)]">
            No standalone hidden entries
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm">
            Hide an individual entry inside a public journal and it&apos;ll show up here.
          </p>
        </div>
      ) : isTextSearchActive ? (
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
                      entryHref(surface, result.entry.journal_id, result.entry.entry_id, {
                        // standalone-hidden: parent journal is public
                        standalone: true,
                      }),
                    )
                  }
                  className="w-full text-left bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: result.entry.parentJournalColor }}
                    />
                    <span className="text-xs text-[var(--text-secondary)] truncate">
                      {result.entry.parentJournalTitle}
                    </span>
                  </div>
                  <p className="font-medium text-[15px] text-[var(--text-primary)] truncate">
                    {result.entry.title ?? <em>Untitled</em>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {format(parseISO(result.entry.entry_date), 'd MMM yyyy')}
                    {' · '}
                    {result.entry.word_count} words
                  </p>
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
      ) : (
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
            <div className="flex flex-col gap-3">
              {filteredEntries.map((entry) => (
                <EntryCard
                  key={entry.entry_id}
                  entry={entry}
                  journalId={entry.journal_id}
                  accentColor={entry.parentJournalColor}
                  isLatest={false}
                  tags={entry.tags}
                  onDelete={setDeleteTarget}
                  parentJournalLabel={{
                    title: entry.parentJournalTitle,
                    color: entry.parentJournalColor,
                  }}
                  parentJournalIsHidden={false}
                />
              ))}
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <DeleteEntryModal
          entryId={deleteTarget.entry_id}
          journalId={deleteTarget.journal_id}
          parentJournalIsHidden={false}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
