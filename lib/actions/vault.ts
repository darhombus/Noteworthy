'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/server'
import { closeVault, isVaultOpen, openVault } from '@/lib/privacy/vault'
import { closeBinReveal, openBinReveal } from '@/lib/privacy/binReveal'

type SecretType = 'pin' | 'password'
type ActionResult = { success: true } | { error: string }

const BCRYPT_COST = 10
const ALLOWED_AUTO_LOCK_MINUTES = new Set([1, 5, 15, 30])

// ---------------------------------------------------------------------------
// In-memory rate limiter for unlock attempts.
// 5 failed attempts within 5 minutes → 60s cooldown. Per the spec, this is
// anti-fat-finger, not anti-attacker — the Map is process-local and resets
// on deploy. Good enough.
// ---------------------------------------------------------------------------

interface AttemptRecord {
  count: number
  firstAt: number
  cooldownUntil?: number
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000
const unlockAttempts = new Map<string, AttemptRecord>()

function checkRateLimit(userId: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now()
  const record = unlockAttempts.get(userId)
  if (!record) return { ok: true }

  if (record.cooldownUntil && record.cooldownUntil > now) {
    return { ok: false, retryAfterSeconds: Math.ceil((record.cooldownUntil - now) / 1000) }
  }
  if (now - record.firstAt > RATE_LIMIT_WINDOW_MS) {
    unlockAttempts.delete(userId)
  }
  return { ok: true }
}

function recordFailedUnlock(userId: string): void {
  const now = Date.now()
  const record = unlockAttempts.get(userId)
  if (!record || now - record.firstAt > RATE_LIMIT_WINDOW_MS) {
    unlockAttempts.set(userId, { count: 1, firstAt: now })
    return
  }
  record.count += 1
  if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    record.cooldownUntil = now + RATE_LIMIT_COOLDOWN_MS
    record.count = 0
    record.firstAt = now
  }
}

function clearUnlockAttempts(userId: string): void {
  unlockAttempts.delete(userId)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function validateSecretShape(type: SecretType, secret: string): string | null {
  if (type === 'pin') {
    if (!/^\d{4}$/.test(secret)) return 'PIN must be exactly 4 digits'
  } else {
    if (typeof secret !== 'string' || secret.length < 8) {
      return 'Password must be at least 8 characters'
    }
  }
  return null
}

interface VaultProfile {
  vault_secret_type: SecretType | null
  vault_secret_hash: string | null
  vault_auto_lock_minutes: number
}

async function loadVaultProfile(
  userId: string,
): Promise<VaultProfile | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('vault_secret_type, vault_secret_hash, vault_auto_lock_minutes')
    .eq('user_id', userId)
    .single()
  if (error || !data) return { error: 'Profile not found' }
  return {
    vault_secret_type: data.vault_secret_type as SecretType | null,
    vault_secret_hash: data.vault_secret_hash,
    vault_auto_lock_minutes: data.vault_auto_lock_minutes,
  }
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user.id
}

// ---------------------------------------------------------------------------
// Vault secret lifecycle
// ---------------------------------------------------------------------------

export async function setVaultSecret(
  secretType: SecretType,
  secret: string,
): Promise<ActionResult> {
  const userId = await requireUserId()

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (profile.vault_secret_type !== null) {
    return { error: 'Vault secret already set — use changeVaultSecret instead' }
  }

  const shapeError = validateSecretShape(secretType, secret)
  if (shapeError) return { error: shapeError }

  const hash = await bcrypt.hash(secret, BCRYPT_COST)

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ vault_secret_type: secretType, vault_secret_hash: hash })
    .eq('user_id', userId)
  if (error) return { error: error.message }

  await openVault(userId, profile.vault_auto_lock_minutes)
  revalidatePath('/settings')
  return { success: true }
}

export async function changeVaultSecret(
  currentSecret: string,
  newSecretType: SecretType,
  newSecret: string,
): Promise<ActionResult> {
  const userId = await requireUserId()

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (!profile.vault_secret_type || !profile.vault_secret_hash) {
    return { error: 'No vault secret to change — set one first' }
  }

  const ok = await bcrypt.compare(currentSecret, profile.vault_secret_hash)
  if (!ok) return { error: 'Current PIN or password is incorrect' }

  const shapeError = validateSecretShape(newSecretType, newSecret)
  if (shapeError) return { error: shapeError }

  const hash = await bcrypt.hash(newSecret, BCRYPT_COST)

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ vault_secret_type: newSecretType, vault_secret_hash: hash })
    .eq('user_id', userId)
  if (error) return { error: error.message }

  // Vault stays in whatever state it was. Don't touch the cookie — if it
  // was open, the user keeps their unlock window; if it was locked, this
  // call doesn't grant a new session.
  revalidatePath('/settings')
  return { success: true }
}

type RemoveVaultResult =
  | { success: true; journalsRestored: number; entriesRestored: number }
  | { error: string }

export async function removeVaultSecret(
  currentSecret: string,
): Promise<RemoveVaultResult> {
  const userId = await requireUserId()

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (!profile.vault_secret_type || !profile.vault_secret_hash) {
    return { error: 'No vault secret to remove' }
  }

  const ok = await bcrypt.compare(currentSecret, profile.vault_secret_hash)
  if (!ok) return { error: 'Current PIN or password is incorrect' }

  const supabase = await createClient()

  // Auto-unhide everything. The rollup trigger fires on UPDATE OF is_hidden
  // so the journal counts settle without an extra round-trip. Use `select`
  // with the update so we can report back how many rows the user just
  // recovered into their normal lists.
  const { data: restoredJournals, error: journalsError } = await supabase
    .from('journals')
    .update({ is_hidden: false })
    .eq('user_id', userId)
    .eq('is_hidden', true)
    .select('journal_id')
  if (journalsError) return { error: journalsError.message }

  // Entries don't carry user_id directly — scope by the user's journal IDs.
  const { data: ownedJournals, error: ownedError } = await supabase
    .from('journals')
    .select('journal_id')
    .eq('user_id', userId)
  if (ownedError) return { error: ownedError.message }

  let entriesRestored = 0
  const journalIds = (ownedJournals ?? []).map((j) => j.journal_id)
  if (journalIds.length > 0) {
    const { data: restoredEntries, error: entriesError } = await supabase
      .from('entries')
      .update({ is_hidden: false })
      .in('journal_id', journalIds)
      .eq('is_hidden', true)
      .select('entry_id')
    if (entriesError) return { error: entriesError.message }
    entriesRestored = restoredEntries?.length ?? 0
  }

  const { error: clearError } = await supabase
    .from('profiles')
    .update({ vault_secret_type: null, vault_secret_hash: null })
    .eq('user_id', userId)
  if (clearError) return { error: clearError.message }

  await closeVault()
  clearUnlockAttempts(userId)
  revalidatePath('/journals')
  revalidatePath('/hidden')
  revalidatePath('/settings')
  return {
    success: true,
    journalsRestored: restoredJournals?.length ?? 0,
    entriesRestored,
  }
}

// ---------------------------------------------------------------------------
// Unlock / lock
// ---------------------------------------------------------------------------

type UnlockResult =
  | { success: true }
  | { error: string; retryAfterSeconds?: number }

export async function unlockVault(secret: string): Promise<UnlockResult> {
  const userId = await requireUserId()

  // Rate limiter — anti-fat-finger only.
  const limit = checkRateLimit(userId)
  if (!limit.ok) {
    return {
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s`,
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (!profile.vault_secret_type || !profile.vault_secret_hash) {
    return { error: 'No vault secret set' }
  }

  const ok = await bcrypt.compare(secret, profile.vault_secret_hash)
  if (!ok) {
    recordFailedUnlock(userId)
    return { error: 'Incorrect PIN or password' }
  }

  clearUnlockAttempts(userId)
  await openVault(userId, profile.vault_auto_lock_minutes)
  // /recycle-bin uses its own bin-reveal cookie now, so opening the
  // vault doesn't need to invalidate the bin's SSR cache. Revealing
  // titles in the bin is a separate `revealBin` action.
  revalidatePath('/hidden')
  return { success: true }
}

export async function lockVault(): Promise<ActionResult> {
  await closeVault()
  revalidatePath('/hidden')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Recycle-bin reveal — separate from the vault session
// ---------------------------------------------------------------------------

/**
 * Validate the user's vault secret and open a *bin-reveal* session.
 * Does NOT touch the actual vault cookie — `/hidden` still requires
 * a real `unlockVault` to access. The bin-reveal cookie only lifts
 * the redaction on the recycle-bin listing.
 *
 * Reuses the same rate limiter as `unlockVault` so a brute-force
 * attempt against the bin-reveal endpoint can't dodge the cooldown
 * by alternating with vault unlock attempts.
 */
export async function revealBin(secret: string): Promise<UnlockResult> {
  const userId = await requireUserId()

  const limit = checkRateLimit(userId)
  if (!limit.ok) {
    return {
      error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s`,
      retryAfterSeconds: limit.retryAfterSeconds,
    }
  }

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (!profile.vault_secret_type || !profile.vault_secret_hash) {
    return { error: 'No vault secret set' }
  }

  const ok = await bcrypt.compare(secret, profile.vault_secret_hash)
  if (!ok) {
    recordFailedUnlock(userId)
    return { error: 'Incorrect PIN or password' }
  }

  clearUnlockAttempts(userId)
  await openBinReveal(userId, profile.vault_auto_lock_minutes)
  revalidatePath('/recycle-bin')
  return { success: true }
}

/**
 * Close the bin-reveal session. Independent of the vault — this does
 * not lock /hidden access if the vault is also open.
 */
export async function hideBin(): Promise<ActionResult> {
  await closeBinReveal()
  revalidatePath('/recycle-bin')
  return { success: true }
}

/**
 * Refresh the vault cookie's expiry to "now + auto-lock minutes".
 *
 * Called by the client `VaultIdleGuard` on user activity so the unlock
 * window slides forward as long as the user is interacting with the
 * tab. Returns `vault_locked` if the cookie has already expired or was
 * never present — the caller should redirect to /hidden in that case.
 *
 * The cookie's `exp` is the source of truth for "is the vault open?"
 * — every server-side guard reads it via `isVaultOpen()` — so a fresh
 * touch is the only way to extend the unlock window without forcing
 * the user to re-enter their secret.
 */
export async function touchVault(): Promise<ActionResult> {
  const userId = await requireUserId()
  if (!(await isVaultOpen(userId))) return { error: 'vault_locked' }

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile

  await openVault(userId, profile.vault_auto_lock_minutes)
  return { success: true }
}

/**
 * Update the vault auto-lock window. Allowed values: 1, 5, 15, 30 (minutes).
 * Reflects on subsequent unlocks — does NOT extend the current cookie.
 */
export async function setVaultAutoLockMinutes(minutes: number): Promise<ActionResult> {
  const userId = await requireUserId()

  if (!ALLOWED_AUTO_LOCK_MINUTES.has(minutes)) {
    return { error: 'Invalid auto-lock duration' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ vault_auto_lock_minutes: minutes })
    .eq('user_id', userId)
  if (error) return { error: error.message }

  revalidatePath('/settings')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Hide / unhide — journals and entries
// ---------------------------------------------------------------------------

export async function hideJournal(journalId: string): Promise<ActionResult> {
  const userId = await requireUserId()

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (!profile.vault_secret_type) {
    return { error: 'no_vault: Set up your vault first' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('journals')
    .update({ is_hidden: true })
    .eq('journal_id', journalId)
    .eq('user_id', userId)
  if (error) return { error: error.message }

  // Hiding/unhiding mutates the *visible* set on every public surface
  // that aggregates entries or tags — Tags, Dashboard, Analytics, and
  // Recycle Bin. Without revalidating each one their SSR caches would
  // briefly show a tag/entry that just left the public scope, which
  // looks like a privacy leak even though the underlying data is
  // correct.
  invalidatePublicSurfaces()
  return { success: true }
}

function invalidatePublicSurfaces() {
  revalidatePath('/journals')
  revalidatePath('/hidden')
  revalidatePath('/hidden/standalone')
  revalidatePath('/tags')
  revalidatePath('/dashboard')
  revalidatePath('/analytics')
  revalidatePath('/recycle-bin')
}

export async function hideEntry(entryId: string): Promise<ActionResult> {
  const userId = await requireUserId()

  const profile = await loadVaultProfile(userId)
  if ('error' in profile) return profile
  if (!profile.vault_secret_type) {
    return { error: 'no_vault: Set up your vault first' }
  }

  const supabase = await createClient()

  // Reject hide-from-inside-a-hidden-journal at the action layer too.
  // Per the model rules, an entry inside a hidden journal cannot be
  // individually hidden — the journal-level flag is already covering it,
  // and recording another flag would silently leave the entry hidden
  // after its parent is later unhidden. The UI never offers this path,
  // but the server enforces it as a safety net.
  type ParentRow = {
    journals: { user_id: string; is_hidden: boolean } | null
  }
  const { data: parent, error: parentError } = await supabase
    .from('entries')
    .select('journals!inner(user_id, is_hidden)')
    .eq('entry_id', entryId)
    .maybeSingle<ParentRow>()
  if (parentError) return { error: parentError.message }
  if (!parent?.journals || parent.journals.user_id !== userId) {
    return { error: 'Entry not found' }
  }
  if (parent.journals.is_hidden) {
    return { error: 'Cannot hide an entry inside a hidden journal.' }
  }

  // RLS scopes the update to entries the user owns; the explicit eq on
  // entry_id keeps the write to a single row.
  const { error } = await supabase
    .from('entries')
    .update({ is_hidden: true })
    .eq('entry_id', entryId)
  if (error) return { error: error.message }

  invalidatePublicSurfaces()
  return { success: true }
}

export async function unhideJournal(journalId: string): Promise<ActionResult> {
  const userId = await requireUserId()
  if (!(await isVaultOpen(userId))) return { error: 'vault_locked' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('journals')
    .update({ is_hidden: false })
    .eq('journal_id', journalId)
    .eq('user_id', userId)
  if (error) return { error: error.message }

  invalidatePublicSurfaces()
  return { success: true }
}

export async function unhideEntry(entryId: string): Promise<ActionResult> {
  const userId = await requireUserId()
  if (!(await isVaultOpen(userId))) return { error: 'vault_locked' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('entries')
    .update({ is_hidden: false })
    .eq('entry_id', entryId)
  if (error) return { error: error.message }

  invalidatePublicSurfaces()
  return { success: true }
}
