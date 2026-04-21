'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { hashSecret, verifySecret } from '@/lib/utils/lockCrypto'

export type LockEntityType = 'journal' | 'entry'
export type LockType = 'none' | 'pin' | 'password'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

interface LockState {
  /**
   * The lock type that describes the **secret** guarding this entity.
   * - Journal: journal.lock_type
   * - Entry:   journal.entry_lock_type (the shared secret lives on the journal)
   */
  lockType: LockType
  /** The stored hash for the secret above, or null if no secret is set. */
  lockHash: string | null
  /**
   * Entries only: whether THIS entry is opted into the journal's shared lock.
   * `false` when entry.lock_type === 'none'.
   */
  entryParticipates: boolean
  /** Entries only: parent journal id. */
  journalId?: string
}

/**
 * Resolve the lock state that guards the given entity.
 *
 * - Journal: reads the journal's own `lock_type` / `lock_hash`.
 * - Entry: the secret lives on the parent journal (shared across every
 *   participating entry), so `lockType`/`lockHash` come from
 *   `journals.entry_lock_type`/`entry_lock_hash`. The entry's own
 *   participation is exposed as `entryParticipates`.
 */
async function fetchLock(
  supabase: SupabaseServer,
  entityId: string,
  entityType: LockEntityType,
  userId: string,
): Promise<LockState | { error: string }> {
  if (entityType === 'journal') {
    const { data } = await supabase
      .from('journals')
      .select('lock_type, lock_hash')
      .eq('journal_id', entityId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!data) return { error: 'Journal not found' }
    return {
      lockType: data.lock_type as LockType,
      lockHash: data.lock_hash,
      entryParticipates: false,
    }
  }

  const { data: entry } = await supabase
    .from('entries')
    .select('lock_type, journal_id')
    .eq('entry_id', entityId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!entry) return { error: 'Entry not found' }

  const { data: journal } = await supabase
    .from('journals')
    .select('entry_lock_type, entry_lock_hash')
    .eq('journal_id', entry.journal_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!journal) return { error: 'Journal not found' }

  return {
    lockType: journal.entry_lock_type as LockType,
    lockHash: journal.entry_lock_hash,
    entryParticipates: (entry.lock_type as LockType) !== 'none',
    journalId: entry.journal_id,
  }
}

function validateSecretShape(lockType: LockType, secret: string | undefined): string | null {
  if (lockType === 'pin') {
    if (!secret || !/^\d{4}$/.test(secret)) return 'PIN must be exactly 4 digits'
  } else if (lockType === 'password') {
    if (!secret || secret.length === 0) return 'Password is required'
  } else if (lockType !== 'none') {
    return 'Invalid lock type'
  }
  return null
}

// ---------------------------------------------------------------------------
// Exported server actions
// ---------------------------------------------------------------------------

/**
 * Verify a PIN or password against the stored lock hash for a journal or entry.
 *
 * For entries the hash lives on the parent journal (shared across every locked
 * entry in that journal), so this routes to `journals.entry_lock_hash`.
 */
export async function verifyLock(
  entityId: string,
  entityType: LockEntityType,
  secret: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await fetchLock(supabase, entityId, entityType, user.id)
  if ('error' in state) return { error: state.error }
  if (state.lockType === 'none' || !state.lockHash) {
    return { error: 'No lock configured' }
  }
  if (!verifySecret(secret, state.lockHash)) {
    return { error: 'Incorrect PIN or password' }
  }
  return { success: true }
}

/**
 * Set (or clear) the lock on a journal or entry.
 *
 * Journals: writes `lock_type` / `lock_hash` on the journal row.
 *
 * Entries: the journal owns the shared `entry_lock_type` / `entry_lock_hash`.
 *   - If the journal has no shared lock yet and `lockType !== 'none'`, this
 *     call BOOTSTRAPS the journal's shared secret from `newSecret`, and marks
 *     this entry as participating.
 *   - If the journal already has a shared lock, `newSecret` is ignored and the
 *     entry simply opts into (or out of) the existing shared lock. The caller
 *     must pass `lockType` equal to the journal's existing entry-lock type.
 *   - Removing the lock on an entry never clears the journal's shared secret —
 *     other entries may still be using it.
 *
 * When replacing an existing lock (journal lock or the journal-level shared
 * entry-lock secret), the caller must supply `currentSecret`, which is
 * verified against the existing hash before any write happens.
 */
export async function setLock(
  entityId: string,
  entityType: LockEntityType,
  lockType: LockType,
  newSecret?: string,
  currentSecret?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const state = await fetchLock(supabase, entityId, entityType, user.id)
  if ('error' in state) return { error: state.error }

  // ------------------------------------------------------------------
  // JOURNAL lock — writes straight to journals.lock_type / lock_hash.
  // ------------------------------------------------------------------
  if (entityType === 'journal') {
    // Overwriting an existing lock requires verifying the current secret.
    if (state.lockType !== 'none' && state.lockHash) {
      if (!currentSecret || !verifySecret(currentSecret, state.lockHash)) {
        return { error: 'Current PIN or password is incorrect' }
      }
    }

    if (lockType !== 'none') {
      const shapeError = validateSecretShape(lockType, newSecret)
      if (shapeError) return { error: shapeError }
    }
    const newHash = lockType === 'none' ? null : hashSecret(newSecret!)
    const { error } = await supabase
      .from('journals')
      .update({ lock_type: lockType, lock_hash: newHash })
      .eq('journal_id', entityId)
      .eq('user_id', user.id)
    if (error) return { error: error.message }

    revalidatePath('/journals')
    revalidatePath(`/journals/${entityId}`)
    return { success: true }
  }

  // ------------------------------------------------------------------
  // ENTRY lock — the secret is stored on the parent journal; the entry
  // row only tracks whether it's opted into the shared lock.
  // ------------------------------------------------------------------
  if (!state.journalId) return { error: 'Journal not found' }

  // Opt THIS entry out of the shared lock. Does not touch the journal-level
  // secret — sibling entries can still be using it. Removing a lock must be
  // gated by the current secret so a stranger with momentary access can't
  // silently expose an entry.
  if (lockType === 'none') {
    if (state.entryParticipates) {
      if (!state.lockHash) return { error: 'No shared lock configured' }
      if (!currentSecret || !verifySecret(currentSecret, state.lockHash)) {
        return { error: 'Current PIN or password is incorrect' }
      }
    }
    const { error } = await supabase
      .from('entries')
      .update({ lock_type: 'none' })
      .eq('entry_id', entityId)
    if (error) return { error: error.message }
    revalidatePath('/journals', 'layout')
    return { success: true }
  }

  const journalEntryLockType = state.lockType

  if (journalEntryLockType === 'none') {
    // BOOTSTRAP: no shared secret yet — the caller picks the type + secret
    // for every future locked entry in this journal.
    const shapeError = validateSecretShape(lockType, newSecret)
    if (shapeError) return { error: shapeError }
    const newHash = hashSecret(newSecret!)
    const { error: jErr } = await supabase
      .from('journals')
      .update({ entry_lock_type: lockType, entry_lock_hash: newHash })
      .eq('journal_id', state.journalId)
      .eq('user_id', user.id)
    if (jErr) return { error: jErr.message }

    const { error: eErr } = await supabase
      .from('entries')
      .update({ lock_type: lockType })
      .eq('entry_id', entityId)
    if (eErr) return { error: eErr.message }

    revalidatePath('/journals', 'layout')
    return { success: true }
  }

  // Shared lock already exists — caller must match its type, and we ignore
  // any secret they passed (it's already set at the journal level).
  if (lockType !== journalEntryLockType) {
    return {
      error:
        journalEntryLockType === 'pin'
          ? "This journal's entry lock is a 4-digit PIN. All locked entries must use the same PIN."
          : "This journal's entry lock is a password. All locked entries must use the same password.",
    }
  }

  const { error: eErr } = await supabase
    .from('entries')
    .update({ lock_type: lockType })
    .eq('entry_id', entityId)
  if (eErr) return { error: eErr.message }

  revalidatePath('/journals', 'layout')
  return { success: true }
}

/**
 * Change or remove the shared entry-lock secret for a whole journal. The
 * current secret is always required; without it the action is rejected.
 *
 * - `newLockType = 'none'`: clears the shared secret AND every entry's
 *   `lock_type` in that journal, since there is no longer any secret to
 *   verify against.
 * - `newLockType = 'pin' | 'password'`: replaces the shared secret. Any
 *   entries currently participating are re-pointed at the new type so they
 *   remain locked by the new secret.
 */
export async function changeJournalEntryLock(
  journalId: string,
  newLockType: LockType,
  currentSecret: string,
  newSecret?: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: journal } = await supabase
    .from('journals')
    .select('entry_lock_type, entry_lock_hash')
    .eq('journal_id', journalId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!journal) return { error: 'Journal not found' }

  const currentType = journal.entry_lock_type as LockType
  if (currentType === 'none' || !journal.entry_lock_hash) {
    return { error: 'No entry lock is set on this journal' }
  }

  if (!verifySecret(currentSecret, journal.entry_lock_hash)) {
    return { error: 'Current PIN or password is incorrect' }
  }

  if (newLockType === 'none') {
    // Clear the shared secret and unlock every entry in this journal.
    const { error: jErr } = await supabase
      .from('journals')
      .update({ entry_lock_type: 'none', entry_lock_hash: null })
      .eq('journal_id', journalId)
      .eq('user_id', user.id)
    if (jErr) return { error: jErr.message }

    const { error: eErr } = await supabase
      .from('entries')
      .update({ lock_type: 'none' })
      .eq('journal_id', journalId)
      .neq('lock_type', 'none')
    if (eErr) return { error: eErr.message }

    revalidatePath('/journals', 'layout')
    return { success: true }
  }

  const shapeError = validateSecretShape(newLockType, newSecret)
  if (shapeError) return { error: shapeError }

  const newHash = hashSecret(newSecret!)
  const { error: jErr } = await supabase
    .from('journals')
    .update({ entry_lock_type: newLockType, entry_lock_hash: newHash })
    .eq('journal_id', journalId)
    .eq('user_id', user.id)
  if (jErr) return { error: jErr.message }

  // Re-point every participating entry at the new type so the UI stays in
  // sync. (We always store the shared type on each entry too — that's how
  // page renders know "this entry is locked".)
  const { error: eErr } = await supabase
    .from('entries')
    .update({ lock_type: newLockType })
    .eq('journal_id', journalId)
    .neq('lock_type', 'none')
  if (eErr) return { error: eErr.message }

  revalidatePath('/journals', 'layout')
  return { success: true }
}
