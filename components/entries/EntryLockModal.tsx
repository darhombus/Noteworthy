'use client'

import { X, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import EntryLockPanel, { type LockType } from '@/components/lock/EntryLockPanel'

interface EntryLockModalProps {
  entryId: string
  journalId: string
  /** Whether THIS entry participates in the journal's shared entry lock. */
  entryLockType: LockType
  /** The journal's shared entry-lock config (applies to every locked entry). */
  journalEntryLockType: LockType
  onClose: () => void
}

/**
 * Dialog wrapper around EntryLockPanel so the entry-lock flow can be
 * launched from the entry card's overflow menu instead of only from inside
 * the editor. Mirrors how JournalModal hosts JournalLockPanel.
 */
export default function EntryLockModal({
  entryId,
  journalId,
  entryLockType,
  journalEntryLockType,
  onClose,
}: EntryLockModalProps) {
  const router = useRouter()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="custom-scrollbar bg-[var(--bg-surface)] rounded-[20px] w-full max-w-[440px] overflow-hidden font-[Inter,sans-serif] max-h-[90vh] overflow-y-auto border border-[var(--border)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-[22px] pb-[18px] border-b border-[var(--border)]">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-[10px] shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1976D2, #1565C0)',
              boxShadow: '0 4px 10px rgba(25,118,210,0.3)',
            }}
          >
            <ShieldCheck size={17} color="#fff" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-base font-bold text-[var(--text-primary)] leading-tight"
              style={{ letterSpacing: '-0.3px' }}
            >
              Entry Lock
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Manage this entry&apos;s lock using the journal&apos;s shared secret.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] hover:bg-[#E0E0E0] dark:hover:bg-[#3A3A3A] transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={14} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <EntryLockPanel
            entryId={entryId}
            journalId={journalId}
            entryLockType={entryLockType}
            journalEntryLockType={journalEntryLockType}
            onClose={onClose}
            onApplied={() => {
              // The panel already toasted. Just refresh so the card and any
              // downstream pages (editor, search results) pick up the new
              // lock state.
              onClose()
              router.refresh()
            }}
          />
        </div>
      </div>
    </div>
  )
}
