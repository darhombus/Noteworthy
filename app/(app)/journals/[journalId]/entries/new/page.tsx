import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
import { publicScope } from '@/lib/data/scope'
import type { Database } from '@/types/supabase'

type Json = Database['public']['Tables']['entries']['Insert']['content']

interface NewEntryPageProps {
  params: Promise<{ journalId: string }>
}

export default async function NewEntryPage({ params }: NewEntryPageProps) {
  const { journalId } = await params
  const userId = await getCurrentUserId()
  if (!userId) redirect('/login')
  const supabase = await createClient()

  // Verify the parent journal is reachable on the public surface — that is,
  // owned by the user, not deleted, and not hidden. Hidden journals have
  // their own /hidden/<jid> shell and shouldn't accept new public entries.
  const scope = await publicScope(userId)
  const journal = await scope.journals.byId(journalId)
  if (!journal) notFound()

  const today = new Date().toISOString().split('T')[0]

  // Seed the doc with a single empty paragraph rather than relying on the
  // bare `{type:'doc',content:[]}` default. ProseMirror's StarterKit schema
  // requires `doc` to contain `block+` (at least one block node), so without
  // a paragraph the very first click into the editor would dispatch a real
  // transaction inserting one — that fires Tiptap's `update` event, flips
  // autosave to 'pending', and writes back a paragraph the user never typed.
  // Pre-populating it makes mount + first focus a true no-op.
  const seedContent = { type: 'doc', content: [{ type: 'paragraph' }] }

  const { data: entry, error } = await supabase
    .from('entries')
    .insert({
      journal_id: journalId,
      entry_date: today,
      content: seedContent as unknown as Json,
    })
    .select('entry_id')
    .single()

  if (error || !entry) {
    console.error('[new entry] insert failed:', error?.message)
    redirect(`/journals/${journalId}`)
  }

  redirect(`/journals/${journalId}/entries/${entry.entry_id}`)
}
