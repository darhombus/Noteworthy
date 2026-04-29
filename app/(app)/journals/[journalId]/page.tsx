import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { publicScope } from '@/lib/data/scope'
import EntryList from '@/components/entries/EntryList'
import LiveDataRefresh from '@/components/LiveDataRefresh'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'

interface JournalPageProps {
  params: Promise<{ journalId: string }>
}

interface RawEntryTag {
  entry_id: string
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function JournalPage({ params }: JournalPageProps) {
  const { journalId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Public route. publicScope rejects hidden journals + entries up front,
  // so a /journals/<hidden-id> URL 404s here without leaking metadata.
  const scope = await publicScope(user.id)
  const journal = await scope.journals.byId(journalId)
  if (!journal) notFound()

  const [entries, { data: rawEntryTags }] = await Promise.all([
    scope.entries.listByJournal(journalId),
    supabase.from('entry_tags').select('entry_id, tags(tag_id, tag_name, color)'),
  ])

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
      <LiveDataRefresh />
      <BreadcrumbTitle id={journal.journal_id} title={journal.title} />
      <EntryList journal={journal} entries={entriesWithTags} />
    </>
  )
}
