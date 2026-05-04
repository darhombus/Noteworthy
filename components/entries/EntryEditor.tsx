'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MoreHorizontal, Eye, Pencil, Calendar } from 'lucide-react'
import { EditorContent } from '@tiptap/react'
import { useSurface } from '@/lib/surface'
import { journalHref, journalListHref } from '@/lib/utils/href'
import { useAutoSave } from '@/hooks/useAutoSave'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import { useEntryRealtime } from '@/hooks/useEntryRealtime'
import SaveStatus from './SaveStatus'
import ConflictDialog from './ConflictDialog'
import DeleteEntryModal from './DeleteEntryModal'
import ExportModal from '@/components/ExportModal'
import TagInput from './TagInput'
import TagChip from '@/components/ui/TagChip'
import DatePicker from './DatePicker'
import EditorToolbar from '@/components/editor/EditorToolbar'
import ImageUploadModal from '@/components/editor/ImageUploadModal'
import ImageLightbox from '@/components/editor/ImageLightbox'
import VideoUploadModal from '@/components/editor/VideoUploadModal'
import { useTiptapEditor } from '@/components/editor/useTiptapEditor'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database } from '@/types/supabase'
import { EMPTY_TIPTAP_DOC, isTiptapDoc, type TiptapDoc } from '@/lib/types/tiptap'

type Entry = Database['public']['Tables']['entries']['Row']
type JournalMeta = Pick<
  Database['public']['Tables']['journals']['Row'],
  'journal_id' | 'title' | 'color' | 'is_hidden'
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
  const surface = useSurface()

  // Read the stored doc once. `isTiptapDoc` mirrors the DB CHECK constraint,
  // so anything that somehow slipped through falls back to an empty doc. We
  // also fall back when the doc is structurally valid but has zero children
  // (`content: []`): without that, Tiptap's TrailingNode plugin would insert
  // a paragraph on first focus and trigger a phantom save (see
  // memory/feedback_setEditable_emit_update.md).
  const initialContent: TiptapDoc =
    isTiptapDoc(entry.content) && entry.content.content.length > 0
      ? entry.content
      : EMPTY_TIPTAP_DOC

  const [title, setTitle] = useState(entry.title ?? '')
  const [content, setContent] = useState<TiptapDoc>(initialContent)
  const [entryDate, setEntryDate] = useState(entry.entry_date)
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
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

  // Human-readable entry date for the read-only view. Same format as
  // DatePicker so toggling modes doesn't jar the eye.
  const formattedEntryDate = useMemo(() => {
    const [y, m, d] = entryDate.split('-').map(Number)
    const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()]
    const month = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ][dt.getMonth()]
    return `${weekday}, ${month} ${dt.getDate()}, ${dt.getFullYear()}`
  }, [entryDate])

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

  // Flip Tiptap's editable flag whenever the user toggles read mode. The
  // editor is created with `editable: true` by default, so we only need to
  // push updates — `setEditable` no-ops when the value matches.
  //
  // Pass `emitUpdate: false`. Tiptap's setEditable defaults to firing a
  // synthetic 'update' event even when the doc didn't change (see Editor.ts
  // in @tiptap/core). On mount with editable=true, that fake update flowed
  // through onUpdate → setContent and flipped autosave to 'pending' for an
  // untouched entry — the user would see "Save failed" and a conflict modal
  // without ever typing.
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!isReadOnly, false)
  }, [editor, isReadOnly])

  const {
    saveStatus,
    conflictDetected,
    dismissConflict,
    forceSave,
    saveNow,
    applyServerUpdate,
    triggerConflict,
    getServerUpdatedAt,
  } = useAutoSave({
    content: savePayload,
    entryId: entry.entry_id,
    serverUpdatedAt: entry.updated_at,
  })

  useBeforeUnload(saveStatus)

  // Live cross-tab sync — when the server row changes under us (e.g. another
  // tab saved or used "Keep mine"), apply it in place if we have no dirty
  // edits, or surface the conflict dialog proactively if we do. Without this,
  // the other tab stays stale until its next save attempt hits a 409.
  const saveStatusRef = useRef(saveStatus)
  useEffect(() => {
    saveStatusRef.current = saveStatus
  }, [saveStatus])

  // Overwrite local state with a freshly-fetched server row and mark it as
  // the new sync point. Shared by the realtime clean-apply path and the
  // "Discard and reload" button.
  const applyRemoteRow = useCallback(
    (newRow: Entry) => {
      const newDoc: TiptapDoc =
        isTiptapDoc(newRow.content) && (newRow.content as TiptapDoc).content.length > 0
          ? (newRow.content as TiptapDoc)
          : EMPTY_TIPTAP_DOC
      const newTitle = newRow.title ?? ''
      const newDate = newRow.entry_date

      setTitle(newTitle)
      setEntryDate(newDate)
      setContent(newDoc)
      // `emitUpdate: false` suppresses Tiptap's onUpdate so we don't loop back
      // through our own React state set above.
      editor?.commands.setContent(newDoc, { emitUpdate: false })

      // Must mirror the savePayload shape built in the useMemo above — any
      // divergence here would leave the content effect flipping to 'pending'
      // immediately and firing a redundant save.
      applyServerUpdate(newRow.updated_at, {
        content: newDoc,
        title: newTitle || undefined,
        entry_date: newDate,
      })
    },
    [editor, applyServerUpdate],
  )

  useEntryRealtime(entry.entry_id, (newRow) => {
    // Ignore realtime entirely while a save is in flight. The Postgres UPDATE
    // is broadcast on the realtime channel the moment the row is written, but
    // the Server Action's response (which carries the same updated_at) races
    // it back to this tab on a different network path. If the realtime event
    // wins, getServerUpdatedAt() still points at the pre-save timestamp and
    // the strict equality echo filter below misses our own save — we'd then
    // fire a phantom conflict dialog for an UPDATE that's literally ours.
    // The Server Action does its own server-side conflict check (clientUpdatedAt
    // vs current.updated_at) and returns {conflict:true} authoritatively if a
    // foreign tab beat us, so dropping realtime during 'saving' is safe.
    if (saveStatusRef.current === 'saving') return

    // Filter echoes of our own saves — after the action response lands,
    // getServerUpdatedAt() == the broadcast updated_at and we can short-circuit.
    if (newRow.updated_at === getServerUpdatedAt()) return

    const isDirty =
      saveStatusRef.current === 'pending' ||
      saveStatusRef.current === 'error'

    if (isDirty) {
      triggerConflict()
      return
    }

    applyRemoteRow(newRow)
  })

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
      } else if (text === '/video') {
        editor.chain().focus().deleteRange({ from: lineStart, to: from }).run()
        setShowVideoModal(true)
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
    // From a hidden-journal entry (parent is_hidden) → back to the journal
    // page. From a standalone hidden entry (parent is public) → back to the
    // /hidden dashboard, since the user reached the editor through the
    // dashboard rather than the journal list.
    if (surface === 'hidden' && !journal.is_hidden) {
      router.push(journalListHref('hidden'))
      return
    }
    router.push(journalHref(surface, journal.journal_id))
  }

  async function handleDiscard() {
    // Fetch the current server row and apply it over the in-progress edits.
    // The Tiptap editor is uncontrolled, so we can't rely on router.refresh()
    // alone to reset the body — `applyRemoteRow` both refreshes local state
    // and calls `editor.commands.setContent` to replace the doc in place.
    const supabase = createClient()
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('entry_id', entry.entry_id)
      .single()

    if (error || !data) {
      toast.error('Could not load server version — please try again.')
      return
    }

    applyRemoteRow(data)
    dismissConflict()
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
          <button
            onClick={() => setIsReadOnly((prev) => !prev)}
            className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
            aria-label={isReadOnly ? 'Switch to edit mode' : 'Switch to read-only mode'}
            aria-pressed={isReadOnly}
            title={isReadOnly ? 'Switch to edit mode' : 'Read-only mode'}
          >
            {isReadOnly ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

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
              <div className="absolute right-0 top-full mt-1 w-48 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    setShowExportModal(true)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Export entry
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
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
          the toolbar can pin directly above the writing surface. In read-only
          mode every interactive control is swapped for a static display so
          the user can't accidentally mutate anything. */}
      <div className="pt-4 space-y-4">
        {/* Title */}
        {isReadOnly ? (
          <h1 className="w-full text-2xl font-semibold text-[var(--text-primary)] px-4 py-2.5">
            {title || 'Untitled'}
          </h1>
        ) : (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="Entry title…"
            className="w-full text-2xl font-semibold text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent transition-colors"
          />
        )}

        {/* Date */}
        <div>
          {isReadOnly ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--text-primary)]">
              <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
              <span>{formattedEntryDate}</span>
            </div>
          ) : (
            <DatePicker value={entryDate} onChange={setEntryDate} max={todayIso} />
          )}
        </div>

        {/* Tags */}
        {isReadOnly ? (
          initialTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {initialTags.map((tag) => (
                <TagChip key={tag.tag_id} tagName={tag.tag_name} color={tag.color} />
              ))}
            </div>
          )
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-3 py-2">
            <TagInput entryId={entry.entry_id} initialTags={initialTags} />
          </div>
        )}

      </div>

      {/* Sticky toolbar — pins to the top of the scroll container so the
          formatting controls stay reachable while writing. The save status
          rides along above it so the user can always see the current save
          state on long entries. */}
      {editor && !isReadOnly && (
        <div className="sticky top-0 z-20 bg-[var(--bg-page)] pt-4 pb-2 mt-4">
          <div className="flex justify-end h-5 mb-1">
            <SaveStatus status={saveStatus} onSaveNow={saveNow} />
          </div>
          <EditorToolbar
            editor={editor}
            onInsertImage={() => setShowUploadModal(true)}
            onInsertVideo={() => setShowVideoModal(true)}
          />
        </div>
      )}

      {/* Rich-text body editor. In read-only mode the sticky toolbar is
          hidden, so reintroduce the top margin it used to provide. */}
      <div className={`bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg p-4 ${isReadOnly ? 'mt-4' : ''}`}>
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

      {/* Video upload modal */}
      {showVideoModal && editor && (
        <VideoUploadModal
          entryId={entry.entry_id}
          onClose={() => setShowVideoModal(false)}
          onUploadComplete={(mediaId, fileUrl, thumbnailUrl) => {
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'video',
                attrs: { src: fileUrl, thumbnailSrc: thumbnailUrl, mediaId },
              })
              .run()
          }}
        />
      )}

      {/* Image lightbox */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* Export modal */}
      {showExportModal && (
        <ExportModal
          scope="entry"
          entryId={entry.entry_id}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <DeleteEntryModal
          entryId={entry.entry_id}
          journalId={journal.journal_id}
          parentJournalIsHidden={journal.is_hidden}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}
