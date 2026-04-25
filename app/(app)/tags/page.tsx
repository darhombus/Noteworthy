import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TagManagementClient from '@/components/tags/TagManagementClient'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export interface TagEntryRef {
  entry_id: string
  title: string | null
  journal_id: string
}

export default async function TagsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Exclude entries that are themselves hidden, or whose parent journal is
  // hidden — both should be invisible from the tag detail view.
  const { data: hiddenJournalRows } = await supabase
    .from('journals')
    .select('journal_id')
    .eq('user_id', user.id)
    .eq('is_hidden', true)
  const hiddenJournalIds = new Set(
    (hiddenJournalRows ?? []).map((r) => r.journal_id),
  )

  const [{ data: tags }, { data: entryTagRows }] = await Promise.all([
    supabase
      .from('tags')
      .select('tag_id, tag_name, color, usage_count')
      .order('usage_count', { ascending: false })
      .order('tag_name', { ascending: true }),
    supabase
      .from('entry_tags')
      .select('tag_id, entries!inner(entry_id, title, journal_id, is_hidden)')
      .eq('entries.is_hidden', false),
  ])

  const tagList = tags ?? []

  // Build map: tag_id → list of entries
  const tagEntriesMap: Record<string, TagEntryRef[]> = {}
  for (const row of entryTagRows ?? []) {
    const entry = row.entries as unknown as {
      entry_id: string
      title: string | null
      journal_id: string
    } | null
    if (!entry) continue
    if (hiddenJournalIds.has(entry.journal_id)) continue
    if (!tagEntriesMap[row.tag_id]) tagEntriesMap[row.tag_id] = []
    tagEntriesMap[row.tag_id].push({
      entry_id: entry.entry_id,
      title: entry.title,
      journal_id: entry.journal_id,
    })
  }

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <LiveDataRefresh />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ letterSpacing: '-0.4px' }}>
            Tags
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            {tagList.length} {tagList.length === 1 ? 'tag' : 'tags'}
          </p>
        </div>
      </div>

      <TagManagementClient initialTags={tagList} tagEntriesMap={tagEntriesMap} />
    </div>
  )
}
