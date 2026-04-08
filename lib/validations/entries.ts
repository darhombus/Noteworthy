import { z } from 'zod'

/**
 * Tiptap document shape — kept loose enough to round-trip arbitrary node and
 * mark types (so adding extensions never requires a schema change), but
 * strict enough to mirror the database CHECK constraint in
 * `004_enforce_tiptap_doc_shape.sql`: it MUST be an object with type='doc'
 * and an array `content` field.
 */
const tiptapDocSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.unknown()),
  })
  .passthrough()

export const createEntrySchema = z.object({
  journal_id: z.string().uuid('Invalid journal ID'),
  title: z.string().max(300, 'Title must be 300 characters or less').optional(),
  content: tiptapDocSchema.optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
})

export const updateEntrySchema = z.object({
  title: z.string().max(300, 'Title must be 300 characters or less').optional(),
  content: tiptapDocSchema.optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
  is_pinned: z.boolean().optional(),
})

export type CreateEntryInput = z.infer<typeof createEntrySchema>
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>
