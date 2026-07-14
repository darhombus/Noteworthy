import { redirect } from 'next/navigation'
import { getCurrentUserId, getCurrentVaultSecretType } from '@/lib/auth/server'
import { hiddenScope } from '@/lib/data/scope'
import { isVaultOpen } from '@/lib/privacy/vault'
import VaultSetupScreen from '@/components/privacy/VaultSetupScreen'
import VaultUnlockScreen from '@/components/privacy/VaultUnlockScreen'
import HiddenGrid from '@/components/hidden/HiddenGrid'

export default async function HiddenPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/login')

  // Fast path: when already unlocked, skip profile lookup entirely.
  if (await isVaultOpen(userId)) {
    const scope = await hiddenScope(userId)
    const [journals, standaloneEntries] = await Promise.all([
      scope.journals.list(),
      scope.entries.standalone(),
    ])

    return (
      <>
        <HiddenGrid
          hiddenJournals={journals}
          hasStandaloneHiddenEntries={standaloneEntries.length > 0}
          standaloneHiddenEntryCount={standaloneEntries.length}
        />
      </>
    )
  }

  // Closed vault path: fetch only the secret type (tiny query) instead of
  // loading the full profile payload.
  const secretType = await getCurrentVaultSecretType()
  if (!secretType) {
    return <VaultSetupScreen />
  }

  return <VaultUnlockScreen secretType={secretType} />
}
