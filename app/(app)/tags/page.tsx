import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
import { getPerfTraceId, timePerf } from '@/lib/perf/server'
import TagManagementClient from '@/components/tags/TagManagementClient'

export interface TagEntryRef {
  entry_id: string
  title: string | null
  journal_id: string
}

export default async function TagsPage() {
  const trace = await getPerfTraceId()
  return timePerf(
    'page.tags.total',
    async () => {
      const userId = await getCurrentUserId()
      if (!userId) redirect('/login')
      const supabase = await createClient()

      const [{ data: tags }, { data: entryTagRows }] = await timePerf(
        'page.tags.main_queries',
        () =>
          Promise.all([
            supabase
              .from('tags')
              .select('tag_id, tag_name, color, usage_count')
              .gt('usage_count', 0)
              .order('usage_count', { ascending: false })
              .order('tag_name', { ascending: true }),
            supabase
              .from('entry_tags')
              .select(
                'tag_id, entries!inner(entry_id, title, journal_id, is_hidden, journals!inner(user_id, is_hidden))',
              )
              .eq('entries.is_hidden', false)
              .eq('entries.journals.user_id', userId)
              .eq('entries.journals.is_hidden', false),
          ]),
        { trace, userId },
      )

      const tagList = tags ?? []

      const tagEntriesMap: Record<string, TagEntryRef[]> = {}
      for (const row of entryTagRows ?? []) {
        const entry = row.entries as unknown as {
          entry_id: string
          title: string | null
          journal_id: string
          journals?: { user_id: string; is_hidden: boolean } | null
        } | null
        if (!entry) continue
        if (!tagEntriesMap[row.tag_id]) tagEntriesMap[row.tag_id] = []
        tagEntriesMap[row.tag_id].push({
          entry_id: entry.entry_id,
          title: entry.title,
          journal_id: entry.journal_id,
        })
      }

      return (
        <div className="p-6 max-w-[900px] mx-auto">
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
    },
    { trace },
  )
}
