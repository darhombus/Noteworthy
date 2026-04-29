import { createClient } from '@/lib/supabase/server'
import {
  STORAGE_QUOTA_BYTES,
  getUserStorageUsage,
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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, preferences, vault_secret_type, vault_auto_lock_minutes')
    .eq('user_id', user.id)
    .single()

  const vaultSecretType = (profile?.vault_secret_type ?? null) as 'pin' | 'password' | null
  const vaultAutoLockMinutes = profile?.vault_auto_lock_minutes ?? 5

  const preferences: UserPreferences =
    profile?.preferences &&
    typeof profile.preferences === 'object' &&
    !Array.isArray(profile.preferences)
      ? (profile.preferences as UserPreferences)
      : {}

  // Storage usage (needed for privacy tab)
  const currentUsage = await getUserStorageUsage(user.id)
  const storageLimit = STORAGE_QUOTA_BYTES

  // Image vs video breakdown
  let imageUsage = 0
  let videoUsage = 0
  const { data: breakdown } = await supabase
    .from('media')
    .select('file_type, file_size, entries!inner(journal_id, journals!inner(user_id))')
    .eq('entries.journals.user_id', user.id)

  if (breakdown) {
    for (const row of breakdown) {
      const size = Number(row.file_size ?? 0)
      if (row.file_type === 'video') videoUsage += size
      else imageUsage += size
    }
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
