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
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

// Journal data actions never touch lock_type / lock_hash — that is owned
// exclusively by `setLock` in lib/actions/lock.ts. Keeping them disjoint
// guarantees that updating a journal's title/colour/etc. can never silently
// clear its lock.

export async function createJournal(
  data: CreateJournalInput,
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

  const { data: journal, error } = await supabase
    .from('journals')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/journals')
  revalidatePath('/hidden')
  return { journal }
}

export async function updateJournal(
  id: string,
  data: UpdateJournalInput,
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

  const { data: journal, error } = await supabase
    .from('journals')
    .update({ ...parsed.data })
    .eq('journal_id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return { error: error.message }

  revalidatePath('/journals')
  revalidatePath('/hidden')
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
  //
  // Read each entry's lock fields so we can write them back explicitly on the
  // update. Without this, lock_type (DEFAULT 'none') can be silently reset on
  // some Supabase client versions, causing restored entries to lose their lock.
  const { data: entriesToDelete, error: entriesReadError } = await supabase
    .from('entries')
    .select('entry_id, lock_type, lock_hash')
    .eq('journal_id', id)
    .is('deleted_at', null)

  if (entriesReadError) return { error: entriesReadError.message }

  if (entriesToDelete && entriesToDelete.length > 0) {
    const results = await Promise.all(
      entriesToDelete.map((e) =>
        supabase
          .from('entries')
          .update({
            deleted_at: now,
            lock_type: e.lock_type,
            lock_hash: e.lock_hash,
          })
          .eq('entry_id', e.entry_id),
      ),
    )
    const firstError = results.find((r) => r.error)?.error
    if (firstError) return { error: firstError.message }
  }

  // Read the journal's lock fields (journal lock + shared entry lock) and
  // write them back on the soft-delete update so a column with a server-side
  // DEFAULT isn't silently reset on some Supabase client versions.
  const { data: journalLock, error: journalReadError } = await supabase
    .from('journals')
    .select('lock_type, lock_hash, entry_lock_type, entry_lock_hash')
    .eq('journal_id', id)
    .eq('user_id', user.id)
    .single()

  if (journalReadError) return { error: journalReadError.message }

  const { error } = await supabase
    .from('journals')
    .update({
      deleted_at: now,
      lock_type: journalLock.lock_type,
      lock_hash: journalLock.lock_hash,
      entry_lock_type: journalLock.entry_lock_type,
      entry_lock_hash: journalLock.entry_lock_hash,
    })
    .eq('journal_id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/journals')
  revalidatePath('/hidden')
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
  revalidatePath('/hidden')
  return { success: true }
}
