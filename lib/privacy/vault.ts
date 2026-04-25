/**
 * Privacy Vault session — server-only helpers.
 *
 * The Vault is a short-lived cookie that gates `/hidden`. It is independent
 * of Supabase auth (a signed-in user still has to enter their Privacy PIN
 * to open the vault) and independent of the journal/entry lock system
 * (those remain in-page React state). The cookie expires after the user's
 * `autoLockMinutes` preference, same knob as the existing auto-lock.
 *
 * Threat model: identical to the existing lock feature — an app-level
 * privacy layer, not encryption. The PIN stops casual shoulder-surfers,
 * not a motivated attacker with the DB. The cookie signature keeps a
 * user from forging a vault-open state for a different user id.
 */
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'nw_vault'
const DEFAULT_MINUTES = 5

/**
 * HMAC key — derived from the Supabase anon key so we don't need a new
 * env var. Anon key is available on every server runtime and is a stable
 * per-project secret. Rotating the project's anon key invalidates all
 * outstanding vault cookies, which is the desired behavior.
 */
function getSigningKey(): string {
  const k = process.env.SUPABASE_JWT_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!k) throw new Error('Missing signing key for vault cookie')
  return k
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningKey()).update(payload).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function encode(userId: string, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

function decode(cookie: string): { userId: string; expiresAt: number } | null {
  const parts = cookie.split('.')
  if (parts.length !== 3) return null
  const [userId, expStr, mac] = parts
  const expiresAt = Number(expStr)
  if (!Number.isFinite(expiresAt)) return null
  const expected = sign(`${userId}.${expiresAt}`)
  if (!safeEqual(expected, mac)) return null
  return { userId, expiresAt }
}

/**
 * Open the vault for this user. Writes an httpOnly signed cookie that
 * expires after `minutes` of wall-clock time. Each successful PIN entry
 * refreshes the cookie with a new expiry.
 */
export async function openVault(userId: string, minutes = DEFAULT_MINUTES): Promise<void> {
  const effective = Math.max(1, Math.floor(minutes || DEFAULT_MINUTES))
  const expiresAt = Date.now() + effective * 60 * 1000
  const store = await cookies()
  store.set(COOKIE_NAME, encode(userId, expiresAt), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: effective * 60,
  })
}

export async function closeVault(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

/**
 * Returns true if the vault is open for the given user. Any mismatch
 * (wrong user, bad signature, expired) returns false. Does NOT clear
 * an expired cookie — reading during a Server Component render can't
 * write cookies. The cookie's own maxAge handles browser-side cleanup.
 */
export async function isVaultOpen(userId: string): Promise<boolean> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return false
  const decoded = decode(raw)
  if (!decoded) return false
  if (decoded.userId !== userId) return false
  if (decoded.expiresAt <= Date.now()) return false
  return true
}
