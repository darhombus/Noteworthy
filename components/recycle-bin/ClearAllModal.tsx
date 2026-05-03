'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export default function ClearAllModal({ onConfirm, onCancel }: Props) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const isValid = input === 'CLEAR ALL'

  async function handleConfirm() {
    if (!isValid) return
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md rounded-xl border border-[#E0E0E0] bg-white shadow-lg dark:border-[#3A3A3A] dark:bg-[#1E1E1E]">
        <div className="flex items-start justify-between p-6">
          <h2 className="text-lg font-semibold text-[#212121] dark:text-[#F5F5F5]">
            Clear recycle bin
          </h2>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-[#757575] hover:bg-[#F5F5F5] dark:text-[#9E9E9E] dark:hover:bg-[#2C2C2C]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6">
          <p className="mb-4 text-sm text-[#757575] dark:text-[#9E9E9E]">
            This will permanently delete everything in the recycle bin. This cannot be undone.
          </p>
          <p className="mb-2 text-sm font-medium text-[#212121] dark:text-[#F5F5F5]">
            Type <span className="font-mono font-bold">CLEAR ALL</span> to confirm:
          </p>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="CLEAR ALL"
            className="mb-6 w-full rounded-lg border border-[#E0E0E0] bg-[#FAFAFA] px-3 py-2 text-sm text-[#212121] placeholder:text-[#9E9E9E] focus:border-[#1976D2] focus:outline-none dark:border-[#3A3A3A] dark:bg-[#121212] dark:text-[#F5F5F5] dark:placeholder:text-[#757575]"
          />

          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-[#E0E0E0] px-4 py-2 text-sm font-medium text-[#212121] hover:bg-[#F5F5F5] dark:border-[#3A3A3A] dark:text-[#F5F5F5] dark:hover:bg-[#2C2C2C]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid || loading}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Clearing…' : 'Clear all'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
