'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { mergeTags } from '@/lib/actions/tags'

interface TagOption {
  tag_id: string
  tag_name: string
  color: string
}

interface MergeTagModalProps {
  sourceTag: {
    tag_id: string
    tag_name: string
    color: string
    usage_count: number
  }
  allTags: TagOption[]
  onClose: () => void
  onSuccess: () => void
}

export default function MergeTagModal({
  sourceTag,
  allTags,
  onClose,
  onSuccess,
}: MergeTagModalProps) {
  const [destinationId, setDestinationId] = useState('')
  const [isMerging, setIsMerging] = useState(false)

  const destination = allTags.find((t) => t.tag_id === destinationId)

  async function handleMerge() {
    if (!destinationId) return
    setIsMerging(true)
    const result = await mergeTags(sourceTag.tag_id, destinationId)
    setIsMerging(false)
    if ('error' in result) {
      toast.error(result.error ?? 'Failed to merge tags')
      return
    }
    toast.success(`Merged "${sourceTag.tag_name}" into "${destination?.tag_name}"`)
    onSuccess()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Card */}
      <div className="relative w-full max-w-md bg-[var(--bg-surface)] rounded-xl shadow-2xl border border-[var(--border)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2
            id="merge-modal-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Merge Tag
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Merge{' '}
          <span className="font-medium text-[var(--text-primary)]">
            &ldquo;{sourceTag.tag_name}&rdquo;
          </span>{' '}
          into:
        </p>

        {/* Destination select */}
        <div className="relative mb-4">
          <select
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1976D2] appearance-none"
          >
            <option value="">Select a tag…</option>
            {allTags.map((tag) => (
              <option key={tag.tag_id} value={tag.tag_id}>
                {tag.tag_name}
              </option>
            ))}
          </select>
        </div>

        {/* Warning callout */}
        {destinationId && destination && (
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 mb-5">
            <AlertTriangle
              size={16}
              className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5"
            />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              All{' '}
              <span className="font-medium">{sourceTag.usage_count}</span>{' '}
              {sourceTag.usage_count === 1 ? 'entry' : 'entries'} tagged{' '}
              &ldquo;{sourceTag.tag_name}&rdquo; will be retagged &ldquo;
              {destination.tag_name}&rdquo;. The tag &ldquo;{sourceTag.tag_name}&rdquo; will be
              permanently deleted.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={!destinationId || isMerging}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-[#1976D2] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMerging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}
