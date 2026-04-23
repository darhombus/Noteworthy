import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntryEditor from '@/components/entries/EntryEditor'
import LockGate from '@/components/lock/LockGate'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'
import type { UserPreferences } from '@/lib/actions/settings'

interface EntryPageProps {
  params: Promise<{ journalId: string; entryId: string }>
}

interface RawEntryTag {
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function EntryPage({ params }: EntryPageProps) {
  const { journalId, entryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: entry },
    { data: journal },
    { data: rawEntryTags },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from('entries')
      .select('*')
      .eq('entry_id', entryId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('journals')
      .select('journal_id, title, color, entry_lock_type')
      .eq('journal_id', journalId)
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

  if (!entry || !journal) notFound()

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
      <BreadcrumbTitle id={journal.journal_id} title={journal.title} />
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
