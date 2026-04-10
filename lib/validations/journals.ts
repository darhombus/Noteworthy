import { z } from 'zod'

export const COLOR_DEFS = [
  { value: '#1976D2', bg: '#E3F2FD', label: 'Blue' },
  { value: '#2E7D32', bg: '#E8F5E9', label: 'Green' },
  { value: '#6A1B9A', bg: '#F3E5F5', label: 'Purple' },
  { value: '#E65100', bg: '#FBE9E7', label: 'Orange' },
  { value: '#00695C', bg: '#E0F2F1', label: 'Teal' },
  { value: '#C62828', bg: '#FFEBEE', label: 'Red' },
  { value: '#283593', bg: '#E8EAF6', label: 'Indigo' },
  { value: '#F57F17', bg: '#FFFDE7', label: 'Amber' },
] as const

export const JOURNAL_COLORS = [
  '#1976D2', '#2E7D32', '#6A1B9A', '#E65100',
  '#00695C', '#C62828', '#283593', '#F57F17',
] as const

export const JOURNAL_ICONS = ['📔', '📓', '📒', '📕', '📗', '📘', '📙', '✨'] as const

export function getColorBg(color: string): string {
  const def = COLOR_DEFS.find((c) => c.value === color)
  return def?.bg ?? '#E3F2FD'
}

export function getColorLabel(color: string): string {
  const def = COLOR_DEFS.find((c) => c.value === color)
  return def?.label ?? 'Blue'
}

export const LOCK_TYPES = ['none', 'pin', 'password'] as const
export type LockType = (typeof LOCK_TYPES)[number]

export const createJournalSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  color: z.enum(JOURNAL_COLORS, { error: () => ({ message: 'Please select a colour' }) }),
  icon: z.enum(JOURNAL_ICONS, { error: () => ({ message: 'Please select an icon' }) }),
  lock_type: z.enum(LOCK_TYPES).default('none'),
})

export const updateJournalSchema = createJournalSchema.partial()

export type CreateJournalInput = z.infer<typeof createJournalSchema>
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>
