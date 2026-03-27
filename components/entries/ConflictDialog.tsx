'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConflictDialogProps {
  onKeepMine: () => Promise<void>
  onDiscard: () => void
}

export default function ConflictDialog({ onKeepMine, onDiscard }: ConflictDialogProps) {
  const [isSaving, setIsSaving] = useState(false)

  async function handleKeepMine() {
    setIsSaving(true)
    await onKeepMine()
    setIsSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm border border-[#E5E7EB] dark:border-slate-700">
        <div className="px-6 py-4 border-b border-[#E5E7EB] dark:border-slate-700 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Editing conflict</h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            This entry was edited elsewhere. What would you like to do?
          </p>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            Discard and reload
          </button>
          <button
            onClick={handleKeepMine}
            disabled={isSaving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[var(--brand)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving…' : 'Keep my changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
