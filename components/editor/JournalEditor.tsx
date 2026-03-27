'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { defaultExtensions } from '@/lib/editor/tiptap-config'
import EditorToolbar from './EditorToolbar'

interface JournalEditorProps {
  initialContent: JSONContent | null
  onChange: (content: JSONContent) => void
  editable?: boolean
}

export default function JournalEditor({
  initialContent,
  onChange,
  editable = true,
}: JournalEditorProps) {
  const editor = useEditor({
    extensions: defaultExtensions,
    content: initialContent ?? undefined,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap-journal focus:outline-none',
      },
    },
  })

  // Bug 3 fix: use explicit event listener so onChange only fires when the
  // document content changes, not on every transaction (cursor/selection moves)
  useEffect(() => {
    if (!editor) return
    const handler = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) {
        onChange(editor.getJSON())
      }
    }
    editor.on('update', handler as Parameters<typeof editor.on>[1])
    return () => { editor.off('update', handler as Parameters<typeof editor.on>[1]) }
  }, [editor, onChange])

  // Sync editable prop changes after mount
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  return (
    <div className="tiptap-container rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-[#1E293B]">
      {editor && <EditorToolbar editor={editor} disabled={!editable} />}
      <EditorContent editor={editor} />
    </div>
  )
}
