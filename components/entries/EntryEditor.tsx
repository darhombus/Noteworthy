'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pin, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { togglePin } from '@/lib/actions/entries'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import SaveStatus from './SaveStatus'
import ConflictDialog from './ConflictDialog'
import DeleteEntryModal from './DeleteEntryModal'
import JournalEditor from '@/components/editor/JournalEditor'
import type { JSONContent } from '@tiptap/core'
import type { Database } from '@/types/supabase'

type Entry = Database['public']['Tables']['entries']['Row']
type JournalMeta = Pick<
  Database['public']['Tables']['journals']['Row'],
  'journal_id' | 'title' | 'color'
>

interface EntryEditorProps {
  entry: Entry
  journal: JournalMeta
}

/**
 * Parse entry.content (JSONB — arrives as a parsed JS value from Supabase)
 * into a valid Tiptap JSONContent doc. Returns null if missing or invalid.
 * Any BlockNote-format content (no { type: 'doc' } root) is treated as null.
 */
function parseInitialContent(raw: unknown): JSONContent | null {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (
      typeof obj === 'object' &&
      obj !== null &&
      (obj as Record<string, unknown>).type === 'doc'
    ) {
      return obj as JSONContent
    }
    return null
  } catch {
    return null
  }
}

export default function EntryEditor({ entry, journal }: EntryEditorProps) {
  const router = useRouter()

  const [title, setTitle] = useState(entry.title ?? '')
  const [editorContent, setEditorContent] = useState<JSONContent | null>(
    () => parseInitialContent(entry.content),
  )
  const [entryDate, setEntryDate] = useState(entry.entry_date)
  const [isPinned, setIsPinned] = useState(entry.is_pinned)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Bundle all mutable fields into one save payload.
  // content is sent as JSONContent — the server action stores it as JSONB.
  const savePayload = useMemo(
    () => ({
      content: editorContent,
      title: title || undefined,
      entry_date: entryDate,
    }),
    [editorContent, title, entryDate],
  )

  // Bug 3 fix: stable callback identity so JournalEditor's useEffect dep doesn't flap
  const handleEditorChange = useCallback((content: JSONContent) => {
    setEditorContent(content)
  }, [])

  const { saveStatus, conflictDetected, dismissConflict, forceSave, saveNow } = useAutoSave({
    content: savePayload,
    entryId: entry.entry_id,
    serverUpdatedAt: entry.updated_at,
  })

  useBeforeUnload(saveStatus)

  async function handlePinToggle() {
    const prev = isPinned
    setIsPinned(!prev)
    const result = await togglePin(entry.entry_id, prev)
    if ('error' in result) {
      setIsPinned(prev)
      toast.error('Failed to update pin')
    }
  }

  function handleDiscard() {
    dismissConflict()
    router.refresh()
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Editor top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-[#0F172A] shrink-0">
        <button
          onClick={() => router.push(`/journals/${journal.journal_id}`)}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-gray-500 dark:text-slate-400"
          aria-label="Back to journal"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="text-sm text-gray-500 dark:text-slate-400 truncate hidden sm:block">
          {journal.title}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <SaveStatus status={saveStatus} onSaveNow={saveNow} />

          <button
            onClick={handlePinToggle}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin
              className={`w-4 h-4 transition-colors ${
                isPinned
                  ? 'fill-[var(--brand)] text-[var(--brand)]'
                  : 'text-gray-400 dark:text-slate-500'
              }`}
            />
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400 dark:text-slate-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setShowDeleteModal(true)
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-6 py-8">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="Entry title…"
            className="w-full text-2xl font-semibold text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 bg-transparent border-none outline-none mb-4"
          />

          {/* Date */}
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="text-sm text-gray-500 dark:text-slate-400 bg-transparent border border-[#E5E7EB] dark:border-slate-700 rounded-lg px-3 py-1.5 mb-8 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          />

          {/* Tiptap rich-text editor */}
          <JournalEditor
            initialContent={parseInitialContent(entry.content)}
            onChange={handleEditorChange}
            editable={true}
          />

          {/* Tags placeholder */}
          <div className="mt-8 pt-4 border-t border-[#E5E7EB] dark:border-slate-700">
            <p className="text-sm text-gray-400 dark:text-slate-500 italic">
              Tags will be added in a later module
            </p>
          </div>
        </div>
      </div>

      {/* Conflict dialog */}
      {conflictDetected && (
        <ConflictDialog onKeepMine={forceSave} onDiscard={handleDiscard} />
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteEntryModal
          entryId={entry.entry_id}
          journalId={journal.journal_id}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}
