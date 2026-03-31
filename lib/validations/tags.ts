import { z } from 'zod'

export const TAG_COLORS = [
  '#1A56DB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DC2626',
  '#0891B2',
  '#65A30D',
  '#DB2777',
] as const

const tagNameField = z
  .string()
  .min(1, 'Tag name is required')
  .max(50, 'Tag name must be 50 characters or fewer')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.',
  )

const colorEnum = z.enum([
  '#1A56DB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DC2626',
  '#0891B2',
  '#65A30D',
  '#DB2777',
])

export const createTagSchema = z.object({
  tag_name: tagNameField,
  color: colorEnum.default('#1A56DB'),
})

export const updateTagSchema = z.object({
  tag_name: tagNameField.optional(),
  color: colorEnum.optional(),
})

export type CreateTagInput = z.infer<typeof createTagSchema>
export type UpdateTagInput = z.infer<typeof updateTagSchema>
