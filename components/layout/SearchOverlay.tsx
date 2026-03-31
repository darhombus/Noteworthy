'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SearchX, X, ChevronDown, BookOpen, FileText } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useUIStore } from '@/store/useUIStore'
import { useDebounce } from '@/hooks/useDebounce'
import Spinner from '@/components/ui/Spinner'

interface Tag {
  tag_id: string
  tag_name: string
  color: string
}

interface JournalResult {
  journal_id: string
  title: string
  description: string | null
  color: string
  icon: string
  entry_count: number
  is_favorite: boolean
}

interface EntryResult {
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

// Highlight text segments by matched terms using String.indexOf (no regex with user input)
function HighlightedText({
  text,
  terms,
}: {
  text: string
  terms: string[]
}): React.ReactElement {
  if (!terms.length) return <>{text}</>

  // Collect all match positions
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

  // Sort and merge overlapping ranges
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

  // Build React node array
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

export default function SearchOverlay() {
  const router = useRouter()
  const { isSearchOpen, openSearch, closeSearch } = useUIStore()

  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  const [tags, setTags] = useState<Tag[]>([])
  const [tagsError, setTagsError] = useState(false)
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false)

  const [journals, setJournals] = useState<JournalResult[]>([])
  const [entries, setEntries] = useState<EntryResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [queryTooLong, setQueryTooLong] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [hasFetched, setHasFetched] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const tagsDropdownRef = useRef<HTMLDivElement>(null)
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tagsLoadedRef = useRef(false)

  const debouncedQuery = useDebounce(query, 150)
  const abortRef = useRef<AbortController | null>(null)

  const totalItems = journals.length + entries.length

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

  // Focus input and load tags when overlay opens
  useEffect(() => {
    if (!isSearchOpen) return
    setSelectedIndex(-1)
    setTimeout(() => inputRef.current?.focus(), 0)
    if (!tagsLoadedRef.current) {
      tagsLoadedRef.current = true
      fetchTags()
    }
  }, [isSearchOpen])

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

  // Scroll selected result into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      resultRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Run search when debounced query or filters change
  useEffect(() => {
    if (!isSearchOpen) return

    const trimmed = debouncedQuery.trim()
    if (trimmed.length === 0) {
      setJournals([])
      setEntries([])
      setHasFetched(false)
      return
    }
    if (trimmed.length > 200) {
      setQueryTooLong(true)
      return
    }

    setQueryTooLong(false)
    runSearch(trimmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, fromDate, toDate, pinnedOnly, selectedTagIds, isSearchOpen])

  async function fetchTags() {
    try {
      const res = await fetch('/api/tags')
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as Tag[]
      setTags(data)
    } catch {
      setTagsError(true)
    }
  }

  async function runSearch(q: string) {
    // Cancel any in-flight request so stale results never overwrite newer ones
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsSearching(true)
    setSelectedIndex(-1)
    try {
      const url = new URL('/api/search', window.location.origin)
      url.searchParams.set('q', q)
      if (fromDate) url.searchParams.set('from', fromDate)
      if (toDate) url.searchParams.set('to', toDate)
      if (pinnedOnly) url.searchParams.set('pinned', 'true')
      if (selectedTagIds.length > 0) url.searchParams.set('tagIds', selectedTagIds.join(','))

      const res = await fetch(url.toString(), { signal: controller.signal })

      if (res.status === 401) {
        router.push('/login')
        return
      }
      if (res.status === 400) {
        const body = (await res.json()) as { error: string }
        if (body.error === 'Invalid search parameters') {
          setQueryTooLong(true)
        }
        return
      }
      if (!res.ok) {
        toast.error('Search is temporarily unavailable. Please try again.')
        console.error('Search API error:', res.status)
        return
      }

      const data = (await res.json()) as { journals?: unknown; entries?: unknown }
      setJournals(Array.isArray(data.journals) ? (data.journals as JournalResult[]) : [])
      setEntries(Array.isArray(data.entries) ? (data.entries as EntryResult[]) : [])
      setHasFetched(true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error('Search is temporarily unavailable. Please try again.')
      console.error('Search failed:', err)
    } finally {
      if (!controller.signal.aborted) setIsSearching(false)
    }
  }

  function handleClose() {
    abortRef.current?.abort()
    closeSearch()
    setQuery('')
    setFromDate('')
    setToDate('')
    setPinnedOnly(false)
    setSelectedTagIds([])
    setJournals([])
    setEntries([])
    setHasFetched(false)
    setIsSearching(false)
    setQueryTooLong(false)
    setTagsDropdownOpen(false)
    setSelectedIndex(-1)
  }

  const handleEntryClick = useCallback(
    (result: EntryResult) => {
      router.push(`/journals/${result.journal_id}/entries/${result.entry_id}`)
      handleClose()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  )

  const handleJournalClick = useCallback(
    (journalId: string) => {
      router.push(`/journals/${journalId}`)
      handleClose()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  )

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
      if (selectedIndex < journals.length) {
        const journal = journals[selectedIndex]
        if (journal) handleJournalClick(journal.journal_id)
      } else {
        const entry = entries[selectedIndex - journals.length]
        if (entry) handleEntryClick(entry)
      }
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((ids) =>
      ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId],
    )
  }

  const hasActiveFilters = fromDate || toDate || pinnedOnly || selectedTagIds.length > 0
  const showEmpty = hasFetched && totalItems === 0 && !isSearching
  const showZeroQuery = debouncedQuery.trim().length === 0
  const showFiltersWithoutQuery =
    !showZeroQuery === false && hasActiveFilters && debouncedQuery.trim().length === 0

  if (!isSearchOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
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
            onChange={(e) => {
              const val = e.target.value
              setQuery(val)
              if (val.length <= 200) setQueryTooLong(false)
              if (val.trim().length === 0) {
                abortRef.current?.abort()
                setJournals([])
                setEntries([])
                setHasFetched(false)
                setIsSearching(false)
              }
            }}
            placeholder="Search journals, entries, and content…"
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

        {/* Filter row */}
        <div className="flex items-center flex-wrap gap-2 px-4 py-2.5 border-b border-[var(--border)]">
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
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-[var(--border)]">
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

        {/* Results area */}
        <div className="flex-1 overflow-y-auto">
          {/* Zero-query state */}
          {showZeroQuery && !hasActiveFilters && (
            <p className="text-center text-sm text-[var(--text-muted)] py-10">
              Search journals, entries, and content…
            </p>
          )}

          {/* Filters active but no query */}
          {(showZeroQuery || showFiltersWithoutQuery) && hasActiveFilters && debouncedQuery.trim().length === 0 && (
            <p className="text-center text-sm text-[var(--text-muted)] py-10">
              Type a search term to apply filters…
            </p>
          )}

          {/* Spinner */}
          {isSearching && (
            <div className="flex justify-center py-10">
              <Spinner size={24} />
            </div>
          )}

          {/* Empty results */}
          {showEmpty && debouncedQuery.trim().length > 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-[var(--text-muted)]">
              <SearchX size={32} />
              <p className="text-sm">No results for &ldquo;{debouncedQuery}&rdquo;</p>
            </div>
          )}

          {/* Grouped results */}
          {!isSearching && totalItems > 0 && (
            <ul className="py-2">
              {/* Journals section */}
              {journals.length > 0 && (
                <>
                  <li className="flex items-center gap-1.5 px-4 pt-2 pb-1">
                    <BookOpen size={14} className="text-[var(--text-secondary)]" />
                    <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-medium">
                      Journals
                    </span>
                  </li>
                  {journals.map((journal, i) => (
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
                  {entries.length > 0 && (
                    <li className="border-b border-[var(--border)] my-2" aria-hidden="true" />
                  )}
                </>
              )}

              {/* Entries section */}
              {entries.length > 0 && (
                <>
                  <li className="flex items-center gap-1.5 px-4 pt-2 pb-1">
                    <FileText size={14} className="text-[var(--text-secondary)]" />
                    <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)] font-medium">
                      Entries
                    </span>
                  </li>
                  {entries.map((entry, i) => {
                    const flatIndex = journals.length + i
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
                          {entry.snippet && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2">
                              <HighlightedText
                                text={entry.snippet}
                                terms={entry.matched_terms}
                              />
                            </p>
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
