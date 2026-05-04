/**
 * Shape contract for the rich-text content stored in `entries.content`.
 *
 * This is intentionally hand-written (not pulled from `@tiptap/core`) so the
 * type stays valid even when no Tiptap version is installed, and so the
 * project owns the source of truth for what counts as a valid document.
 *
 * The matching database CHECK constraint lives in
 * `supabase/migrations/004_enforce_tiptap_doc_shape.sql` — keep them in sync.
 */

export interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
  [key: string]: unknown
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
  [key: string]: unknown
}

export interface TiptapDoc {
  type: 'doc'
  content: TiptapNode[]
}

/**
 * Canonical empty document. Use this anywhere you need a default.
 *
 * Includes a single empty paragraph rather than `content: []`. Reason: Tiptap's
 * `TrailingNode` plugin (auto-included by StarterKit) registers an
 * `appendTransaction` that fires on the *first* dispatched transaction —
 * including the selection-only one ProseMirror sends when the user clicks into
 * the editor — and inserts a paragraph at the doc's end if the last child
 * isn't already one. For a `content: []` doc that produces a real `docChanged`
 * transaction → an `update` event → the autosave thinks the user typed
 * something and writes a phantom save. Pre-populating the paragraph makes
 * first-focus a no-op and keeps `editor.getJSON()` byte-identical to what we
 * stored.
 */
export const EMPTY_TIPTAP_DOC: TiptapDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

/** Runtime guard mirroring the database CHECK constraint. */
export function isTiptapDoc(value: unknown): value is TiptapDoc {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.type === 'doc' && Array.isArray(v.content)
}
