import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  STORAGE_QUOTA_BYTES,
  getUserStorageUsage,
} from '@/lib/storage/quota'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Total usage (joins through entries → journals for ownership)
  const currentUsage = await getUserStorageUsage(user.id)
  const remainingSpace = Math.max(0, STORAGE_QUOTA_BYTES - currentUsage)
  const percentUsed = Math.round((currentUsage / STORAGE_QUOTA_BYTES) * 1000) / 10

  // Breakdown by file_type — uses the idx_media_file_type index added in 007
  const { data: breakdown } = await supabase
    .from('media')
    .select(
      'file_type, file_size, entries!inner(journal_id, journals!inner(user_id))',
    )
    .eq('entries.journals.user_id', user.id)

  let imageUsage = 0
  let videoUsage = 0
  if (breakdown) {
    for (const row of breakdown) {
      const size = Number(row.file_size ?? 0)
      if (row.file_type === 'video') {
        videoUsage += size
      } else {
        imageUsage += size
      }
    }
  }

  return NextResponse.json({
    currentUsage,
    limit: STORAGE_QUOTA_BYTES,
    remainingSpace,
    percentUsed,
    imageUsage,
    videoUsage,
  })
}
