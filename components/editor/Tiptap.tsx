'use client'

import { EditorContent } from '@tiptap/react'
import type { TiptapDoc } from '@/lib/types/tiptap'
import EditorToolbar from './EditorToolbar'
import { useTiptapEditor } from './useTiptapEditor'

interface TiptapProps {
  /** Initial document — read once on mount. Later updates are ignored on
   *  purpose so the editor stays uncontrolled and doesn't reset the cursor. */
  initialContent: TiptapDoc
  /** Fires on every transaction with the doc returned by `editor.getJSON()`.
   *  The parent must NOT transform this value — pass it straight to autosave. */
  onChange: (doc: TiptapDoc) => void
}

/**
 * Self-contained Tiptap wrapper that renders the toolbar directly above the
 * editor body. For layouts where the toolbar needs to be pinned outside the
 * scroll container, use `useTiptapEditor` directly and render the toolbar and
 * `<EditorContent>` in separate positions.
 */
export default function Tiptap({ initialContent, onChange }: TiptapProps) {
  const editor = useTiptapEditor({ initialContent, onChange })

  if (!editor) {
    return <div className="min-h-[400px]" />
  }

  return (
    <div>
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
