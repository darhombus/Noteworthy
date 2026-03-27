'use client'

import { useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { defaultExtensions } from '@/lib/editor/tiptap-config'
import { extractPlainText } from '@/lib/utils/extractPlainText'

interface ReadOnlyPreviewProps {
  content: string // raw JSON string from DB (or already-parsed object)
  maxChars?: number
}

/**
 * Parse the raw DB value into a Tiptap JSONContent doc.
 * Returns null if the value is missing, unparseable, or not a Tiptap doc.
 */
function parseContent(raw: unknown): JSONContent | null {
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

/**
 * Build a preview doc: if the plain text is short enough, return the full
 * content; otherwise build a single-paragraph doc with truncated text.
 */
function buildPreviewDoc(content: JSONContent, maxChars: number): JSONContent {
  const text = extractPlainText(content)
  if (text.length <= maxChars) return content

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: text.slice(0, maxChars) + '…' }],
      },
    ],
  }
}

export default function ReadOnlyPreview({ content, maxChars = 200 }: ReadOnlyPreviewProps) {
  const previewDoc = useMemo(() => {
    const parsed = parseContent(content)
    if (!parsed) return null
    return buildPreviewDoc(parsed, maxChars)
  }, [content, maxChars])

  const editor = useEditor({
    extensions: defaultExtensions,
    content: previewDoc ?? undefined,
    editable: false,
    immediatelyRender: false,
  })

  if (!previewDoc) return null

  return (
    <div className="read-only-preview pointer-events-none select-none overflow-hidden">
      <EditorContent editor={editor} />
    </div>
  )
}
