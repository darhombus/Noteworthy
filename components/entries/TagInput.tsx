'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { addTagToEntry, removeTagFromEntry, createTag } from '@/lib/actions/tags'
import TagChip from '@/components/ui/TagChip'

interface EntryTag {
  tag_id: string
  tag_name: string
  color: string
}

interface AutocompleteTag {
  tag_id: string
  tag_name: string
  color: string
  usage_count: number
}

interface TagInputProps {
  entryId: string
  initialTags: EntryTag[]
}

function autoFormat(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export default function TagInput({ entryId, initialTags }: TagInputProps) {
  const [localTags, setLocalTags] = useState<EntryTag[]>(initialTags)
  const [inputValue, setInputValue] = useState('')
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteTag[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [isFetching, setIsFetching] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const debouncedInput = useDebounce(inputValue, 200)

  // Fetch autocomplete results
  useEffect(() => {
    const trimmed = debouncedInput.trim()
    if (!trimmed) {
      setAutocompleteResults([])
      setDropdownOpen(false)
      return
    }

    setIsFetching(true)
    const controller = new AbortController()
    const url = new URL('/api/tags', window.location.origin)
    url.searchParams.set('q', trimmed)

    fetch(url.toString(), { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: AutocompleteTag[]) => {
        // Filter out already-added tags
        const filtered = data.filter((t) => !localTags.some((lt) => lt.tag_id === t.tag_id))
        setAutocompleteResults(filtered.slice(0, 5))
        setDropdownOpen(true)
        setHighlightedIndex(-1)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setAutocompleteResults([])
      })
      .finally(() => setIsFetching(false))

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInput])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const hasExactMatch = autocompleteResults.some(
    (t) => t.tag_name === inputValue.trim().toLowerCase(),
  )

  const dropdownItems: Array<{ type: 'existing'; tag: AutocompleteTag } | { type: 'create' }> = [
    ...autocompleteResults.map((tag) => ({ type: 'existing' as const, tag })),
    ...(inputValue.trim() && !hasExactMatch ? [{ type: 'create' as const }] : []),
  ]

  async function selectExistingTag(tag: AutocompleteTag) {
    setDropdownOpen(false)
    setInputValue('')
    setAutocompleteResults([])

    // Optimistic add
    const optimistic: EntryTag = { tag_id: tag.tag_id, tag_name: tag.tag_name, color: tag.color }
    setLocalTags((prev) => [...prev, optimistic])

    const result = await addTagToEntry(entryId, tag.tag_id)
    if ('error' in result) {
      setLocalTags((prev) => prev.filter((t) => t.tag_id !== tag.tag_id))
      toast.error(result.error ?? 'Failed to add tag')
    }
  }

  async function handleCreate() {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    setDropdownOpen(false)
    setInputValue('')
    setAutocompleteResults([])

    const tagName = autoFormat(trimmed)
    if (!tagName) {
      toast.error('Invalid tag name')
      return
    }

    const createResult = await createTag({ tag_name: tagName, color: '#1A56DB' })
    if ('error' in createResult) {
      toast.error(createResult.error ?? 'Failed to create tag')
      return
    }

    const newTag = createResult.tag
    // Optimistic add
    setLocalTags((prev) => [
      ...prev,
      { tag_id: newTag.tag_id, tag_name: newTag.tag_name, color: newTag.color },
    ])

    const addResult = await addTagToEntry(entryId, newTag.tag_id)
    if ('error' in addResult) {
      setLocalTags((prev) => prev.filter((t) => t.tag_id !== newTag.tag_id))
      toast.error(addResult.error ?? 'Failed to add tag')
    }
  }

  const handleSelectItem = useCallback(
    async (index: number) => {
      const item = dropdownItems[index]
      if (!item) return
      if (item.type === 'existing') {
        await selectExistingTag(item.tag)
      } else {
        await handleCreate()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropdownItems],
  )

  async function handleRemoveTag(tagId: string) {
    const removed = localTags.find((t) => t.tag_id === tagId)
    if (!removed) return

    // Optimistic remove
    setLocalTags((prev) => prev.filter((t) => t.tag_id !== tagId))

    const result = await removeTagFromEntry(entryId, tagId)
    if ('error' in result) {
      setLocalTags((prev) => [...prev, removed])
      toast.error(result.error ?? 'Failed to remove tag')
    }
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setDropdownOpen(false)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, dropdownItems.length - 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, -1))
      return
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (dropdownOpen && highlightedIndex >= 0) {
        await handleSelectItem(highlightedIndex)
      } else if (!dropdownOpen || dropdownItems.length === 0) {
        // Auto-format and create
        const formatted = autoFormat(inputValue.trim())
        if (!formatted) return
        setInputValue(formatted)
        await handleCreate()
      } else if (dropdownItems.length > 0) {
        // Select first item
        await handleSelectItem(0)
      }
      return
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Tag chips row */}
      {localTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {localTags.map((tag) => (
            <TagChip
              key={tag.tag_id}
              tagName={tag.tag_name}
              color={tag.color}
              size="md"
              onRemove={() => handleRemoveTag(tag.tag_id)}
            />
          ))}
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (inputValue.trim() && autocompleteResults.length > 0) setDropdownOpen(true)
        }}
        placeholder="Add a tag…"
        className="text-sm bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none border-b border-transparent focus:border-[var(--border)] transition-colors w-full pb-0.5"
      />

      {/* Dropdown */}
      {dropdownOpen && dropdownItems.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-lg py-1 max-h-48 overflow-y-auto">
          {dropdownItems.map((item, i) => {
            const isHighlighted = i === highlightedIndex
            if (item.type === 'existing') {
              const { tag } = item
              return (
                <button
                  key={tag.tag_id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectExistingTag(tag)
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    isHighlighted ? 'bg-[var(--bg-muted)]' : 'hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="text-[var(--text-primary)] truncate">{tag.tag_name}</span>
                </button>
              )
            }
            return (
              <button
                key="create"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleCreate()
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm transition-colors text-[#1976D2] ${
                  isHighlighted ? 'bg-[var(--bg-muted)]' : 'hover:bg-[var(--bg-muted)]'
                }`}
              >
                <Plus size={14} />
                <span>
                  Create &ldquo;{autoFormat(inputValue.trim()) || inputValue.trim()}&rdquo;
                </span>
              </button>
            )
          })}
          {isFetching && (
            <p className="px-3 py-1.5 text-xs text-[var(--text-muted)]">Loading…</p>
          )}
        </div>
      )}
    </div>
  )
}
