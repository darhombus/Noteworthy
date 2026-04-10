'use server'

import { createClient } from '@/lib/supabase/server'

export interface UserPreferences {
  defaultJournalId?: string
  theme?: 'light' | 'dark' | 'system'
  autoSaveInterval?: number
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  firstDayOfWeek?: 'monday' | 'sunday'
  timezone?: string
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
