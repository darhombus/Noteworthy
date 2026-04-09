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

  const currentUsage = await getUserStorageUsage(user.id)
  const remainingSpace = Math.max(0, STORAGE_QUOTA_BYTES - currentUsage)
  const percentUsed = Math.round((currentUsage / STORAGE_QUOTA_BYTES) * 1000) / 10

  return NextResponse.json({
    currentUsage,
    limit: STORAGE_QUOTA_BYTES,
    remainingSpace,
    percentUsed,
  })
}
