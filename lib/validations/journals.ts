import { z } from 'zod'

export const JOURNAL_COLORS = [
  '#1A56DB', '#059669', '#D97706', '#7C3AED',
  '#DC2626', '#0891B2', '#65A30D', '#DB2777',
] as const

export const JOURNAL_ICONS = [
  'book', 'star', 'heart', 'briefcase',
  'globe', 'music', 'camera', 'coffee',
] as const

export const createJournalSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  color: z.enum(JOURNAL_COLORS, { error: () => ({ message: 'Please select a colour' }) }),
  icon: z.enum(JOURNAL_ICONS, { error: () => ({ message: 'Please select an icon' }) }),
})

export const updateJournalSchema = createJournalSchema.partial()

export type CreateJournalInput = z.infer<typeof createJournalSchema>
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>
