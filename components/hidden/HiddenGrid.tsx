'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, ShieldOff, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useUIStore } from '@/store/useUIStore'
import { lockVault } from '@/lib/actions/vault'
import JournalCard from '@/components/journals/JournalCard'
import JournalModal from '@/components/journals/JournalModal'
import DeleteJournalModal from '@/components/journals/DeleteJournalModal'
import JournalSortSelector, {
  applyJournalSort,
  readPersistedSort,
  type JournalSortOption,
} from '@/components/journals/JournalSortSelector'
import ExportModal from '@/components/ExportModal'
import SystemJournalCard from './SystemJournalCard'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

const STORAGE_KEY = 'noteworthy:hiddenJournalSort'

interface Props {
  hiddenJournals: Journal[]
  /** True when at least one entry exists with entry.is_hidden=true and
   *  parent_journal.is_hidden=false. Drives the SystemJournalCard render. */
  hasStandaloneHiddenEntries: boolean
  /** Count of standalone hidden entries — surfaces on the system card so
   *  the figure matches what /hidden/standalone shows when clicked. */
  standaloneHiddenEntryCount: number
}

export default function HiddenGrid({
  hiddenJournals,
  hasStandaloneHiddenEntries,
  standaloneHiddenEntryCount,
}: Props) {
  const router = useRouter()
  // Default to 'updated' — the same first-paint behaviour as the public
  // grid. The spec said "default favourites first", but in this codebase
  // 'favourites' is a filter (it hides non-favourites entirely), so making
  // it the default would silently hide hidden journals on a fresh visit.
  // Users land on 'updated' and pick favourites explicitly when they want
  // to filter. Persisted preference (anything other than the filter)
  // wins on subsequent loads.
  const [sort, setSort] = useState<JournalSortOption>(
    () => readPersistedSort(STORAGE_KEY) ?? 'updated',
  )
  const [editJournal, setEditJournal] = useState<Journal | null>(null)
  const [deleteJournal, setDeleteJournal] = useState<Journal | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [pending, startTransition] = useTransition()
  const { createHiddenJournalOpen, setCreateHiddenJournalOpen } = useUIStore()

  const sorted = useMemo(
    () => applyJournalSort(hiddenJournals, sort),
    [hiddenJournals, sort],
  )

  // Render the synthetic SystemJournalCard pinned to the top-left of the
  // grid (excluded from the sort) when there's anything to surface, then
  // the user's hidden journals in the chosen order. Hidden under the
  // 'favourites' filter — the system card has no favourite affordance, so
  // including it under that filter would contradict the filter's promise.
  const showSystemCard = hasStandaloneHiddenEntries && sort !== 'favourites'
  const isEmpty =
    sorted.length === 0 && !showSystemCard && !hasStandaloneHiddenEntries
  const isFavouritesEmpty =
    sort === 'favourites' &&
    sorted.length === 0 &&
    (hiddenJournals.length > 0 || hasStandaloneHiddenEntries)

  function handleLock() {
    startTransition(async () => {
      await lockVault()
      toast.success('Vault locked')
      // Locking from the Hidden surface bounces to the dashboard. The
      // navigation also triggers VaultAutoLock for symmetry, but the
      // explicit push gives instant feedback rather than waiting for
      // the route change to fire the auto-lock side-effect.
      router.push('/dashboard')
    })
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header — title block stretched to match the height of the
          right-side two-row stack (Export+Lock above, Sort selector
          below). The title aligns with the top row and the subtitle
          drops to align with the bottom row, with the bigger type sized
          to fill the gap so the column reads as one block rather than a
          compact heading floating beside the controls. */}
      <div className="flex items-stretch justify-between gap-4 flex-wrap mb-6">
        {/* Bottom-anchor the title block so the subtitle stays aligned
            with the sort selector and the heading sits just above it
            (instead of stretching all the way to the top of the row,
            which leaves the title floating high above the controls). */}
        <div className="flex flex-col justify-end gap-2">
          <h1 className="text-[38px] font-bold text-[var(--text-primary)] leading-none">
            Hidden
          </h1>
          {/* leading-none on the subtitle so its baseline lands at the
              very bottom of the row, matching the sort selector's
              bottom edge — without it the line-box adds extra descent
              that makes the gap below the title section look bigger
              than the gap below the sort row. */}
          <p className="text-base text-[var(--text-secondary)] leading-none">
            {hiddenJournals.length}{' '}
            {sort === 'favourites' ? 'favourite' : 'hidden'}{' '}
            {hiddenJournals.length === 1 ? 'journal' : 'journals'}
            {showSystemCard && (
              <>
                {' · '}
                {standaloneHiddenEntryCount}{' '}
                standalone {standaloneHiddenEntryCount === 1 ? 'entry' : 'entries'}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Vault commands — Export + Lock — read as a unit on the top
              row, distinct from the sort filter directly below. */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={handleLock}
              disabled={pending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors disabled:opacity-50"
            >
              <ShieldOff size={14} />
              <span className="hidden sm:inline">{pending ? 'Locking…' : 'Lock vault'}</span>
            </button>
          </div>

          <JournalSortSelector value={sort} onChange={setSort} storageKey={STORAGE_KEY} />
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <EyeOff className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A] mb-4" />
          <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">
            Nothing hidden
          </h2>
          <p className="text-sm text-[var(--text-muted)] max-w-sm">
            Hidden journals and entries will appear here.
          </p>
        </div>
      ) : isFavouritesEmpty && !showSystemCard ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <EyeOff className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A] mb-4" />
          <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">
            No favourite hidden journals
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Star a hidden journal to find it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {showSystemCard && (
            <SystemJournalCard entryCount={standaloneHiddenEntryCount} />
          )}
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

      {createHiddenJournalOpen && (
        <JournalModal
          defaultHidden
          onClose={() => setCreateHiddenJournalOpen(false)}
          onSuccess={() => setCreateHiddenJournalOpen(false)}
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
      {showExportModal && (
        <ExportModal scope="all" onClose={() => setShowExportModal(false)} />
      )}
    </div>
  )
}
