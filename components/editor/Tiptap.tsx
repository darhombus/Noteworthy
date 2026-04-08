'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { EMPTY_TIPTAP_DOC, isTiptapDoc, type TiptapDoc } from '@/lib/types/tiptap'
import EditorToolbar from './EditorToolbar'

interface TiptapProps {
  /** Initial document — read once on mount. Later updates are ignored on
   *  purpose so the editor stays uncontrolled and doesn't reset the cursor. */
  initialContent: TiptapDoc
  /** Fires on every transaction with the doc returned by `editor.getJSON()`.
   *  The parent must NOT transform this value — pass it straight to autosave. */
  onChange: (doc: TiptapDoc) => void
}

export default function Tiptap({ initialContent, onChange }: TiptapProps) {
  // Keep the latest onChange in a ref so the useEditor options can stay stable
  // and the editor is only ever created once.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: isTiptapDoc(initialContent) ? initialContent : EMPTY_TIPTAP_DOC,
    // Required for Next.js SSR: defer initial render until client mount so
    // server and client HTML match.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'ProseMirror focus:outline-none font-serif text-[18px] leading-[1.75] text-[var(--text-primary)] min-h-[400px]',
      },
    },
    onUpdate: ({ editor }) => {
      // CRITICAL: pass editor JSON through verbatim — NO walkers, NO replacers,
      // NO key filtering (see memory/feedback_no_custom_serializers.md).
      //
      // The single JSON.parse(JSON.stringify(...)) clone here is NOT a
      // sanitiser — it's a prototype fix. ProseMirror creates each node's
      // `attrs` object with a null prototype (`Object.create(null)`), and
      // Next.js 16 / React 19 Server Actions silently drop non-plain nested
      // objects during Flight serialisation. That's what was stripping
      // `attrs.level` and `attrs.textAlign` across the wire. Stringify-parse
      // rebuilds everything with `Object.prototype`, preserving every key and
      // value untouched. See tiptap#4805.
      const doc = JSON.parse(JSON.stringify(editor.getJSON())) as TiptapDoc
      onChangeRef.current(doc)
    },
  })

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
