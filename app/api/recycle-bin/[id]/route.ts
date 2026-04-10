import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteEntryMedia } from '@/lib/actions/media'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { type?: unknown }
  try {
    body = (await request.json()) as { type?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = body.type
  if (type !== 'entry' && type !== 'journal') {
    return NextResponse.json({ error: 'type must be "entry" or "journal"' }, { status: 400 })
  }

  if (type === 'entry') {
    const { error } = await supabase
      .from('entries')
      .update({ deleted_at: null })
      .eq('entry_id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Restore the journal only. Entries that were soft-deleted alongside it
    // remain in the recycle bin as separate items so the user can choose to
    // restore or permanently delete each one individually.
    const { error: journalError } = await supabase
      .from('journals')
      .update({ deleted_at: null })
      .eq('journal_id', id)
      .eq('user_id', user.id)

    if (journalError) return NextResponse.json({ error: journalError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { type?: unknown }
  try {
    body = (await request.json()) as { type?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = body.type
  if (type !== 'entry' && type !== 'journal') {
    return NextResponse.json({ error: 'type must be "entry" or "journal"' }, { status: 400 })
  }

  if (type === 'entry') {
    await deleteEntryMedia(id)

    const { error } = await supabase.from('entries').delete().eq('entry_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Find all entries in the journal
    const { data: entries, error: fetchError } = await supabase
      .from('entries')
      .select('entry_id')
      .eq('journal_id', id)

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

    // Delete media for each entry
    await Promise.all((entries ?? []).map((e) => deleteEntryMedia(e.entry_id)))

    // Hard-delete all entries
    const { error: entriesDeleteError } = await supabase
      .from('entries')
      .delete()
      .eq('journal_id', id)

    if (entriesDeleteError) {
      return NextResponse.json({ error: entriesDeleteError.message }, { status: 500 })
    }

    // Hard-delete the journal
    const { error: journalDeleteError } = await supabase
      .from('journals')
      .delete()
      .eq('journal_id', id)
      .eq('user_id', user.id)

    if (journalDeleteError) {
      return NextResponse.json({ error: journalDeleteError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
