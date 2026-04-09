'use client'

import { useEffect, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import type { TiptapDoc } from '@/lib/types/tiptap'
import EditorToolbar from './EditorToolbar'
import ImageUploadModal from './ImageUploadModal'
import ImageLightbox from './ImageLightbox'
import { useTiptapEditor } from './useTiptapEditor'

interface TiptapProps {
  /** Initial document — read once on mount. Later updates are ignored on
   *  purpose so the editor stays uncontrolled and doesn't reset the cursor. */
  initialContent: TiptapDoc
  /** Fires on every transaction with the doc returned by `editor.getJSON()`.
   *  The parent must NOT transform this value — pass it straight to autosave. */
  onChange: (doc: TiptapDoc) => void
  /** Required when image upload is in use — uploaded media is keyed by entry. */
  entryId?: string
}

/**
 * Self-contained Tiptap wrapper that renders the toolbar directly above the
 * editor body. For layouts where the toolbar needs to be pinned outside the
 * scroll container, use `useTiptapEditor` directly and render the toolbar and
 * `<EditorContent>` in separate positions.
 */
export default function Tiptap({ initialContent, onChange, entryId }: TiptapProps) {
  const editor = useTiptapEditor({ initialContent, onChange })
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // Slash command: typing `/image` at the start of an empty line opens the
  // upload modal. Lightweight matcher — we deliberately avoid pulling in the
  // full @tiptap/suggestion plugin for a single command.
  useEffect(() => {
    if (!editor || !entryId) return
    const onKeyUp = () => {
      const { from, $from } = editor.state.selection
      const lineStart = $from.start()
      const text = editor.state.doc.textBetween(lineStart, from, '\n', '\n')
      if (text === '/image') {
        // Delete the trigger text, then open the modal.
        editor.chain().focus().deleteRange({ from: lineStart, to: from }).run()
        setShowUploadModal(true)
      }
    }
    const dom = editor.view.dom
    dom.addEventListener('keyup', onKeyUp)
    return () => dom.removeEventListener('keyup', onKeyUp)
  }, [editor, entryId])

  // Click an image inside the editor to open the lightbox.
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

  if (!editor) {
    return <div className="min-h-[400px]" />
  }

  return (
    <div>
      <EditorToolbar
        editor={editor}
        onInsertImage={entryId ? () => setShowUploadModal(true) : undefined}
      />
      <EditorContent editor={editor} />

      {showUploadModal && entryId && (
        <ImageUploadModal
          entryId={entryId}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={(_mediaId, fileUrl) => {
            editor.chain().focus().setImage({ src: fileUrl }).run()
          }}
        />
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
