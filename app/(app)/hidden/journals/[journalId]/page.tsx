import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EntryList from '@/components/entries/EntryList'
import LiveDataRefresh from '@/components/LiveDataRefresh'
import LockGate from '@/components/lock/LockGate'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'
import { isVaultOpen } from '@/lib/privacy/vault'
import type { UserPreferences } from '@/lib/actions/settings'

export const dynamic = 'force-dynamic'

interface HiddenJournalPageProps {
  params: Promise<{ journalId: string }>
}

interface RawEntryTag {
  tags: { tag_id: string; tag_name: string; color: string } | null
}

/**
 * Hidden-journal detail page. Only renders when the Privacy Vault is open
 * AND the target journal is actually marked is_hidden. Individually-hidden
 * entries still don't show in this list (those live at /hidden/entries);
 * a hidden journal's non-hidden children are what's surfaced here.
 */
export default async function HiddenJournalPage({ params }: HiddenJournalPageProps) {
  const { journalId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isVaultOpen(user.id))) redirect('/hidden')

  const [{ data: journal }, { data: rawEntries }, { data: profile }] = await Promise.all([
    supabase
      .from('journals')
      .select('*')
      .eq('journal_id', journalId)
      .eq('user_id', user.id)
      .eq('is_hidden', true)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('entries')
      .select('*, entry_tags(tags(tag_id, tag_name, color))')
      .eq('journal_id', journalId)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('entry_date', { ascending: false }),
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

  const entries = (rawEntries ?? []).map((entry) => {
    const { entry_tags, ...rest } = entry as unknown as (typeof entry & { entry_tags: RawEntryTag[] })
    const tags = (entry_tags ?? ([] as RawEntryTag[]))
      .map((et: RawEntryTag) => et.tags)
      .filter((t: RawEntryTag['tags']): t is { tag_id: string; tag_name: string; color: string } => t !== null)
    return { ...rest, tags }
  })

  return (
    <>
      <LiveDataRefresh />
      <BreadcrumbTitle id={journal.journal_id} title={journal.title} />
      <LockGate
        lockType={journal.lock_type as 'none' | 'pin' | 'password'}
        entityId={journal.journal_id}
        entityType="journal"
        entityName={journal.title}
        autoLockMinutes={autoLockMinutes}
      >
        <EntryList journal={journal} entries={entries} />
      </LockGate>
    </>
  )
}
