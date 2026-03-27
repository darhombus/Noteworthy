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
    .update(parsed.data)
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

  const { error } = await supabase
    .from('journals')
    .update({ deleted_at: new Date().toISOString() })
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
