import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteEntryMedia } from '@/lib/actions/media'

export async function DELETE() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Collect all soft-deleted entries across the user's journals
  const { data: deletedEntries, error: fetchError } = await supabase
    .from('entries')
    .select('entry_id, journals!inner(user_id)')
    .not('deleted_at', 'is', null)

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch deleted entries' }, { status: 500 })
  }

  // Remove media for each deleted entry
  await Promise.all((deletedEntries ?? []).map((e) => deleteEntryMedia(e.entry_id)))

  // Hard-delete all soft-deleted entries
  const { error: entriesDeleteError } = await supabase
    .from('entries')
    .delete()
    .not('deleted_at', 'is', null)

  if (entriesDeleteError) {
    return NextResponse.json({ error: 'Failed to delete entries' }, { status: 500 })
  }

  // Hard-delete all soft-deleted journals for this user
  const { error: journalsDeleteError } = await supabase
    .from('journals')
    .delete()
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)

  if (journalsDeleteError) {
    return NextResponse.json({ error: 'Failed to delete journals' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
