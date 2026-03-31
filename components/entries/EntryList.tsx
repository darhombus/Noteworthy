'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, BookOpen, Loader2, Calendar, Search, SearchX, X, ChevronDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { createEntry } from '@/lib/actions/entries'
import { getColorBg } from '@/lib/validations/journals'
import { useDebounce } from '@/hooks/useDebounce'
import EntryCard from './EntryCard'
import DeleteEntryModal from './DeleteEntryModal'
import Spinner from '@/components/ui/Spinner'
import type { Database } from '@/types/supabase'

type Entry = Database['public']['Tables']['entries']['Row']
type Journal = Database['public']['Tables']['journals']['Row']

interface EntryListProps {
  journal: Journal
  entries: Entry[]
}

interface Tag {
  tag_id: string
  tag_name: string
  color: string
}

interface SearchResult {
  entry_id: string
  title: string | null
  journal_id: string
  journal_title: string
  journal_color: string
  entry_date: string
  word_count: number
  is_pinned: boolean
  snippet: string
  matched_terms: string[]
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

export default function EntryList({ journal, entries }: EntryListProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const [tags, setTags] = useState<Tag[]>([])
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false)
  const [tagsError, setTagsError] = useState(false)

  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchFetched, setSearchFetched] = useState(false)
  const [queryTooLong, setQueryTooLong] = useState(false)

  const tagsDropdownRef = useRef<HTMLDivElement>(null)
  const tagsLoadedRef = useRef(false)

  const debouncedQuery = useDebounce(searchQuery, 150)
  const abortRef = useRef<AbortController | null>(null)

  const accent = journal.color ?? '#1976D2'
  const emojiBg = isDark ? `${accent}25` : getColorBg(accent)

  const lastUpdated = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

  // Load tags once
  useEffect(() => {
    if (tagsLoadedRef.current) return
    tagsLoadedRef.current = true
    fetch('/api/tags')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Tag[]) => setTags(data))
      .catch(() => setTagsError(true))
  }, [])

  // Close tags dropdown on outside click
  useEffect(() => {
    if (!tagsDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(e.target as Node)) {
        setTagsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [tagsDropdownOpen])

  // Run search when debounced query or filters change
  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed.length === 0) {
      setSearchResults([])
      setSearchFetched(false)
      setQueryTooLong(false)
      return
    }
    if (trimmed.length > 200) {
      setQueryTooLong(true)
      return
    }
    setQueryTooLong(false)
    runSearch(trimmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, fromDate, toDate, pinnedOnly, selectedTagIds])

  async function runSearch(q: string) {
    // Cancel any in-flight request so stale results never overwrite newer ones
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    try {
      const url = new URL('/api/search', window.location.origin)
      url.searchParams.set('q', q)
      url.searchParams.set('journalId', journal.journal_id)
      if (fromDate) url.searchParams.set('from', fromDate)
      if (toDate) url.searchParams.set('to', toDate)
      if (pinnedOnly) url.searchParams.set('pinned', 'true')
      if (selectedTagIds.length > 0) url.searchParams.set('tagIds', selectedTagIds.join(','))

      const res = await fetch(url.toString(), { signal: controller.signal })

      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (!res.ok) {
        toast.error('Search is temporarily unavailable. Please try again.')
        console.error('Search error:', res.status)
        return
      }

      const data = (await res.json()) as { entries?: SearchResult[] }
      setSearchResults(Array.isArray(data.entries) ? data.entries : [])
      setSearchFetched(true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error('Search is temporarily unavailable. Please try again.')
      console.error('Search failed:', err)
    } finally {
      if (!controller.signal.aborted) setIsSearching(false)
    }
  }

  function clearAllFilters() {
    setSearchQuery('')
    setFromDate('')
    setToDate('')
    setPinnedOnly(false)
    setSelectedTagIds([])
    setSearchResults([])
    setSearchFetched(false)
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((ids) =>
      ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId],
    )
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
      toast.error('Could not create entry. Please try again.')
      setIsCreating(false)
      return
    }

    router.push(`/journals/${journal.journal_id}/entries/${result.entry_id}`)
  }

  const isSearchActive = debouncedQuery.trim().length > 0
  const hasActiveFilters = fromDate || toDate || pinnedOnly || selectedTagIds.length > 0
  const showSearchEmpty = searchFetched && searchResults.length === 0 && !isSearching

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      {/* Journal hero banner */}
      <div
        className="rounded-2xl p-7 mb-7 border"
        style={{
          background: isDark
            ? `linear-gradient(160deg, ${accent}12 0%, ${accent}05 100%)`
            : `linear-gradient(160deg, ${accent}18 0%, ${accent}05 100%)`,
          borderColor: `${accent}25`,
        }}
      >
        <div className="flex items-start gap-5">
          {/* Emoji bubble */}
          <div
            className="flex items-center justify-center w-[68px] h-[68px] rounded-[18px] text-[34px] shrink-0"
            style={{
              background: emojiBg,
              boxShadow: `0 6px 20px ${accent}30`,
            }}
          >
            {journal.icon}
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
                  boxShadow: `0 4px 14px ${accent}45`,
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
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (e.target.value.length <= 200) setQueryTooLong(false)
            }}
            placeholder="Search entries in this journal…"
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

        {/* Filter row */}
        <div className="flex items-center flex-wrap gap-2">
          {/* From date */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span>From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="text-xs text-[var(--text-primary)] bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#1976D2]"
            />
          </label>

          {/* To date */}
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

          {/* Tags dropdown */}
          <div ref={tagsDropdownRef} className="relative">
            <button
              onClick={() => setTagsDropdownOpen((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-[#1976D2] ${
                selectedTagIds.length > 0
                  ? 'bg-[#1976D2] text-white border-[#1976D2]'
                  : 'bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1976D2] hover:text-[#1976D2]'
              }`}
            >
              Tags
              {selectedTagIds.length > 0 && (
                <span className="text-[10px] opacity-80">({selectedTagIds.length})</span>
              )}
              <ChevronDown size={12} />
            </button>

            {tagsDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 z-10 w-52 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
                {tagsError ? (
                  <p className="px-3 py-2 text-xs text-red-500 dark:text-red-400">
                    Could not load tags
                  </p>
                ) : tags.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[#9E9E9E]">No tags yet</p>
                ) : (
                  tags.map((tag) => (
                    <label
                      key={tag.tag_id}
                      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-muted)] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTagIds.includes(tag.tag_id)}
                        onChange={() => toggleTag(tag.tag_id)}
                        className="rounded"
                      />
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.tag_name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
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
            {selectedTagIds.map((tagId) => {
              const tag = tags.find((t) => t.tag_id === tagId)
              if (!tag) return null
              return (
                <FilterChip
                  key={tagId}
                  label={`Tag: ${tag.tag_name}`}
                  onRemove={() => setSelectedTagIds((ids) => ids.filter((id) => id !== tagId))}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Search results */}
      {isSearchActive && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-base font-bold text-[var(--text-primary)]"
              style={{ letterSpacing: '-0.2px' }}
            >
              Search Results
            </h2>
          </div>

          {isSearching && (
            <div className="flex justify-center py-12">
              <Spinner size={24} />
            </div>
          )}

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

          {!isSearching && searchResults.length > 0 && (
            <div className="flex flex-col gap-3">
              {searchResults.map((result) => (
                <button
                  key={result.entry_id}
                  onClick={() =>
                    router.push(`/journals/${result.journal_id}/entries/${result.entry_id}`)
                  }
                  className="w-full text-left bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors"
                >
                  {/* Title */}
                  <p className="font-medium text-[15px] text-[var(--text-primary)] truncate">
                    {result.title ?? <em>Untitled</em>}
                  </p>

                  {/* Date + word count */}
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {format(parseISO(result.entry_date), 'd MMM yyyy')}
                    {' · '}
                    {result.word_count} words
                  </p>

                  {/* Snippet */}
                  {result.snippet && (
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                      <HighlightedText text={result.snippet} terms={result.matched_terms} />
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Normal entry list — shown when not searching */}
      {!isSearchActive && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-base font-bold text-[var(--text-primary)]"
              style={{ letterSpacing: '-0.2px' }}
            >
              All Entries
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          {entries.length === 0 ? (
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
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((entry, index) => (
                <EntryCard
                  key={entry.entry_id}
                  entry={entry}
                  journalId={journal.journal_id}
                  accentColor={accent}
                  isLatest={index === 0}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <DeleteEntryModal
          entryId={deleteTarget.entry_id}
          journalId={journal.journal_id}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
