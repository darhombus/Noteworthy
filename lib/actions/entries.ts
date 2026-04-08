'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  createEntrySchema,
  updateEntrySchema,
  type CreateEntryInput,
  type UpdateEntryInput,
} from '@/lib/validations/entries'
import { EMPTY_TIPTAP_DOC } from '@/lib/types/tiptap'
import type { Database } from '@/types/supabase'

type Json = Database['public']['Tables']['entries']['Insert']['content']

export async function createEntry(
  data: CreateEntryInput,
): Promise<{ entry_id: string } | { error: string }> {
  const parsed = createEntrySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: entry, error } = await supabase
    .from('entries')
    .insert({
      journal_id: parsed.data.journal_id,
      title: parsed.data.title ?? null,
      content: (parsed.data.content ?? EMPTY_TIPTAP_DOC) as unknown as Json,
      entry_date: parsed.data.entry_date,
    })
    .select('entry_id')
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/journals/${parsed.data.journal_id}`)
  return { entry_id: entry.entry_id }
}

export async function updateEntry(
  id: string,
  data: UpdateEntryInput,
  clientUpdatedAt: string,
  force = false,
): Promise<{ success: true; updated_at: string } | { conflict: true } | { error: string }> {
  const parsed = updateEntrySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!force) {
    const { data: current } = await supabase
      .from('entries')
      .select('updated_at')
      .eq('entry_id', id)
      .single()

    if (!current) return { error: 'Entry not found' }

    const dbTime = new Date(current.updated_at).getTime()
    const clientTime = new Date(clientUpdatedAt).getTime()
    if (dbTime !== clientTime) return { conflict: true }
  }

  const { data: updated, error } = await supabase
    .from('entries')
    .update({
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.entry_date !== undefined && { entry_date: parsed.data.entry_date }),
      ...(parsed.data.is_pinned !== undefined && { is_pinned: parsed.data.is_pinned }),
      ...(parsed.data.content != null && { content: parsed.data.content as Json }),
    })
    .eq('entry_id', id)
    .select('updated_at')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/journals', 'layout')
  return { success: true, updated_at: updated.updated_at }
}

export async function softDeleteEntry(
  id: string,
  journalId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('entry_id', id)

  if (error) return { error: error.message }

  revalidatePath(`/journals/${journalId}`)
  return { success: true }
}

export async function togglePin(
  id: string,
  currentValue: boolean,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('entries')
    .update({ is_pinned: !currentValue })
    .eq('entry_id', id)

  if (error) return { error: error.message }

  return { success: true }
}
