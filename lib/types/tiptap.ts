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

/** Canonical empty document. Use this anywhere you need a default. */
export const EMPTY_TIPTAP_DOC: TiptapDoc = { type: 'doc', content: [] }

/** Runtime guard mirroring the database CHECK constraint. */
export function isTiptapDoc(value: unknown): value is TiptapDoc {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.type === 'doc' && Array.isArray(v.content)
}
