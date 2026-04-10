'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import ExportModal from '@/components/ExportModal'

export default function DownloadAllButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
      >
        <Download className="w-4 h-4" />
        Download all my data
      </button>

      {open && <ExportModal scope="all" onClose={() => setOpen(false)} />}
    </>
  )
}
