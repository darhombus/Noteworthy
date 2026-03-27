'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createEntry } from '@/lib/actions/entries'
import EntryCard from './EntryCard'
import DeleteEntryModal from './DeleteEntryModal'
import type { Database } from '@/types/supabase'

type Entry = Database['public']['Tables']['entries']['Row']
type Journal = Database['public']['Tables']['journals']['Row']

interface EntryListProps {
  journal: Journal
  entries: Entry[]
}

export default function EntryList({ journal, entries }: EntryListProps) {
  const router = useRouter()
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [isCreating, setIsCreating] = useState(false)

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

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{journal.title}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} ·{' '}
            {journal.total_word_count.toLocaleString()} words
          </p>
        </div>
        <button
          onClick={handleNewEntry}
          disabled={isCreating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{isCreating ? 'Creating…' : 'New Entry'}</span>
        </button>
      </div>

      {/* List or empty state */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 dark:text-slate-600 mb-4" />
          <h2 className="text-lg font-medium text-gray-700 dark:text-slate-300 mb-1">
            No entries yet
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            Start writing your first entry.
          </p>
          <button
            onClick={handleNewEntry}
            disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-70"
          >
            {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
            {isCreating ? 'Creating…' : 'Create your first entry'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <EntryCard
              key={entry.entry_id}
              entry={entry}
              journalId={journal.journal_id}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
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
