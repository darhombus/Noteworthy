'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pin, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { togglePin } from '@/lib/actions/entries'
import type { Database } from '@/types/supabase'
import ReadOnlyPreview from '@/components/editor/ReadOnlyPreview'

type Entry = Database['public']['Tables']['entries']['Row']

interface EntryCardProps {
  entry: Entry
  journalId: string
  onDelete: (entry: Entry) => void
}

export default function EntryCard({ entry, journalId, onDelete }: EntryCardProps) {
  const router = useRouter()
  const [isPinned, setIsPinned] = useState(entry.is_pinned)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  async function handlePinToggle(e: React.MouseEvent) {
    e.stopPropagation()
    const prev = isPinned
    setIsPinned(!prev)
    const result = await togglePin(entry.entry_id, prev)
    if ('error' in result) {
      setIsPinned(prev)
      toast.error('Failed to update pin')
    }
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${entry.entry_date}T00:00:00`))

  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-[#E5E7EB] dark:border-slate-700 p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => router.push(`/journals/${journalId}/entries/${entry.entry_id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {entry.title || 'Untitled'}
          </h3>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formattedDate}</p>
        </div>

        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handlePinToggle}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label={isPinned ? 'Unpin entry' : 'Pin entry'}
          >
            <Pin
              className={`w-4 h-4 transition-colors ${
                isPinned
                  ? 'fill-[var(--brand)] text-[var(--brand)]'
                  : 'text-gray-400 dark:text-slate-500'
              }`}
            />
          </button>

          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    router.push(`/journals/${journalId}/entries/${entry.entry_id}`)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(entry)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <ReadOnlyPreview content={entry.content as string} maxChars={120} />
      </div>

      <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
        {entry.word_count} {entry.word_count === 1 ? 'word' : 'words'}
      </p>
    </div>
  )
}
