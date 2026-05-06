'use client'

import { useState, useMemo } from 'react'
import { BookOpen, Star } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import type { Database } from '@/types/supabase'
import JournalCard from './JournalCard'
import JournalModal from './JournalModal'
import DeleteJournalModal from './DeleteJournalModal'
import JournalSortSelector, {
  applyJournalSort,
  readPersistedSort,
  type JournalSortOption,
} from './JournalSortSelector'

type Journal = Database['public']['Tables']['journals']['Row']

const STORAGE_KEY = 'noteworthy:journalSort'

interface JournalGridProps {
  journals: Journal[]
}

export default function JournalGrid({ journals }: JournalGridProps) {
  const [sort, setSort] = useState<JournalSortOption>(
    () => readPersistedSort(STORAGE_KEY) ?? 'updated',
  )
  const [editJournal, setEditJournal] = useState<Journal | null>(null)
  const [deleteJournal, setDeleteJournal] = useState<Journal | null>(null)
  const { createJournalOpen, setCreateJournalOpen } = useUIStore()

  const sorted = useMemo(() => applyJournalSort(journals, sort), [journals, sort])

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

        <JournalSortSelector value={sort} onChange={setSort} storageKey={STORAGE_KEY} />
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
