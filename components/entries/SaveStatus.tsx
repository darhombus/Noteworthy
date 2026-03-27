'use client'

import type { SaveStatus } from '@/hooks/useAutoSave'

interface SaveStatusProps {
  status: SaveStatus
  onSaveNow?: () => void
}

export default function SaveStatus({ status, onSaveNow }: SaveStatusProps) {
  if (status === 'idle') return null

  return (
    <div className="flex items-center gap-2 text-sm">
      {status === 'pending' && (
        <>
          <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-slate-500 shrink-0" />
          <span className="text-gray-500 dark:text-slate-400">Unsaved changes…</span>
        </>
      )}

      {status === 'saving' && (
        <>
          <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-gray-500 dark:text-slate-400">Saving…</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <span className="text-green-600 dark:text-green-400">Saved</span>
        </>
      )}

      {status === 'error' && (
        <>
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="text-red-600 dark:text-red-400">Save failed</span>
          {onSaveNow && (
            <button
              onClick={onSaveNow}
              className="text-[var(--brand)] hover:underline font-medium"
            >
              Save now
            </button>
          )}
        </>
      )}
    </div>
  )
}
