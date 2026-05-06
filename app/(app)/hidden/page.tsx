import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import VaultSetupScreen from '@/components/privacy/VaultSetupScreen'
import VaultUnlockScreen from '@/components/privacy/VaultUnlockScreen'
import HiddenGrid from '@/components/hidden/HiddenGrid'
import LiveDataRefresh from '@/components/LiveDataRefresh'

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
  // The grid surfaces:
  //   1. Hidden journals (all rows where journals.is_hidden=true)
  //   2. The synthetic SystemJournalCard, iff there's at least one entry
  //      with entry.is_hidden=true AND parent_journal.is_hidden=false.
  const scope = await hiddenScope(user.id)
  const [journals, standaloneEntries] = await Promise.all([
    scope.journals.list(),
    scope.entries.standalone(),
  ])

  return (
    <>
      <LiveDataRefresh />
      <HiddenGrid
        hiddenJournals={journals}
        hasStandaloneHiddenEntries={standaloneEntries.length > 0}
        standaloneHiddenEntryCount={standaloneEntries.length}
      />
    </>
  )
}
