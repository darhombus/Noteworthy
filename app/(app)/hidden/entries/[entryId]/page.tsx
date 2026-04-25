import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntryEditor from '@/components/entries/EntryEditor'
import LockGate from '@/components/lock/LockGate'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'
import { isVaultOpen } from '@/lib/privacy/vault'
import type { UserPreferences } from '@/lib/actions/settings'

export const dynamic = 'force-dynamic'

interface HiddenEntryPageProps {
  params: Promise<{ entryId: string }>
}

interface RawEntryTag {
  tags: { tag_id: string; tag_name: string; color: string } | null
}

/**
 * Editor route for an individually-hidden entry, reached from the Entries
 * tab of /hidden. The entry itself must be is_hidden; its parent journal
 * can be anything. Breadcrumb is "Hidden > <entry>", with no leakage of
 * the parent journal's name/structure.
 *
 * The entry row is fetched with a plain `.select('*')` (no inline
 * `journals!inner(...)` join) so the shape EntryEditor receives is
 * byte-identical to the rows served by the other editor routes. The
 * cross-tab autosave echo filter compares `updated_at` strings literally,
 * so we never want the entry row to come back reshaped by a join.
 */
export default async function HiddenEntryPage({ params }: HiddenEntryPageProps) {
  const { entryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isVaultOpen(user.id))) redirect('/hidden')

  // Step 1 — fetch the hidden entry. RLS already scopes to this user.
  const { data: entry } = await supabase
    .from('entries')
    .select('*')
    .eq('entry_id', entryId)
    .eq('is_hidden', true)
    .is('deleted_at', null)
    .single()

  if (!entry) notFound()

  // Step 2 — fetch the parent journal and the rest of the sidecar data.
  const [{ data: journal }, { data: rawEntryTags }, { data: profile }] = await Promise.all([
    supabase
      .from('journals')
      .select('journal_id, title, color, entry_lock_type')
      .eq('journal_id', entry.journal_id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('entry_tags')
      .select('tags(tag_id, tag_name, color)')
      .eq('entry_id', entryId),
    supabase
      .from('profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .single(),
  ])

  if (!journal) notFound()

  const preferences: UserPreferences =
    profile?.preferences && typeof profile.preferences === 'object' && !Array.isArray(profile.preferences)
      ? (profile.preferences as UserPreferences)
      : {}
  const autoLockMinutes = preferences.autoLockMinutes ?? 5

  const initialTags = ((rawEntryTags ?? []) as unknown as RawEntryTag[])
    .map((et) => et.tags)
    .filter((t): t is { tag_id: string; tag_name: string; color: string } => t !== null)

  return (
    <>
      <BreadcrumbTitle id={entry.entry_id} title={entry.title?.trim() || 'Untitled'} />
      <LockGate
        lockType={entry.lock_type as 'none' | 'pin' | 'password'}
        entityId={entry.entry_id}
        entityType="entry"
        entityName={entry.title ?? undefined}
        autoLockMinutes={autoLockMinutes}
      >
        <EntryEditor
          key={entry.entry_id}
          entry={entry}
          journal={journal}
          initialTags={initialTags}
        />
      </LockGate>
    </>
  )
}
