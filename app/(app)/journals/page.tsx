import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import JournalGrid from '@/components/journals/JournalGrid'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export default async function JournalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: journals } = await supabase
    .from('journals')
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('is_favorite', { ascending: false })
    .order('updated_at', { ascending: false })

  return (
    <>
      <LiveDataRefresh />
      <JournalGrid journals={journals ?? []} />
    </>
  )
}
