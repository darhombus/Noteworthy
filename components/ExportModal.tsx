'use client'

import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useSurface } from '@/lib/surface'

interface ExportModalProps {
  scope: 'entry' | 'journal' | 'all'
  entryId?: string
  journalId?: string
  onClose: () => void
}

export default function ExportModal({ scope, entryId, journalId, onClose }: ExportModalProps) {
  // Surface is read from context. Callers under /hidden/** automatically
  // export hidden data; callers under /journals/** or /settings stay public.
  // The /api/export route validates the vault when surface=hidden.
  const surface = useSurface()
  const [format, setFormat] = useState<'json' | 'markdown'>('markdown')
  const [includeTags, setIncludeTags] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const showDateRange = scope === 'journal' || scope === 'all'

  async function handleExport() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ format, scope, surface })
      if (entryId) params.set('entryId', entryId)
      if (journalId) params.set('journalId', journalId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('includeTags', includeTags ? 'true' : 'false')

      const res = await fetch(`/api/export?${params.toString()}`)

      if (!res.ok) {
        let message = 'Export failed'
        try {
          const body = (await res.json()) as { error?: string }
          if (body.error) message = body.error
        } catch {
          // ignore parse error
        }
        toast.error(message)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="([^"]+)"/)
      a.download = match?.[1] ?? `noteworthy-export.${format === 'json' ? 'json' : 'md'}`

      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      onClose()
    } catch {
      toast.error('Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onMouseDown={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-[var(--bg-surface)] border border-[#E0E0E0] dark:border-[#3A3A3A] shadow-lg p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Export</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[var(--text-primary)]">Format</legend>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="export-format"
              value="markdown"
              checked={format === 'markdown'}
              onChange={() => setFormat('markdown')}
              className="accent-[#1976D2]"
            />
            <span className="text-sm text-[var(--text-primary)]">Markdown (.md)</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              name="export-format"
              value="json"
              checked={format === 'json'}
              onChange={() => setFormat('json')}
              className="accent-[#1976D2]"
            />
            <span className="text-sm text-[var(--text-primary)]">JSON (.json)</span>
          </label>
        </fieldset>

        {/* Include tags */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTags}
            onChange={(e) => setIncludeTags(e.target.checked)}
            className="accent-[#1976D2] w-4 h-4 rounded"
          />
          <span className="text-sm text-[var(--text-primary)]">Include tags</span>
        </label>

        {/* Date range — only for journal / all scope */}
        {showDateRange && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Date range (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-secondary)]">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to || undefined}
                  className="w-full text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-secondary)]">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  min={from || undefined}
                  className="w-full text-sm rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-[#1976D2] text-white hover:bg-[#1565C0] disabled:opacity-60 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {loading ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
