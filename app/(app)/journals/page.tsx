import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { publicScope } from '@/lib/data/scope'
import JournalGrid from '@/components/journals/JournalGrid'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export default async function JournalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Public surface — only public journals. The split rollup trigger added
  // in migration 014 keeps `entry_count` in sync with the count of public,
  // non-deleted entries, so we no longer need to override it here.
  const scope = await publicScope(user.id)
  const journals = await scope.journals.list()

  // Re-sort with favourites first to match the original card grid order.
  const sorted = [...journals].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })

  return (
    <>
      <LiveDataRefresh />
      <JournalGrid journals={sorted} />
    </>
  )
}
