'use client'

import { Star, ArrowDownAZ, Clock, RefreshCw } from 'lucide-react'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

export type JournalSortOption = 'updated' | 'newest' | 'favourites' | 'az'

const SORT_OPTIONS: { value: JournalSortOption; label: string; icon: React.ReactNode }[] = [
  { value: 'updated', label: 'Updated', icon: <RefreshCw size={12} /> },
  { value: 'newest', label: 'Newest', icon: <Clock size={12} /> },
  { value: 'favourites', label: 'Favourites', icon: <Star size={12} /> },
  { value: 'az', label: 'A–Z', icon: <ArrowDownAZ size={12} /> },
]

/** Apply the user's sort selection to a list of journals. 'favourites' is
 *  a filter, not a sort — it returns only favourited journals, ordered by
 *  most-recently updated. */
export function applyJournalSort(
  journals: Journal[],
  sort: JournalSortOption,
): Journal[] {
  if (sort === 'favourites') {
    return journals
      .filter((j) => j.is_favorite)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }
  return [...journals].sort((a, b) => {
    switch (sort) {
      case 'az':
        return a.title.localeCompare(b.title)
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'updated':
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    }
  })
}

interface JournalSortSelectorProps {
  value: JournalSortOption
  onChange: (next: JournalSortOption) => void
  /** localStorage key. Pass distinct keys per surface (public vs. hidden)
   *  so the two grids remember independent preferences. Pass null to opt
   *  out of persistence — useful for screens that derive their sort from
   *  another source. */
  storageKey?: string | null
}

/** Restore a persisted sort preference. 'favourites' is a filter the user
 *  is unlikely to want to land on after a refresh, so we skip it. */
export function readPersistedSort(
  storageKey: string,
): JournalSortOption | null {
  if (typeof window === 'undefined') return null
  const saved = window.localStorage.getItem(storageKey) as JournalSortOption | null
  if (
    saved &&
    saved !== 'favourites' &&
    SORT_OPTIONS.some((o) => o.value === saved)
  ) {
    return saved
  }
  return null
}

export default function JournalSortSelector({
  value,
  onChange,
  storageKey,
}: JournalSortSelectorProps) {
  // Persisted sort is restored by the consumer via a lazy useState
  // initializer + readPersistedSort() — no mount effect here. That avoids
  // the "setState in useEffect" anti-pattern (which the consumer would
  // hit if we called onChange from inside our own effect) and keeps the
  // first paint already showing the restored sort instead of flashing
  // the default value for one frame.

  function handle(next: JournalSortOption) {
    onChange(next)
    if (!storageKey) return
    if (next === 'favourites') {
      window.localStorage.removeItem(storageKey)
    } else {
      window.localStorage.setItem(storageKey, next)
    }
  }

  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl">
      {SORT_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => handle(o.value)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all ${
            value === o.value
              ? 'bg-[var(--bg-surface)] text-[#1976D2] shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
          aria-pressed={value === o.value}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
