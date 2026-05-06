import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import StandaloneHiddenList, {
  type StandaloneHiddenEntry,
} from '@/components/hidden/StandaloneHiddenList'
import LiveDataRefresh from '@/components/LiveDataRefresh'

interface RawEntryTag {
  entry_id: string
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function StandaloneHiddenPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Vault must be open. If it isn't, bounce to /hidden where the user
  // either sets up a vault or unlocks an existing one. Same gate as the
  // /hidden/<jid> page so the standalone listing can never be reached
  // through a stale tab once the vault auto-locks.
  if (!(await isVaultOpen(user.id))) redirect('/hidden')

  const scope = await hiddenScope(user.id)
  const standaloneEntries = await scope.entries.standalone()

  // Pull parent-journal title + color and entry tags in two parallel
  // queries keyed off the entry/journal IDs we just received. Doing this
  // server-side means StandaloneHiddenList can render every card with
  // its source journal label without paying an N+1 cost.
  const journalIds = Array.from(
    new Set(standaloneEntries.map((e) => e.journal_id)),
  )
  const entryIds = standaloneEntries.map((e) => e.entry_id)

  const [{ data: parents }, { data: rawEntryTags }] = await Promise.all([
    supabase
      .from('journals')
      .select('journal_id, title, color')
      .in(
        'journal_id',
        journalIds.length > 0 ? journalIds : ['00000000-0000-0000-0000-000000000000'],
      ),
    supabase
      .from('entry_tags')
      .select('entry_id, tags(tag_id, tag_name, color)')
      .in(
        'entry_id',
        entryIds.length > 0 ? entryIds : ['00000000-0000-0000-0000-000000000000'],
      ),
  ])

  const parentByJournal = new Map<string, { title: string; color: string }>()
  for (const row of parents ?? []) {
    parentByJournal.set(row.journal_id, {
      title: row.title,
      color: row.color ?? '#1976D2',
    })
  }

  const tagsByEntry = new Map<string, { tag_id: string; tag_name: string; color: string }[]>()
  for (const row of (rawEntryTags ?? []) as unknown as RawEntryTag[]) {
    if (!row.tags) continue
    const list = tagsByEntry.get(row.entry_id) ?? []
    list.push(row.tags)
    tagsByEntry.set(row.entry_id, list)
  }

  const decorated: StandaloneHiddenEntry[] = standaloneEntries.map((e) => {
    const parent = parentByJournal.get(e.journal_id)
    return {
      ...e,
      parentJournalTitle: parent?.title ?? 'Unknown journal',
      parentJournalColor: parent?.color ?? '#1976D2',
      tags: tagsByEntry.get(e.entry_id) ?? [],
    }
  })

  return (
    <>
      <LiveDataRefresh />
      <StandaloneHiddenList entries={decorated} />
    </>
  )
}
