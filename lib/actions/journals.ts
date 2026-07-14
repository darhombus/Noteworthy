'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { clearHotCache } from '@/lib/perf/hot-cache'

/** Drop scope.journals.{list,byId} hot-cache entries for both surfaces.
 *  Called after every journal write so the 30s journals.list TTL never
 *  hides a fresh edit. Prefix covers both `journals.list` and
 *  `journals.byId:<uuid>` keys under either surface. */
function clearJournalScopeCaches(userId: string): void {
  clearHotCache(`scope:public:${userId}:journals`)
  clearHotCache(`scope:hidden:${userId}:journals`)
}
import {
  createJournalSchema,
  updateJournalSchema,
  type CreateJournalInput,
  type UpdateJournalInput,
} from '@/lib/validations/journals'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

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

  // A hidden journal can only be created once the user has a vault secret —
  // otherwise the row would never be reachable from the UI and we'd have
  // bypassed the same guard hideJournal enforces for an existing journal.
  if (parsed.data.is_hidden) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('vault_secret_type')
      .eq('user_id', user.id)
      .single()
    if (!profile?.vault_secret_type) {
      return { error: 'no_vault: Set up your vault first' }
    }
  }

  const { data: journal, error } = await supabase
    .from('journals')
    .insert({ ...parsed.data, user_id: user.id })
    .select()
    .single()

  if (error) return { error: error.message }

  clearJournalScopeCaches(user.id)
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

  // updateJournalSchema technically permits is_hidden, but toggling hidden
  // belongs to the dedicated hideJournal/unhideJournal flow (vault gate +
  // unlock requirement). Strip it here so updateJournal can only ever
  // change presentation fields.
  const { is_hidden: _ignored, ...presentationFields } = parsed.data
  void _ignored

  const { data: journal, error } = await supabase
    .from('journals')
    .update(presentationFields)
    .eq('journal_id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return { error: error.message }

  clearJournalScopeCaches(user.id)
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

  // Cascade: soft-delete all active entries first so the rollup trigger
  // (trg_journals_rollup_update) zeroes out journals.entry_count /
  // total_word_count, and so dashboard/analytics queries which filter on
  // deleted_at IS NULL correctly exclude them.
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

  // Cascade-deleting the journal also cascade-deletes its entries server-
  // side, so any cached entry rows / lists for this user are stale too.
  // Cheaper to wipe the whole scope prefix for this user than to enumerate
  // every affected key.
  clearHotCache(`scope:public:${user.id}`)
  clearHotCache(`scope:hidden:${user.id}`)
  revalidatePath('/journals')
  revalidatePath('/hidden')
  // The cascade above moved every entry in the journal out of the public
  // scope, which changes Tags usage_count, Dashboard aggregates,
  // Analytics rollups, and the Recycle Bin listing. Force-refresh each
  // one so they don't briefly keep showing the deleted journal's data.
  revalidatePath('/tags')
  revalidatePath('/dashboard')
  revalidatePath('/analytics')
  revalidatePath('/recycle-bin')
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

  clearJournalScopeCaches(user.id)
  revalidatePath('/journals')
  revalidatePath('/hidden')
  return { success: true }
}
