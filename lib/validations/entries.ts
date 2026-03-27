import { z } from 'zod'

export const createEntrySchema = z.object({
  journal_id: z.string().uuid('Invalid journal ID'),
  title: z.string().max(300, 'Title must be 300 characters or less').optional(),
  content: z.unknown().optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
})

export const updateEntrySchema = z.object({
  title: z.string().max(300, 'Title must be 300 characters or less').optional(),
  content: z.unknown().optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
  is_pinned: z.boolean().optional(),
})

export type CreateEntryInput = z.infer<typeof createEntrySchema>
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>
