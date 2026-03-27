'use client'

import { useState, useMemo } from 'react'
import { BookOpen, Plus } from 'lucide-react'
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
  const [createOpen, setCreateOpen] = useState(false)
  const [editJournal, setEditJournal] = useState<Journal | null>(null)
  const [deleteJournal, setDeleteJournal] = useState<Journal | null>(null)

  const sorted = useMemo(() => sortJournals(journals, sort), [journals, sort])

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Journals</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {journals.length} journal{journals.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="text-sm border border-[#E5E7EB] dark:border-slate-700 rounded-lg px-3 py-1.5 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Journal</span>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-slate-600 mb-4" />
          <h2 className="text-lg font-medium text-gray-700 dark:text-slate-300 mb-1">
            No journals yet
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            Start organising your thoughts.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="px-4 py-2 rounded-lg bg-[var(--brand)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Create your first journal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      {createOpen && (
        <JournalModal onClose={() => setCreateOpen(false)} onSuccess={() => setCreateOpen(false)} />
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
