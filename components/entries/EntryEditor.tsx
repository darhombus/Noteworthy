'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { EditorContent } from '@tiptap/react'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import SaveStatus from './SaveStatus'
import ConflictDialog from './ConflictDialog'
import DeleteEntryModal from './DeleteEntryModal'
import TagInput from './TagInput'
import DatePicker from './DatePicker'
import EditorToolbar from '@/components/editor/EditorToolbar'
import ImageUploadModal from '@/components/editor/ImageUploadModal'
import ImageLightbox from '@/components/editor/ImageLightbox'
import { useTiptapEditor } from '@/components/editor/useTiptapEditor'
import type { Database } from '@/types/supabase'
import { EMPTY_TIPTAP_DOC, isTiptapDoc, type TiptapDoc } from '@/lib/types/tiptap'

type Entry = Database['public']['Tables']['entries']['Row']
type JournalMeta = Pick<
  Database['public']['Tables']['journals']['Row'],
  'journal_id' | 'title' | 'color'
>

interface EntryTag {
  tag_id: string
  tag_name: string
  color: string
}

interface EntryEditorProps {
  entry: Entry
  journal: JournalMeta
  initialTags: EntryTag[]
}

export default function EntryEditor({ entry, journal, initialTags }: EntryEditorProps) {
  const router = useRouter()

  // Read the stored doc once. `isTiptapDoc` mirrors the DB CHECK constraint,
  // so anything that somehow slipped through falls back to an empty doc.
  const initialContent: TiptapDoc = isTiptapDoc(entry.content)
    ? entry.content
    : EMPTY_TIPTAP_DOC

  const [title, setTitle] = useState(entry.title ?? '')
  const [content, setContent] = useState<TiptapDoc>(initialContent)
  const [entryDate, setEntryDate] = useState(entry.entry_date)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Latest selectable date — today, in local time, as YYYY-MM-DD.
  const todayIso = useMemo(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  // Close the overflow menu when clicking outside or pressing Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Bundle all mutable fields into one save payload.
  const savePayload = useMemo(
    () => ({
      content,
      title: title || undefined,
      entry_date: entryDate,
    }),
    [content, title, entryDate],
  )

  // Tiptap onChange — pass editor JSON through verbatim. No walkers, no
  // replacers, no sanitisation. See memory/feedback_no_custom_serializers.md.
  const handleContentChange = useCallback((doc: TiptapDoc) => {
    setContent(doc)
  }, [])

  // Own the Tiptap editor instance here so the toolbar and editor body can
  // live in separate DOM positions — toolbar pinned above the scroll area,
  // body inside it.
  const editor = useTiptapEditor({
    initialContent,
    onChange: handleContentChange,
  })

  const { saveStatus, conflictDetected, dismissConflict, forceSave, saveNow } = useAutoSave({
    content: savePayload,
    entryId: entry.entry_id,
    serverUpdatedAt: entry.updated_at,
  })

  useBeforeUnload(saveStatus)

  // `/image` slash command — typing it on an empty position opens the
  // upload modal. Minimal implementation; we strip the trigger text first
  // so it never persists in the saved doc.
  useEffect(() => {
    if (!editor) return
    const onKeyUp = () => {
      const { from, $from } = editor.state.selection
      const lineStart = $from.start()
      const text = editor.state.doc.textBetween(lineStart, from, '\n', '\n')
      if (text === '/image') {
        editor.chain().focus().deleteRange({ from: lineStart, to: from }).run()
        setShowUploadModal(true)
      }
    }
    const dom = editor.view.dom
    dom.addEventListener('keyup', onKeyUp)
    return () => dom.removeEventListener('keyup', onKeyUp)
  }, [editor])

  // Click an <img> inside the editor to open the fullscreen lightbox.
  useEffect(() => {
    if (!editor) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.tagName === 'IMG') {
        const src = (target as HTMLImageElement).src
        if (src) setLightboxSrc(src)
      }
    }
    const dom = editor.view.dom
    dom.addEventListener('click', onClick)
    return () => dom.removeEventListener('click', onClick)
  }, [editor])

  async function handleBack() {
    if (saveStatus === 'pending') {
      await saveNow()
    }
    router.push(`/journals/${journal.journal_id}`)
  }

  function handleDiscard() {
    dismissConflict()
    router.refresh()
  }

  return (
    <div className="max-w-[720px] mx-auto pb-8">
      {/* Top row — back button, journal label, overflow menu. Scrolls
          normally with the rest of the metadata. Save status lives in the
          sticky toolbar block below so it stays visible on long entries. */}
      <div className="flex items-center gap-3 py-2 border-b border-[var(--border)]">
        <button
          onClick={handleBack}
          className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
          aria-label="Back to journal"
          title="Back to journal"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="text-sm text-[var(--text-secondary)] truncate hidden sm:block">
          {journal.title}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors"
              aria-label="More options"
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setShowDeleteModal(true)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entry metadata — title, date, tags. Scrolls away with the page so
          the toolbar can pin directly above the writing surface. */}
      <div className="pt-4 space-y-4">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          placeholder="Entry title…"
          className="w-full text-2xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
        />

        {/* Date */}
        <div>
          <DatePicker value={entryDate} onChange={setEntryDate} max={todayIso} />
        </div>

        {/* Tags */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2">
          <TagInput entryId={entry.entry_id} initialTags={initialTags} />
        </div>
      </div>

      {/* Sticky toolbar — pins to the top of the scroll container so the
          formatting controls stay reachable while writing. The save status
          rides along above it so the user can always see the current save
          state on long entries. */}
      {editor && (
        <div className="sticky top-0 z-20 bg-[var(--bg-page)] pt-4 pb-2 mt-4">
          <div className="flex justify-end h-5 mb-1">
            <SaveStatus status={saveStatus} onSaveNow={saveNow} />
          </div>
          <EditorToolbar editor={editor} onInsertImage={() => setShowUploadModal(true)} />
        </div>
      )}

      {/* Rich-text body editor */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg p-4">
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="min-h-[400px]" />
        )}
      </div>

      {/* Conflict dialog */}
      {conflictDetected && (
        <ConflictDialog onKeepMine={forceSave} onDiscard={handleDiscard} />
      )}

      {/* Image upload modal */}
      {showUploadModal && editor && (
        <ImageUploadModal
          entryId={entry.entry_id}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={(mediaId, fileUrl) => {
            editor
              .chain()
              .focus()
              .insertContent({ type: 'image', attrs: { src: fileUrl, mediaId } })
              .run()
          }}
        />
      )}

      {/* Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
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
