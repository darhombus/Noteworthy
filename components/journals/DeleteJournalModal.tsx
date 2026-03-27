'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { deleteJournal } from '@/lib/actions/journals'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

interface DeleteJournalModalProps {
  journal: Journal
  onClose: () => void
  onSuccess: () => void
}

export default function DeleteJournalModal({
  journal,
  onClose,
  onSuccess,
}: DeleteJournalModalProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    const result = await deleteJournal(journal.journal_id)
    if ('error' in result) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }
    toast.success('Journal moved to recycle bin')
    router.refresh()
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm border border-[#E5E7EB] dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-slate-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Delete Journal</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-slate-300">
              This will move{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {journal.entry_count} {journal.entry_count === 1 ? 'entry' : 'entries'}
              </span>{' '}
              to the recycle bin.
            </p>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Are you sure you want to delete{' '}
            <span className="font-medium text-gray-700 dark:text-slate-200">
              &ldquo;{journal.title}&rdquo;
            </span>
            ?
          </p>
        </div>

        {/* Actions */}
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
