'use client'

import { useState, useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import type { Database } from '@/types/supabase'
import JournalCard from './JournalCard'
import JournalModal from './JournalModal'
import DeleteJournalModal from './DeleteJournalModal'

type Journal = Database['public']['Tables']['journals']['Row']
type SortOption = 'favourites' | 'az' | 'newest' | 'updated'

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'favourites', label: 'Favourites first' },
  { value: 'az', label: 'A–Z' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Last updated' },
]

function sortJournals(journals: Journal[], sort: SortOption): Journal[] {
  return [...journals].sort((a, b) => {
    switch (sort) {
      case 'favourites':
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
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
  const [sort, setSort] = useState<SortOption>('favourites')
  const [editJournal, setEditJournal] = useState<Journal | null>(null)
  const [deleteJournal, setDeleteJournal] = useState<Journal | null>(null)
  const { createJournalOpen, setCreateJournalOpen } = useUIStore()

  const sorted = useMemo(() => sortJournals(journals, sort), [journals, sort])

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Journals</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {journals.length} journal{journals.length !== 1 ? 's' : ''}
          </p>
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {sorted.length === 0 ? (
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
