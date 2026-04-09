'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Extract the storage object key (everything after `/object/public/media/`)
 * from a Supabase Storage public URL. Returns null if the URL doesn't match
 * the expected shape.
 */
function extractStoragePath(fileUrl: string): string | null {
  const marker = '/object/public/media/'
  const idx = fileUrl.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(fileUrl.slice(idx + marker.length))
}

/**
 * Hard-delete every media row attached to an entry, removing the underlying
 * Storage objects first. Called by the recycle bin permanent-delete flow
 * (Module 5.2). RLS already guards ownership; callers must still verify the
 * entry belongs to the user before invoking.
 */
export async function deleteEntryMedia(entryId: string): Promise<void> {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('media')
    .select('media_id, file_url')
    .eq('entry_id', entryId)

  if (!rows || rows.length === 0) return

  const paths = rows
    .map((row) => extractStoragePath(row.file_url))
    .filter((p): p is string => p !== null)

  if (paths.length > 0) {
    await supabase.storage.from('media').remove(paths)
  }

  await supabase.from('media').delete().eq('entry_id', entryId)
}
