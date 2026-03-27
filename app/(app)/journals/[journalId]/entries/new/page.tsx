import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/supabase'

type Json = Database['public']['Tables']['entries']['Insert']['content']

interface NewEntryPageProps {
  params: Promise<{ journalId: string }>
}

export default async function NewEntryPage({ params }: NewEntryPageProps) {
  const { journalId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  const { data: entry, error } = await supabase
    .from('entries')
    .insert({
      journal_id: journalId,
      entry_date: today,
      content: [] as unknown as Json,
    })
    .select('entry_id')
    .single()

  if (error || !entry) {
    console.error('[new entry] insert failed:', error?.message)
    redirect(`/journals/${journalId}`)
  }

  redirect(`/journals/${journalId}/entries/${entry.entry_id}`)
}
