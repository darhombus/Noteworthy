'use client'

import { useState, useMemo, useEffect } from 'react'
import { BookOpen, Star, ArrowDownAZ, Clock, RefreshCw } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import type { Database } from '@/types/supabase'
import JournalCard from './JournalCard'
import JournalModal from './JournalModal'
import DeleteJournalModal from './DeleteJournalModal'

type Journal = Database['public']['Tables']['journals']['Row']
type SortOption = 'updated' | 'newest' | 'favourites' | 'az'

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ReactNode }[] = [
  { value: 'updated', label: 'Updated', icon: <RefreshCw size={12} /> },
  { value: 'newest', label: 'Newest', icon: <Clock size={12} /> },
  { value: 'favourites', label: 'Favourites', icon: <Star size={12} /> },
  { value: 'az', label: 'A–Z', icon: <ArrowDownAZ size={12} /> },
]

const STORAGE_KEY = 'noteworthy:journalSort'

function applySort(journals: Journal[], sort: SortOption): Journal[] {
  // 'favourites' is a filter, not a sort — keep only favourited journals
  // and order them by most-recently updated.
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

interface JournalGridProps {
  journals: Journal[]
}

export default function JournalGrid({ journals }: JournalGridProps) {
  const [sort, setSort] = useState<SortOption>('updated')
  const [editJournal, setEditJournal] = useState<Journal | null>(null)
  const [deleteJournal, setDeleteJournal] = useState<Journal | null>(null)
  const { createJournalOpen, setCreateJournalOpen } = useUIStore()

  // Restore persisted sort preference on mount. 'favourites' is a filter,
  // not a sort the user likely wants to land on after a refresh, so we skip
  // restoring it and fall back to the 'updated' default.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as SortOption | null
    if (saved && saved !== 'favourites' && SORT_OPTIONS.some((o) => o.value === saved)) {
      setSort(saved)
    }
  }, [])

  function handleSort(value: SortOption) {
    setSort(value)
    if (value === 'favourites') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }

  const sorted = useMemo(() => applySort(journals, sort), [journals, sort])

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Journals</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {sorted.length} {sort === 'favourites' ? 'favourite' : 'journal'}
            {sorted.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sort toggle group */}
        <div className="flex items-center gap-0.5 p-0.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => handleSort(o.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all ${
                sort === o.value
                  ? 'bg-[var(--bg-surface)] text-[#1976D2] shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              aria-pressed={sort === o.value}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {sorted.length === 0 ? (
        sort === 'favourites' && journals.length > 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Star className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A] mb-4" />
            <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">
              No favourites yet
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Star a journal to find it here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookOpen className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A] mb-4" />
            <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">
              No journals yet
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Start organising your thoughts.
            </p>
            <button
              onClick={() => setCreateJournalOpen(true)}
              className="px-4 py-2 rounded-xl bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Create your first journal
            </button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((journal) => (
            <JournalCard
              key={journal.journal_id}
              journal={journal}
              onEdit={() => setEditJournal(journal)}
              onDelete={() => setDeleteJournal(journal)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {createJournalOpen && (
        <JournalModal
          onClose={() => setCreateJournalOpen(false)}
          onSuccess={() => setCreateJournalOpen(false)}
        />
      )}
      {editJournal && (
        <JournalModal
          journal={editJournal}
          onClose={() => setEditJournal(null)}
          onSuccess={() => setEditJournal(null)}
        />
      )}
      {deleteJournal && (
        <DeleteJournalModal
          journal={deleteJournal}
          onClose={() => setDeleteJournal(null)}
          onSuccess={() => setDeleteJournal(null)}
        />
      )}
    </div>
  )
}
