'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createTagSchema, updateTagSchema } from '@/lib/validations/tags'
import type { CreateTagInput, UpdateTagInput } from '@/lib/validations/tags'

async function getSession() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  return { supabase, session }
}

export async function createTag(data: CreateTagInput) {
  const parsed = createTagSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  }

  const { supabase, session } = await getSession()

  const { data: tag, error } = await supabase
    .from('tags')
    .insert({ ...parsed.data, user_id: session.user.id })
    .select('tag_id, tag_name, color, usage_count')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'A tag with this name already exists' }
    }
    console.error('[createTag]', error)
    return { error: 'Failed to create tag' }
  }

  revalidatePath('/tags')
  return { tag }
}

export async function updateTag(tagId: string, data: UpdateTagInput) {
  const parsed = updateTagSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? 'Invalid input' }
  }

  const { supabase, session } = await getSession()

  const { data: tag, error } = await supabase
    .from('tags')
    .update(parsed.data)
    .eq('tag_id', tagId)
    .eq('user_id', session.user.id)
    .select('tag_id, tag_name, color, usage_count')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'A tag with this name already exists' }
    }
    console.error('[updateTag]', error)
    return { error: 'Failed to update tag' }
  }

  if (!tag) return { error: 'Tag not found' }

  revalidatePath('/tags')
  return { tag }
}

export async function deleteTag(tagId: string) {
  const { supabase, session } = await getSession()

  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('tag_id', tagId)
    .eq('user_id', session.user.id)

  if (error) {
    console.error('[deleteTag]', error)
    return { error: 'Failed to delete tag' }
  }

  revalidatePath('/tags')
  revalidatePath('/journals', 'layout')
  return { success: true }
}

const uuidSchema = z.string().uuid()

export async function mergeTags(sourceTagId: string, destinationTagId: string) {
  if (!uuidSchema.safeParse(sourceTagId).success || !uuidSchema.safeParse(destinationTagId).success) {
    return { error: 'Invalid tag IDs' }
  }

  const { supabase, session } = await getSession()

  // Verify both tags belong to the current user
  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select('tag_id')
    .eq('user_id', session.user.id)
    .in('tag_id', [sourceTagId, destinationTagId])

  if (tagsError || !tags || tags.length !== 2) {
    return { error: 'Tag not found' }
  }

  // Get all entry_ids with the source tag
  const { data: sourceRows, error: fetchError } = await supabase
    .from('entry_tags')
    .select('entry_id')
    .eq('tag_id', sourceTagId)

  if (fetchError) {
    console.error('[mergeTags] fetch source rows', fetchError)
    return { error: 'Failed to merge tags' }
  }

  const entryIds = (sourceRows ?? []).map((r) => r.entry_id)

  // Delete source tag rows from entry_tags
  const { error: deleteRowsError } = await supabase
    .from('entry_tags')
    .delete()
    .eq('tag_id', sourceTagId)

  if (deleteRowsError) {
    console.error('[mergeTags] delete source rows', deleteRowsError)
    return { error: 'Failed to merge tags' }
  }

  // Upsert destination tag for those entries (ON CONFLICT DO NOTHING)
  if (entryIds.length > 0) {
    const { error: upsertError } = await supabase
      .from('entry_tags')
      .upsert(
        entryIds.map((entry_id) => ({ entry_id, tag_id: destinationTagId })),
        { onConflict: 'entry_id,tag_id', ignoreDuplicates: true },
      )

    if (upsertError) {
      console.error('[mergeTags] upsert destination', upsertError)
      return { error: 'Failed to merge tags' }
    }
  }

  // Delete the source tag
  const { error: deleteTagError } = await supabase
    .from('tags')
    .delete()
    .eq('tag_id', sourceTagId)
    .eq('user_id', session.user.id)

  if (deleteTagError) {
    console.error('[mergeTags] delete source tag', deleteTagError)
    return { error: 'Failed to merge tags' }
  }

  revalidatePath('/tags')
  revalidatePath('/journals', 'layout')
  return { success: true }
}

export async function addTagToEntry(entryId: string, tagId: string) {
  const { supabase, session } = await getSession()

  // Verify entry belongs to user via journal ownership chain
  const { data: entry } = await supabase
    .from('entries')
    .select('entry_id, journal_id')
    .eq('entry_id', entryId)
    .is('deleted_at', null)
    .single()

  if (!entry) return { error: 'Entry not found' }

  const { data: journal } = await supabase
    .from('journals')
    .select('journal_id')
    .eq('journal_id', entry.journal_id)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .single()

  if (!journal) return { error: 'Entry not found' }

  const { error } = await supabase
    .from('entry_tags')
    .upsert({ entry_id: entryId, tag_id: tagId }, { onConflict: 'entry_id,tag_id', ignoreDuplicates: true })

  if (error) {
    console.error('[addTagToEntry]', error)
    return { error: 'Failed to add tag' }
  }

  revalidatePath('/journals', 'layout')
  return { success: true }
}

export async function removeTagFromEntry(entryId: string, tagId: string) {
  const { supabase, session } = await getSession()

  // Verify entry belongs to user via journal ownership chain
  const { data: entry } = await supabase
    .from('entries')
    .select('entry_id, journal_id')
    .eq('entry_id', entryId)
    .is('deleted_at', null)
    .single()

  if (!entry) return { error: 'Entry not found' }

  const { data: journal } = await supabase
    .from('journals')
    .select('journal_id')
    .eq('journal_id', entry.journal_id)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .single()

  if (!journal) return { error: 'Entry not found' }

  const { error } = await supabase
    .from('entry_tags')
    .delete()
    .eq('entry_id', entryId)
    .eq('tag_id', tagId)

  if (error) {
    console.error('[removeTagFromEntry]', error)
    return { error: 'Failed to remove tag' }
  }

  // Auto-delete the tag if it is no longer attached to any entry
  const { count } = await supabase
    .from('entry_tags')
    .select('*', { count: 'exact', head: true })
    .eq('tag_id', tagId)

  if (count === 0) {
    await supabase
      .from('tags')
      .delete()
      .eq('tag_id', tagId)
      .eq('user_id', session.user.id)
    revalidatePath('/tags')
  }

  revalidatePath('/journals', 'layout')
  return { success: true }
}
