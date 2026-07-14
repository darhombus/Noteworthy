import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { deleteEntryMedia } from '@/lib/actions/media'

function extractAvatarPath(url: string | null): string | null {
  if (!url) return null
  const marker = '/object/public/avatars/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  // Strip query params (cache-busting ?t=...)
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

export async function POST() {
  try {
    // Authenticate the requesting user
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const userId = user.id

    // Admin client — bypasses RLS for cascaded deletes
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // 1. Fetch all journal IDs for the user
    const { data: journals } = await admin
      .from('journals')
      .select('journal_id')
      .eq('user_id', userId)

    const journalIds = (journals ?? []).map((j) => j.journal_id)

    // 2. Fetch all entry IDs across those journals
    let entryIds: string[] = []
    if (journalIds.length > 0) {
      const { data: entries } = await admin
        .from('entries')
        .select('entry_id')
        .in('journal_id', journalIds)
      entryIds = (entries ?? []).map((e) => e.entry_id)
    }

    // 3. Delete media storage objects for each entry. Fire them all in
    //    parallel — each call is its own Storage round-trip and they don't
    //    depend on each other.
    await Promise.all(entryIds.map((id) => deleteEntryMedia(id)))

    // 4. Delete avatar from Storage
    const { data: profile } = await admin
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', userId)
      .single()

    const avatarPath = extractAvatarPath(profile?.avatar_url ?? null)
    if (avatarPath) {
      await admin.storage.from('avatars').remove([avatarPath])
    }

    // 5. Delete data rows in dependency order
    if (entryIds.length > 0) {
      await admin.from('entry_tags').delete().in('entry_id', entryIds)
      await admin.from('entries').delete().in('entry_id', entryIds)
    }
    if (journalIds.length > 0) {
      await admin.from('journals').delete().in('journal_id', journalIds)
    }
    await admin.from('tags').delete().eq('user_id', userId)
    await admin.from('profiles').delete().eq('user_id', userId)

    // 6. Delete the auth user
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId)
    if (deleteUserError) {
      console.error('[account/delete] deleteUser error:', deleteUserError)
      return NextResponse.json({ error: deleteUserError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[account/delete] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
