import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import EntryEditor from '@/components/entries/EntryEditor'
import BreadcrumbTitle from '@/components/layout/BreadcrumbTitle'

interface StandalonePageProps {
  params: Promise<{ entryId: string }>
}

interface RawEntryTag {
  tags: { tag_id: string; tag_name: string; color: string } | null
}

export default async function HiddenStandaloneEntryPage({ params }: StandalonePageProps) {
  const { entryId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isVaultOpen(user.id))) redirect('/hidden')

  // hiddenScope.entries.byId accepts entries that are themselves hidden
  // OR live in a hidden journal. We then load the parent journal
  // separately (via the unfiltered journals table) because a standalone
  // hidden entry's parent is, by definition, public — it would be
  // invisible to scope.journals.byId('hidden').
  const scope = await hiddenScope(user.id)
  const entry = await scope.entries.byId(entryId)
  if (!entry) notFound()

  const { data: journal } = await supabase
    .from('journals')
    .select('journal_id, title, color, is_hidden')
    .eq('journal_id', entry.journal_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!journal) notFound()

  const { data: rawEntryTags } = await supabase
    .from('entry_tags')
    .select('tags(tag_id, tag_name, color)')
    .eq('entry_id', entryId)

  const initialTags = ((rawEntryTags ?? []) as unknown as RawEntryTag[])
    .map((et) => et.tags)
    .filter((t): t is { tag_id: string; tag_name: string; color: string } => t !== null)

  return (
    <>
      <BreadcrumbTitle id={entry.entry_id} title={entry.title?.trim() || 'Untitled'} />
      <EntryEditor
        key={entry.entry_id}
        entry={entry}
        journal={journal}
        initialTags={initialTags}
      />
    </>
  )
}
