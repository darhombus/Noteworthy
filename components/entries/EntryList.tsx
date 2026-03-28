'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PenLine, BookOpen, Loader2, Calendar } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { createEntry } from '@/lib/actions/entries'
import { getColorBg } from '@/lib/validations/journals'
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
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const accent = journal.color ?? '#1976D2'
  const emojiBg = isDark ? `${accent}25` : getColorBg(accent)

  const lastUpdated = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

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
                  className="text-[22px] font-bold text-[#212121] dark:text-[#F5F5F5] truncate"
                  style={{ letterSpacing: '-0.4px' }}
                >
                  {journal.title}
                </h1>
                {journal.description && (
                  <p className="text-[13px] text-[#9E9E9E] dark:text-[#757575] mt-0.5">
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
              <span
                className="flex items-center gap-1.5 px-[14px] py-[5px] rounded-full text-xs bg-white dark:bg-[#1E1E1E] border border-[#E0E0E0] dark:border-[#3A3A3A] text-[#212121] dark:text-[#F5F5F5]"
              >
                <BookOpen size={11} />
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
              <span className="flex items-center gap-1.5 px-[14px] py-[5px] rounded-full text-xs bg-white dark:bg-[#1E1E1E] border border-[#E0E0E0] dark:border-[#3A3A3A] text-[#212121] dark:text-[#F5F5F5]">
                <Calendar size={11} />
                {lastUpdated}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Entries section */}
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-base font-bold text-[#212121] dark:text-[#F5F5F5]"
          style={{ letterSpacing: '-0.2px' }}
        >
          All Entries
        </h2>
        <span className="text-xs text-[#9E9E9E] dark:text-[#757575]">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* List or empty state */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A] mb-4" />
          <h2 className="text-lg font-medium text-[#757575] dark:text-[#9E9E9E] mb-1">
            No entries yet
          </h2>
          <p className="text-sm text-[#9E9E9E] dark:text-[#757575] mb-6">
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
