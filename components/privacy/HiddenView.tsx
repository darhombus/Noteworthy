'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, BookOpen, FileText, ShieldOff, Download } from 'lucide-react'
import { toast } from 'sonner'
import JournalCard from '@/components/journals/JournalCard'
import JournalModal from '@/components/journals/JournalModal'
import DeleteJournalModal from '@/components/journals/DeleteJournalModal'
import EntryCard from '@/components/entries/EntryCard'
import DeleteEntryModal from '@/components/entries/DeleteEntryModal'
import ExportModal from '@/components/ExportModal'
import { lockVault } from '@/lib/actions/vault'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']
type Entry = Database['public']['Tables']['entries']['Row']

interface EntryTag {
  tag_id: string
  tag_name: string
  color: string
}

type Tab = 'journals' | 'entries'

interface Props {
  journals: Journal[]
  standaloneEntries: Array<Entry & { parentJournalColor: string; tags: EntryTag[] }>
}

export default function HiddenView({ journals, standaloneEntries }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('journals')
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null)
  const [editJournal, setEditJournal] = useState<Journal | null>(null)
  const [deleteJournal, setDeleteJournal] = useState<Journal | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleLock() {
    startTransition(async () => {
      await lockVault()
      toast.success('Vault locked')
      // Per spec, locking from the Hidden dashboard navigates back to the
      // public journal list. The auto-lock effect would catch this
      // navigation anyway, but the explicit push gives immediate feedback.
      router.push('/journals')
    })
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Hidden</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Journals and entries you&apos;ve hidden from the main app.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Download size={14} />
            Export hidden data
          </button>
          <button
            onClick={handleLock}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors disabled:opacity-50"
          >
            <ShieldOff size={14} />
            {pending ? 'Locking…' : 'Lock vault'}
          </button>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        <TabButton active={tab === 'journals'} onClick={() => setTab('journals')}>
          <BookOpen size={14} /> Journals
          <span className="text-xs text-[var(--text-muted)]">({journals.length})</span>
        </TabButton>
        <TabButton active={tab === 'entries'} onClick={() => setTab('entries')}>
          <FileText size={14} /> Entries
          <span className="text-xs text-[var(--text-muted)]">({standaloneEntries.length})</span>
        </TabButton>
      </div>

      {tab === 'journals' && (
        journals.length === 0 ? (
          <EmptyState
            icon={<Lock className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A]" />}
            heading="No hidden journals"
            body="Use the meatball menu on a journal card to hide it. Hidden journals appear here only."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {journals.map((j) => (
              <JournalCard
                key={j.journal_id}
                journal={j}
                onEdit={() => setEditJournal(j)}
                onDelete={() => setDeleteJournal(j)}
              />
            ))}
          </div>
        )
      )}

      {tab === 'entries' && (
        standaloneEntries.length === 0 ? (
          <EmptyState
            icon={<Lock className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A]" />}
            heading="No standalone hidden entries"
            body="Hide an individual entry inside a public journal and it'll show up here."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {standaloneEntries.map((entry) => (
              <EntryCard
                key={entry.entry_id}
                entry={entry}
                journalId={entry.journal_id}
                accentColor={entry.parentJournalColor ?? '#1976D2'}
                isLatest={false}
                onDelete={setDeleteTarget}
                tags={entry.tags}
                parentJournalIsHidden={false}
              />
            ))}
          </div>
        )
      )}

      {deleteTarget && (
        <DeleteEntryModal
          entryId={deleteTarget.entry_id}
          journalId={deleteTarget.journal_id}
          parentJournalIsHidden={false}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* Journal edit / delete modals — mirror JournalGrid wiring so the
          meatball menu's Edit and Delete options on a hidden JournalCard
          actually do something. JournalModal stays under the SurfaceProvider
          so writes go through the hidden surface code paths where relevant. */}
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

      {/* HiddenView is mounted under /hidden/layout.tsx's SurfaceProvider
          (value="hidden"), so ExportModal reads useSurface()='hidden' and
          forwards surface=hidden to /api/export. */}
      {showExportModal && (
        <ExportModal scope="all" onClose={() => setShowExportModal(false)} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-[#1976D2] text-[#1976D2]'
          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState({
  icon,
  heading,
  body,
}: {
  icon: React.ReactNode
  heading: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4">{icon}</div>
      <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">{heading}</h2>
      <p className="text-sm text-[var(--text-muted)] max-w-sm">{body}</p>
    </div>
  )
}
