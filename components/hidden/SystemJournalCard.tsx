'use client'

import { useRouter } from 'next/navigation'
import { Calendar, FileStack } from 'lucide-react'

interface Props {
  /** Number of standalone hidden entries the card represents. Drives the
   *  "N entries" pill so the figure stays in sync with what the standalone
   *  page actually shows. */
  entryCount: number
}

/** Synthetic journal card surfaced on the Hidden grid when the user has
 *  any standalone hidden entries (entry.is_hidden=true with a public
 *  parent journal). Pinned to the top-left of the grid; click navigates
 *  to /hidden/standalone where those entries are listed.
 *
 *  Visually distinct from JournalCard: neutral slate accent (no journal
 *  colour), file-stack icon, no favourite/menu — there's nothing to
 *  edit or delete on a virtual aggregation. */
export default function SystemJournalCard({ entryCount }: Props) {
  const router = useRouter()

  return (
    <div
      onClick={() => router.push('/hidden/standalone')}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push('/hidden/standalone')
        }
      }}
      className="relative bg-[var(--bg-surface)] rounded-[14px] overflow-hidden cursor-pointer border border-[var(--border)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]"
    >
      {/* Neutral slate strip — replaces the per-journal colour bar so the
          system card is recognisably "not a real journal" at a glance. */}
      <div className="h-1 bg-gray-400 dark:bg-slate-500" />

      <div className="px-5 pt-5 pb-[18px]">
        <div className="flex items-start gap-3.5 mb-4">
          <div className="shrink-0 flex items-center justify-center w-[52px] h-[52px] rounded-xl bg-gray-100 dark:bg-slate-700/50">
            <FileStack
              size={26}
              className="text-gray-500 dark:text-slate-300"
              aria-hidden
            />
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h3
              className="text-[15px] font-bold text-[var(--text-primary)] truncate"
              style={{ letterSpacing: '-0.3px' }}
            >
              Hidden Entries
            </h3>
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
              Standalone entries you&apos;ve hidden
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-[10px] py-0.5 rounded-full text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700/50">
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Calendar size={11} />
            System journal
          </span>
        </div>
      </div>
    </div>
  )
}
