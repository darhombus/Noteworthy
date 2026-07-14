'use server'

import { revalidateTag } from 'next/cache'
import { getProfileCacheTag } from '@/lib/auth/server'
import { clearHotCache } from '@/lib/perf/hot-cache'
import { createClient } from '@/lib/supabase/server'

export interface UserPreferences {
  defaultJournalId?: string
  theme?: 'light' | 'dark' | 'system'
  autoSaveInterval?: number
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timezone?: string
}

function invalidateProfileCache(userId: string) {
  revalidateTag(getProfileCacheTag(userId), 'max')
  // Also drop the in-process hot-cache entries — revalidateTag only flushes
  // the App Router's cache and doesn't reach the per-process Map in
  // lib/perf/hot-cache.ts. Without this, getCurrentProfile and
  // getCurrentVaultSecretType would keep serving stale data for up to
  // their TTL after a settings edit.
  clearHotCache(`profile:full:${userId}`)
  clearHotCache(`profile:secret-type:${userId}`)
}

export async function updateDisplayName(
  fullName: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // Keep Auth JWT user_metadata.full_name in sync so server-side claim reads
  // can render the latest display name without an extra profile query.
  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  })
  if (authError) return { error: authError.message }

  invalidateProfileCache(user.id)
  return {}
}

export async function updateAvatarUrl(
  avatarUrl: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  invalidateProfileCache(user.id)
  return {}
}

export async function updatePreferences(
  prefs: Partial<UserPreferences>,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Merge with existing preferences
  const { data: profile } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('user_id', user.id)
    .single()

  const existing =
    profile?.preferences && typeof profile.preferences === 'object' && !Array.isArray(profile.preferences)
      ? (profile.preferences as Record<string, unknown>)
      : {}

  const merged = { ...existing, ...prefs }

  const { error } = await supabase
    .from('profiles')
    .update({ preferences: merged })
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  invalidateProfileCache(user.id)
  return {}
}

export async function changeEmail(
  currentPassword: string,
  newEmail: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) return { error: 'Not authenticated' }

  // Verify current password
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (signInError) return { error: 'Current password is incorrect' }

  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) return { error: error.message }
  return {}
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !user.email) return { error: 'Not authenticated' }

  // Verify current password
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (signInError) return { error: 'Current password is incorrect' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }
  return {}
}

