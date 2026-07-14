import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import EntryList from '@/components/entries/EntryList'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'

interface JournalPageProps {
  params: Promise<{ journalId: string }>
}

interface RawEntryTag {
  entry_id: string
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function HiddenJournalPage({ params }: JournalPageProps) {
  const { journalId } = await params
  const userId = await getCurrentUserId()
  if (!userId) redirect('/login')
  const supabase = await createClient()

  // Vault must be open. If it isn't, bounce to /hidden where the user
  // either sets up a vault or unlocks an existing one.
  if (!(await isVaultOpen(userId))) redirect('/hidden')

  const scope = await hiddenScope(userId)
  const [journal, entries] = await Promise.all([
    scope.journals.byId(journalId),
    scope.entries.listByJournal(journalId),
  ])
  if (!journal) notFound()
  const entryIds = entries.map((e) => e.entry_id)
  const { data: rawEntryTags } = entryIds.length
    ? await supabase
        .from('entry_tags')
        .select('entry_id, tags(tag_id, tag_name, color)')
        .in('entry_id', entryIds)
    : { data: [] as RawEntryTag[] }

  const tagsByEntry = new Map<string, { tag_id: string; tag_name: string; color: string }[]>()
  for (const row of (rawEntryTags ?? []) as unknown as RawEntryTag[]) {
    if (!row.tags) continue
    const list = tagsByEntry.get(row.entry_id) ?? []
    list.push(row.tags)
    tagsByEntry.set(row.entry_id, list)
  }

  const entriesWithTags = entries.map((e) => ({
    ...e,
    tags: tagsByEntry.get(e.entry_id) ?? [],
  }))

  return (
    <>
      <BreadcrumbTitle id={journal.journal_id} title={journal.title} />
      <EntryList journal={journal} entries={entriesWithTags} />
    </>
  )
}
