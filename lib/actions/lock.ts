'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { hashSecret, verifySecret } from '@/lib/utils/lockCrypto'

// ---------------------------------------------------------------------------
// Exported server actions
// ---------------------------------------------------------------------------

/** Verify the PIN/password for a locked journal or entry. */
export async function verifyLock(
  entityId: string,
  entityType: 'journal' | 'entry',
  secret: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let lockHash: string | null = null

  if (entityType === 'journal') {
    const { data } = await supabase
      .from('journals')
      .select('lock_hash')
      .eq('journal_id', entityId)
      .eq('user_id', user.id)
      .single()
    lockHash = data?.lock_hash ?? null
  } else {
    const { data } = await supabase
      .from('entries')
      .select('lock_hash')
      .eq('entry_id', entityId)
      .single()
    lockHash = data?.lock_hash ?? null
  }

  if (!lockHash) return { error: 'No lock configured' }
  if (!verifySecret(secret, lockHash)) return { error: 'Incorrect PIN or password' }

  return { success: true }
}

/** Set or clear the lock on a journal or entry. */
export async function setLock(
  entityId: string,
  entityType: 'journal' | 'entry',
  lockType: 'none' | 'pin' | 'password',
  secret?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const lockHash =
    lockType !== 'none' && secret ? hashSecret(secret) : null

  if (entityType === 'journal') {
    const { error } = await supabase
      .from('journals')
      .update({ lock_type: lockType, lock_hash: lockHash })
      .eq('journal_id', entityId)
      .eq('user_id', user.id)
    if (error) return { error: error.message }
    revalidatePath('/journals')
  } else {
    const { error } = await supabase
      .from('entries')
      .update({ lock_type: lockType, lock_hash: lockHash })
      .eq('entry_id', entityId)
    if (error) return { error: error.message }
    revalidatePath('/journals', 'layout')
  }

  return { success: true }
}

