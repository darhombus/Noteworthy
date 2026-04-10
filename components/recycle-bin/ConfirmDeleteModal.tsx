'use client'

import { X } from 'lucide-react'

interface Props {
  title: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDeleteModal({ title, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-[#E0E0E0] bg-white shadow-lg dark:border-[#3A3A3A] dark:bg-[#1E1E1E]">
        <div className="flex items-start justify-between p-6">
          <h2 className="text-lg font-semibold text-[#212121] dark:text-[#F5F5F5]">
            Permanently delete?
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
          <p className="mb-6 text-sm text-[#757575] dark:text-[#9E9E9E]">
            Permanently delete{' '}
            <span className="font-medium text-[#212121] dark:text-[#F5F5F5]">
              &ldquo;{title}&rdquo;
            </span>
            ? This cannot be undone.
          </p>

          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-[#E0E0E0] px-4 py-2 text-sm font-medium text-[#212121] hover:bg-[#F5F5F5] dark:border-[#3A3A3A] dark:text-[#F5F5F5] dark:hover:bg-[#2C2C2C]"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
