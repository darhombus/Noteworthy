import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { publicScope } from '@/lib/data/scope'
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

  // Verify the parent journal is reachable on the public surface — that is,
  // owned by the user, not deleted, and not hidden. Hidden journals have
  // their own /hidden/<jid> shell and shouldn't accept new public entries.
  const scope = await publicScope(user.id)
  const journal = await scope.journals.byId(journalId)
  if (!journal) notFound()

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
