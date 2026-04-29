import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import VaultSetupScreen from '@/components/privacy/VaultSetupScreen'
import VaultUnlockScreen from '@/components/privacy/VaultUnlockScreen'
import HiddenView from '@/components/privacy/HiddenView'

type SecretType = 'pin' | 'password'

export default async function HiddenPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate 1 — does the user have a vault secret? If not, show the setup form.
  const { data: profile } = await supabase
    .from('profiles')
    .select('vault_secret_type')
    .eq('user_id', user.id)
    .single()

  const secretType = (profile?.vault_secret_type ?? null) as SecretType | null
  if (!secretType) {
    return <VaultSetupScreen />
  }

  // Gate 2 — vault must be open. Otherwise prompt for the secret.
  if (!(await isVaultOpen(user.id))) {
    return <VaultUnlockScreen secretType={secretType} />
  }

  // Both gates passed — fetch hidden surface data via hiddenScope.
  const scope = await hiddenScope(user.id)
  const [journals, standaloneEntries] = await Promise.all([
    scope.journals.list(),
    scope.entries.standalone(),
  ])

  // Parent-journal colour + entry tags both keyed off the standalone
  // entry id list. Tags weren't being loaded before, so the Entries tab
  // rendered EntryCards with `tags={[]}` — chips never appeared. Pull
  // them in alongside the parent colours so the rendering matches the
  // public surface card-for-card.
  const standaloneIds = standaloneEntries.map((e) => e.entry_id)
  const standaloneJournalIds = standaloneEntries.map((e) => e.journal_id)

  type EntryTagRow = {
    entry_id: string
    tags: { tag_id: string; tag_name: string; color: string } | null
  }

  const [{ data: parentColours }, { data: rawEntryTags }] = await Promise.all([
    supabase
      .from('journals')
      .select('journal_id, color')
      .in(
        'journal_id',
        standaloneJournalIds.length > 0
          ? standaloneJournalIds
          : ['00000000-0000-0000-0000-000000000000'],
      ),
    supabase
      .from('entry_tags')
      .select('entry_id, tags(tag_id, tag_name, color)')
      .in(
        'entry_id',
        standaloneIds.length > 0 ? standaloneIds : ['00000000-0000-0000-0000-000000000000'],
      ),
  ])

  const colourByJournal = new Map<string, string>()
  for (const row of parentColours ?? []) {
    if (row.color) colourByJournal.set(row.journal_id, row.color)
  }

  const tagsByEntry = new Map<string, { tag_id: string; tag_name: string; color: string }[]>()
  for (const row of (rawEntryTags ?? []) as unknown as EntryTagRow[]) {
    if (!row.tags) continue
    const list = tagsByEntry.get(row.entry_id) ?? []
    list.push(row.tags)
    tagsByEntry.set(row.entry_id, list)
  }

  const entriesWithColour = standaloneEntries.map((e) => ({
    ...e,
    parentJournalColor: colourByJournal.get(e.journal_id) ?? '#1976D2',
    tags: tagsByEntry.get(e.entry_id) ?? [],
  }))

  return <HiddenView journals={journals} standaloneEntries={entriesWithColour} />
}
