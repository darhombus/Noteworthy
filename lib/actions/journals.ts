'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createJournalSchema,
  updateJournalSchema,
  type CreateJournalInput,
  type UpdateJournalInput,
} from '@/lib/validations/journals'
import { hashSecret } from '@/lib/utils/lockCrypto'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

export async function createJournal(
  data: CreateJournalInput,
  lockSecret?: string,
): Promise<{ journal: Journal } | { error: string }> {
  const parsed = createJournalSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const lockHash =
    parsed.data.lock_type !== 'none' && lockSecret ? hashSecret(lockSecret) : null

  const { data: journal, error } = await supabase
    .from('journals')
    .insert({ ...parsed.data, user_id: user.id, lock_hash: lockHash })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/journals')
  return { journal }
}

export async function updateJournal(
  id: string,
  data: UpdateJournalInput,
  lockSecret?: string,
): Promise<{ journal: Journal } | { error: string }> {
  const parsed = updateJournalSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Only update lock_hash when lock_type is being set and a new secret is supplied.
  // If lock_type is 'none', clear the hash. If lock_type changes but no new secret
  // is provided (e.g. edit without changing the lock), leave lock_hash as-is.
  const lockUpdate: { lock_hash?: string | null } = {}
  if (parsed.data.lock_type === 'none') {
    lockUpdate.lock_hash = null
  } else if (parsed.data.lock_type && lockSecret) {
    lockUpdate.lock_hash = hashSecret(lockSecret)
  }

  const { data: journal, error } = await supabase
    .from('journals')
    .update({ ...parsed.data, ...lockUpdate })
    .eq('journal_id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/journals')
  return { journal }
}

export async function deleteJournal(
  id: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date().toISOString()

  // Cascade: soft-delete all active entries first so that the DB trigger
  // (trg_journals_rollup_update) fires and zeroes out journals.entry_count /
  // total_word_count, and so that dashboard/analytics queries which filter
  // entries on deleted_at IS NULL correctly exclude them.
  const { error: entriesError } = await supabase
    .from('entries')
    .update({ deleted_at: now })
    .eq('journal_id', id)
    .is('deleted_at', null)

  if (entriesError) return { error: entriesError.message }

  const { error } = await supabase
    .from('journals')
    .update({ deleted_at: now })
    .eq('journal_id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/journals')
  return { success: true }
}

export async function toggleFavourite(
  id: string,
  currentValue: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('journals')
    .update({ is_favorite: !currentValue })
    .eq('journal_id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/journals')
  return { success: true }
}
