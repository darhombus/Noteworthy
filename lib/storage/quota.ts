import { createClient } from '@/lib/supabase/server'
import { withHotCache } from '@/lib/perf/hot-cache'
export { formatStorageSize } from './format'

/** Per-user storage cap shared across all media (images + videos). */
export const STORAGE_QUOTA_BYTES = 200 * 1024 * 1024 // 200 MB

export interface QuotaCheck {
  allowed: boolean
  currentUsage: number
  limit: number
  remainingSpace: number
}

export interface StorageUsageBreakdown {
  currentUsage: number
  imageUsage: number
  videoUsage: number
}

const STORAGE_BREAKDOWN_HOT_TTL_MS = 15_000

/**
 * Return a full storage breakdown using a single query:
 * - total usage
 * - image usage
 * - video usage
 *
 * This avoids multiple full-table scans on `media` when rendering the Privacy
 * tab and keeps repeated tab switches fast.
 */
export async function getUserStorageBreakdown(userId: string): Promise<StorageUsageBreakdown> {
  return withHotCache(`storage:breakdown:${userId}`, STORAGE_BREAKDOWN_HOT_TTL_MS, async () => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('media')
      .select('file_type, file_size, entries!inner(journal_id, journals!inner(user_id))')
      .eq('entries.journals.user_id', userId)

    if (error || !data) {
      return { currentUsage: 0, imageUsage: 0, videoUsage: 0 }
    }

    let imageUsage = 0
    let videoUsage = 0

    for (const row of data) {
      const size = Number(row.file_size ?? 0)
      if (row.file_type === 'video') videoUsage += size
      else imageUsage += size
    }

    return {
      currentUsage: imageUsage + videoUsage,
      imageUsage,
      videoUsage,
    }
  })
}

/**
 * Sum the file_size of every media row owned by the user (media → entries →
 * journals → user_id). Returns 0 if the user has no media yet.
 */
export async function getUserStorageUsage(userId: string): Promise<number> {
  const usage = await getUserStorageBreakdown(userId)
  return usage.currentUsage
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
