import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteEntryMedia } from '@/lib/actions/media'

export async function DELETE() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Empty bin only purges what the user can see in /recycle-bin — hidden
  // items are excluded so a malicious bystander with a session can't
  // silently destroy private data. The 30-day cron eventually purges
  // hidden+deleted items via the existing schedule in 001_initial_schema.
  const { data: hiddenJournalRows } = await supabase
    .from('journals')
    .select('journal_id')
    .eq('user_id', user.id)
    .eq('is_hidden', true)
  const hiddenJournalIds = (hiddenJournalRows ?? []).map((r) => r.journal_id)

  // Collect all visible soft-deleted entries across the user's journals
  let deletedEntriesQuery = supabase
    .from('entries')
    .select('entry_id, journals!inner(user_id)')
    .not('deleted_at', 'is', null)
    .eq('is_hidden', false)
  if (hiddenJournalIds.length > 0) {
    deletedEntriesQuery = deletedEntriesQuery.not(
      'journal_id',
      'in',
      `(${hiddenJournalIds.join(',')})`,
    )
  }
  const { data: deletedEntries, error: fetchError } = await deletedEntriesQuery

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch deleted entries' }, { status: 500 })
  }

  // Remove media for each deleted entry
  await Promise.all((deletedEntries ?? []).map((e) => deleteEntryMedia(e.entry_id)))

  // Hard-delete only the entries we just enumerated.
  const idsToDelete = (deletedEntries ?? []).map((e) => e.entry_id)
  if (idsToDelete.length > 0) {
    const { error: entriesDeleteError } = await supabase
      .from('entries')
      .delete()
      .in('entry_id', idsToDelete)

    if (entriesDeleteError) {
      return NextResponse.json({ error: 'Failed to delete entries' }, { status: 500 })
    }
  }

  // Hard-delete visible soft-deleted journals for this user
  const { error: journalsDeleteError } = await supabase
    .from('journals')
    .delete()
    .eq('user_id', user.id)
    .eq('is_hidden', false)
    .not('deleted_at', 'is', null)

  if (journalsDeleteError) {
    return NextResponse.json({ error: 'Failed to delete journals' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
