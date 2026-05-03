'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { softDeleteEntry } from '@/lib/actions/entries'
import { useSurface } from '@/lib/surface'
import { journalHref, journalListHref } from '@/lib/utils/href'

interface DeleteEntryModalProps {
  entryId: string
  journalId: string
  /** True when the parent journal itself is hidden. Used in the hidden
   *  surface to decide whether to redirect to /hidden/<jid> (nested) or
   *  /hidden (standalone — parent is public). Ignored on the public
   *  surface. Defaults to true so existing call sites in the public
   *  surface keep their /journals/<jid> redirect. */
  parentJournalIsHidden?: boolean
  onClose: () => void
}

export default function DeleteEntryModal({
  entryId,
  journalId,
  parentJournalIsHidden = true,
  onClose,
}: DeleteEntryModalProps) {
  const router = useRouter()
  const surface = useSurface()
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDelete() {
    setIsDeleting(true)

    const result = await softDeleteEntry(entryId, journalId)
    if ('error' in result) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }
    onClose()
    toast.success('Entry moved to recycle bin')
    if (surface === 'hidden' && !parentJournalIsHidden) {
      router.push(journalListHref('hidden'))
      return
    }
    router.push(journalHref(surface, journalId))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-xl w-full max-w-sm border border-[var(--border)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-gray-900 dark:text-white">Delete Entry</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-slate-300">
              This entry will be moved to the recycle bin and can be restored later.
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
