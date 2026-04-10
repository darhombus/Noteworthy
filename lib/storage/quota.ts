import { createClient } from '@/lib/supabase/server'
export { formatStorageSize } from './format'

/** Per-user storage cap shared across all media (images + videos). */
export const STORAGE_QUOTA_BYTES = 200 * 1024 * 1024 // 200 MB

export interface QuotaCheck {
  allowed: boolean
  currentUsage: number
  limit: number
  remainingSpace: number
}

/**
 * Sum the file_size of every media row owned by the user (media → entries →
 * journals → user_id). Returns 0 if the user has no media yet.
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('media')
    .select('file_size, entries!inner(journal_id, journals!inner(user_id))')
    .eq('entries.journals.user_id', userId)

  if (error || !data) return 0

  return data.reduce((sum, row) => sum + Number(row.file_size ?? 0), 0)
}

/**
 * Check whether `newFileSize` will fit in the user's remaining quota. Always
 * returns the current usage and remaining-space numbers so callers can render
 * helpful error messages without making a second round-trip.
 */
export async function checkStorageQuota(
  userId: string,
  newFileSize: number,
): Promise<QuotaCheck> {
  const currentUsage = await getUserStorageUsage(userId)
  const remainingSpace = Math.max(0, STORAGE_QUOTA_BYTES - currentUsage)
  return {
    allowed: currentUsage + newFileSize <= STORAGE_QUOTA_BYTES,
    currentUsage,
    limit: STORAGE_QUOTA_BYTES,
    remainingSpace,
  }
}

