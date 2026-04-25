'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { hashSecret, verifySecret } from '@/lib/utils/lockCrypto'
import { openVault, closeVault, isVaultOpen } from '@/lib/privacy/vault'
import type { UserPreferences } from '@/lib/actions/settings'

export type PrivacyPinType = 'none' | 'pin' | 'password'

function validateSecretShape(pinType: PrivacyPinType, secret: string | undefined): string | null {
  if (pinType === 'pin') {
    if (!secret || !/^\d{4}$/.test(secret)) return 'PIN must be exactly 4 digits'
  } else if (pinType === 'password') {
    if (!secret || secret.length < 4) return 'Password must be at least 4 characters'
  } else if (pinType !== 'none') {
    return 'Invalid PIN type'
  }
  return null
}

async function autoLockMinutesFor(userId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('user_id', userId)
    .single()
  const prefs: UserPreferences =
    data?.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)
      ? (data.preferences as UserPreferences)
      : {}
  const minutes = prefs.autoLockMinutes
  return typeof minutes === 'number' && minutes > 0 ? minutes : 5
}

// ---------------------------------------------------------------------------
// PIN management
// ---------------------------------------------------------------------------

/**
 * Set the Privacy PIN/Password for the first time. Fails if one already
 * exists — use changePrivacyPin for replacing an existing secret.
 */
export async function setPrivacyPin(
  pinType: Exclude<PrivacyPinType, 'none'>,
  newSecret: string,
): Promise<{ success: true } | { error: string }> {
  const shapeError = validateSecretShape(pinType, newSecret)
  if (shapeError) return { error: shapeError }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('privacy_pin_type, privacy_pin_hash')
    .eq('user_id', user.id)
    .single()

  if (profile?.privacy_pin_type && profile.privacy_pin_type !== 'none') {
    return { error: 'A Privacy PIN is already set. Use "Change PIN" to replace it.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      privacy_pin_type: pinType,
      privacy_pin_hash: hashSecret(newSecret),
    })
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  // Open the vault straight away so the user doesn't have to re-enter what
  // they just created.
  const minutes = await autoLockMinutesFor(user.id)
  await openVault(user.id, minutes)

  revalidatePath('/hidden')
  revalidatePath('/settings')
  return { success: true }
}

/**
 * Change or remove the Privacy PIN. Always requires the current secret.
 * Removing the PIN (newPinType === 'none') also clears every hidden flag —
 * without a PIN there's nothing stopping anyone with the session from
 * browsing /hidden, so leaving items hidden would be a false sense of
 * security.
 */
export async function changePrivacyPin(
  currentSecret: string,
  newPinType: PrivacyPinType,
  newSecret?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('privacy_pin_type, privacy_pin_hash')
    .eq('user_id', user.id)
    .single()

  const currentType = (profile?.privacy_pin_type ?? 'none') as PrivacyPinType
  if (currentType === 'none' || !profile?.privacy_pin_hash) {
    return { error: 'No Privacy PIN is set' }
  }
  if (!verifySecret(currentSecret, profile.privacy_pin_hash)) {
    return { error: 'Current PIN or password is incorrect' }
  }

  if (newPinType === 'none') {
    // Clear the PIN and unhide everything. Belt-and-braces so a later
    // "re-enable PIN" attempt doesn't uncover old hidden items the user
    // had forgotten about.
    const [{ error: jErr }, { error: eErr }, { error: pErr }] = await Promise.all([
      supabase
        .from('journals')
        .update({ is_hidden: false })
        .eq('user_id', user.id)
        .eq('is_hidden', true),
      // entries go through RLS — scoped via the journal join the policy uses.
      supabase.from('entries').update({ is_hidden: false }).eq('is_hidden', true),
      supabase
        .from('profiles')
        .update({ privacy_pin_type: 'none', privacy_pin_hash: null })
        .eq('user_id', user.id),
    ])
    if (jErr) return { error: jErr.message }
    if (eErr) return { error: eErr.message }
    if (pErr) return { error: pErr.message }

    await closeVault()
    revalidatePath('/hidden')
    revalidatePath('/settings')
    revalidatePath('/journals', 'layout')
    revalidatePath('/dashboard')
    return { success: true }
  }

  const shapeError = validateSecretShape(newPinType, newSecret)
  if (shapeError) return { error: shapeError }

  const { error } = await supabase
    .from('profiles')
    .update({
      privacy_pin_type: newPinType,
      privacy_pin_hash: hashSecret(newSecret!),
    })
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  const minutes = await autoLockMinutesFor(user.id)
  await openVault(user.id, minutes)

  revalidatePath('/hidden')
  revalidatePath('/settings')
  return { success: true }
}

/**
 * Verify the Privacy PIN and open the vault on success.
 */
export async function unlockVault(
  secret: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('privacy_pin_type, privacy_pin_hash')
    .eq('user_id', user.id)
    .single()

  if (!profile?.privacy_pin_hash || profile.privacy_pin_type === 'none') {
    return { error: 'No Privacy PIN is set' }
  }
  if (!verifySecret(secret, profile.privacy_pin_hash)) {
    return { error: 'Incorrect PIN or password' }
  }

  const minutes = await autoLockMinutesFor(user.id)
  await openVault(user.id, minutes)

  revalidatePath('/hidden')
  return { success: true }
}

export async function lockVault(): Promise<{ success: true }> {
  await closeVault()
  revalidatePath('/hidden')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Hide / Unhide
// ---------------------------------------------------------------------------

/**
 * Hiding (one-way stash action) requires a PIN to exist but does NOT
 * require the vault to be open — the user is pushing something out of
 * sight and shouldn't have to authenticate to do that. Unhiding (which
 * re-exposes the item) does require the vault to be open.
 *
 * When no PIN is set the result includes `code: 'no_pin'` so the client
 * can render an actionable toast ("Set up Vault" button) rather than a
 * generic error — see JournalCard / EntryCard.
 */
async function requirePinExists(): Promise<
  { userId: string } | { error: string; code?: 'no_pin' }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('profiles')
    .select('privacy_pin_type')
    .eq('user_id', user.id)
    .single()

  const type = (data?.privacy_pin_type ?? 'none') as PrivacyPinType
  if (type === 'none') {
    return {
      error: 'Set up the Private Vault to hide items',
      code: 'no_pin',
    }
  }
  return { userId: user.id }
}

async function requireVaultOpen(): Promise<
  { userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isVaultOpen(user.id))) {
    return { error: 'Unlock the Privacy Vault to change what is hidden' }
  }
  return { userId: user.id }
}

export async function hideJournal(
  journalId: string,
): Promise<{ success: true } | { error: string; code?: 'no_pin' }> {
  const gate = await requirePinExists()
  if ('error' in gate) return gate

  const supabase = await createClient()
  const { error } = await supabase
    .from('journals')
    .update({ is_hidden: true })
    .eq('journal_id', journalId)
    .eq('user_id', gate.userId)
  if (error) return { error: error.message }

  revalidatePath('/journals', 'layout')
  revalidatePath('/hidden')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function unhideJournal(
  journalId: string,
): Promise<{ success: true } | { error: string }> {
  const gate = await requireVaultOpen()
  if ('error' in gate) return gate

  const supabase = await createClient()
  const { error } = await supabase
    .from('journals')
    .update({ is_hidden: false })
    .eq('journal_id', journalId)
    .eq('user_id', gate.userId)
  if (error) return { error: error.message }

  revalidatePath('/journals', 'layout')
  revalidatePath('/hidden')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function hideEntry(
  entryId: string,
): Promise<{ success: true } | { error: string; code?: 'no_pin' }> {
  const gate = await requirePinExists()
  if ('error' in gate) return gate

  const supabase = await createClient()
  const { error } = await supabase
    .from('entries')
    .update({ is_hidden: true })
    .eq('entry_id', entryId)
  if (error) return { error: error.message }

  revalidatePath('/journals', 'layout')
  revalidatePath('/hidden')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function unhideEntry(
  entryId: string,
): Promise<{ success: true } | { error: string }> {
  const gate = await requireVaultOpen()
  if ('error' in gate) return gate

  const supabase = await createClient()
  const { error } = await supabase
    .from('entries')
    .update({ is_hidden: false })
    .eq('entry_id', entryId)
  if (error) return { error: error.message }

  revalidatePath('/journals', 'layout')
  revalidatePath('/hidden')
  revalidatePath('/dashboard')
  return { success: true }
}
