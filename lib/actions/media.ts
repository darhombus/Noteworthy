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
 * Storage objects first. Handles both images and videos — for video rows the
 * associated thumbnail (stored at a /thumbnails/ path) is also removed from
 * Storage by parsing thumbnail_url.
 *
 * Called by the recycle bin permanent-delete flow (Module 5.2). RLS already
 * guards ownership; callers must still verify the entry belongs to the user
 * before invoking.
 */
export async function deleteEntryMedia(entryId: string): Promise<void> {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('media')
    .select('media_id, file_url, file_type, thumbnail_url')
    .eq('entry_id', entryId)

  if (!rows || rows.length === 0) return

  // Collect all storage object paths to remove:
  // - the main file (image or video)
  // - the thumbnail for video rows (separate storage object at /thumbnails/)
  const paths: string[] = []
  for (const row of rows) {
    const mainPath = extractStoragePath(row.file_url)
    if (mainPath) paths.push(mainPath)

    if (row.file_type === 'video' && row.thumbnail_url) {
      const thumbPath = extractStoragePath(row.thumbnail_url)
      if (thumbPath) paths.push(thumbPath)
    }
  }

  if (paths.length > 0) {
    await supabase.storage.from('media').remove(paths)
  }

  await supabase.from('media').delete().eq('entry_id', entryId)
}
