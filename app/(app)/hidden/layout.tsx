import { getCurrentUserId } from '@/lib/auth/server'
import { readVaultSession } from '@/lib/privacy/vault'
import { SurfaceProvider } from '@/lib/surface'
import VaultIdleGuard from '@/components/privacy/VaultIdleGuard'

/**
 * Server component layout for /hidden/**.
 *
 * In addition to scoping the SurfaceProvider, it conditionally mounts
 * VaultIdleGuard — only when the vault is actually open — so user
 * activity slides the auto-lock window forward and a configured
 * inactivity period locks the vault automatically.
 *
 * The layout is re-rendered on navigation between hidden routes and on
 * `revalidatePath('/hidden')` after a (un)lock action, so the guard's
 * `autoLockMinutes` prop always reflects the latest profile value.
 */
export default async function HiddenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userId = await getCurrentUserId()

  let autoLockMinutes: number | null = null
  if (userId) {
    const vaultSession = await readVaultSession(userId)
    if (vaultSession) {
      autoLockMinutes = vaultSession.autoLockMinutes ?? 5
    }
  }

  return (
    <SurfaceProvider value="hidden">
      {autoLockMinutes !== null && (
        <VaultIdleGuard autoLockMinutes={autoLockMinutes} />
      )}
      {children}
    </SurfaceProvider>
  )
}
