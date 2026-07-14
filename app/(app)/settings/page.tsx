import { getCurrentUser, getCurrentProfile } from '@/lib/auth/server'
import {
  STORAGE_QUOTA_BYTES,
  getUserStorageBreakdown,
} from '@/lib/storage/quota'
import SettingsTabs from '@/components/settings/SettingsTabs'
import AccountTab from '@/components/settings/AccountTab'
import PreferencesTab from '@/components/settings/PreferencesTab'
import PrivacyTab from '@/components/settings/PrivacyTab'
import type { UserPreferences } from '@/lib/actions/settings'

type Tab = 'account' | 'preferences' | 'privacy'

interface Props {
  searchParams: Promise<{ tab?: string }>
}

export default async function SettingsPage({ searchParams }: Props) {
  const { tab: rawTab } = await searchParams
  const tab: Tab =
    rawTab === 'preferences' || rawTab === 'privacy' ? rawTab : 'account'

  const user = await getCurrentUser()
  if (!user) return null

  // Profile is shared with the layout via the request-scoped React cache,
  // so this resolves without an extra round-trip.
  const profile = await getCurrentProfile()

  const vaultSecretType = (profile?.vault_secret_type ?? null) as 'pin' | 'password' | null
  const vaultAutoLockMinutes = profile?.vault_auto_lock_minutes ?? 5

  const preferences: UserPreferences =
    profile?.preferences &&
    typeof profile.preferences === 'object' &&
    !Array.isArray(profile.preferences)
      ? (profile.preferences as UserPreferences)
      : {}

  // Privacy-only data: avoid running heavy media scans on non-privacy tabs.
  const storageLimit = STORAGE_QUOTA_BYTES
  let currentUsage = 0
  let imageUsage = 0
  let videoUsage = 0

  if (tab === 'privacy') {
    const breakdown = await getUserStorageBreakdown(user.id)
    currentUsage = breakdown.currentUsage
    imageUsage = breakdown.imageUsage
    videoUsage = breakdown.videoUsage
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-[#212121] dark:text-[#F5F5F5]">
        Settings
      </h1>

      <SettingsTabs activeTab={tab} />

      {tab === 'account' && (
        <AccountTab
          userId={user.id}
          email={user.email ?? ''}
          fullName={profile?.full_name ?? ''}
          avatarUrl={profile?.avatar_url ?? null}
        />
      )}

      {tab === 'preferences' && (
        <PreferencesTab preferences={preferences} />
      )}

      {tab === 'privacy' && (
        <PrivacyTab
          currentUsage={currentUsage}
          storageLimit={storageLimit}
          imageUsage={imageUsage}
          videoUsage={videoUsage}
          vaultSecretType={vaultSecretType}
          vaultAutoLockMinutes={vaultAutoLockMinutes}
        />
      )}
    </div>
  )
}
