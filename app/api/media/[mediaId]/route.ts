import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Extract the storage object key (everything after `/object/public/media/`)
 * from a Supabase Storage public URL. Returns null if the URL doesn't match
 * the expected shape — caller should bail rather than nuking the wrong path.
 */
function extractStoragePath(fileUrl: string): string | null {
  const marker = '/object/public/media/'
  const idx = fileUrl.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(fileUrl.slice(idx + marker.length))
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch row + ownership join in one shot. RLS would also block, but we
  // distinguish 404 vs 403 explicitly so the client can show useful errors.
  const { data: row } = await supabase
    .from('media')
    .select('media_id, file_url, entries!inner(journal_id, journals!inner(user_id))')
    .eq('media_id', mediaId)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The PostgREST embed gives us a nested object — type-narrow to read user_id.
  const ownerId =
    (row as unknown as {
      entries: { journals: { user_id: string } }
    }).entries?.journals?.user_id

  if (ownerId !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const objectPath = extractStoragePath(row.file_url)
  if (objectPath) {
    await supabase.storage.from('media').remove([objectPath])
  }

  const { error: deleteError } = await supabase
    .from('media')
    .delete()
    .eq('media_id', mediaId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
