import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isVaultOpen } from '@/lib/privacy/vault'

/**
 * Returns whether the current user's vault is currently unlocked.
 * Used by the sidebar's lock-open indicator dot.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ open: false }, { status: 200 })
  }
  const open = await isVaultOpen(user.id)
  return NextResponse.json({ open }, { headers: { 'Cache-Control': 'no-store' } })
}
