/**
 * Vault session — an HMAC-signed httpOnly cookie that says "the user has
 * proven knowledge of the vault PIN/password and the unlock window has
 * not yet expired". This file is the only place that mints, reads, or
 * destroys the cookie. Higher-level code asks `isVaultOpen(userId)` —
 * never inspects the cookie itself.
 */

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

export const VAULT_COOKIE_NAME = 'nw_vault'

interface VaultPayload {
  /** The user the vault session belongs to. */
  uid: string
  /** Unix epoch milliseconds at which this session expires. */
  exp: number
  /** Auto-lock minutes at the time of unlock (optional for legacy cookies). */
  alm?: number
}

function getJwtSecret(): string {
  const s = process.env.VAULT_COOKIE_SECRET
  if (!s) {
    throw new Error(
      'VAULT_COOKIE_SECRET is not set — vault cookies cannot be signed. ' +
        'Add it to .env.local before unlocking the vault.',
    )
  }
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(payload: VaultPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const tag = b64url(createHmac('sha256', getJwtSecret()).update(body).digest())
  return `${body}.${tag}`
}

function verify(token: string): VaultPayload | null {
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot)
  const tag = token.slice(dot + 1)

  const expected = createHmac('sha256', getJwtSecret()).update(body).digest()
  let actual: Buffer
  try {
    actual = fromB64url(tag)
  } catch {
    return null
  }
  if (actual.length !== expected.length) return null
  if (!timingSafeEqual(actual, expected)) return null

  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as unknown
    if (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as VaultPayload).uid === 'string' &&
      typeof (payload as VaultPayload).exp === 'number'
    ) {
      return payload as VaultPayload
    }
    return null
  } catch {
    return null
  }
}

/**
 * Open the vault for `minutes` minutes. Overwrites any existing session.
 */
export async function openVault(userId: string, minutes: number): Promise<void> {
  const maxAgeSeconds = Math.max(60, Math.floor(minutes * 60))
  const exp = Date.now() + maxAgeSeconds * 1000
  const token = sign({ uid: userId, exp, alm: minutes })

  const store = await cookies()
  store.set(VAULT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

/**
 * Returns true iff the cookie is present, the HMAC verifies, the userId
 * matches, and the expiry is in the future.
 *
 * Wrapped in React's `cache()` so repeat calls within the same server
 * render (e.g. page calls it, then the scope factory re-checks it) are
 * deduped. The cookie is httpOnly and can only be set by Server Actions
 * / Route Handlers, never mid-render, so the cached value is consistent.
 */
export const isVaultOpen = cache(async (userId: string): Promise<boolean> => {
  const payload = await readVaultSession(userId)
  return payload !== null
})

export interface VaultSession {
  userId: string
  expiresAt: number
  autoLockMinutes: number | null
}

export async function readVaultSession(userId: string): Promise<VaultSession | null> {
  const store = await cookies()
  const raw = store.get(VAULT_COOKIE_NAME)?.value
  if (!raw) return null
  const payload = verify(raw)
  if (!payload) return null
  if (payload.uid !== userId) return null
  if (payload.exp <= Date.now()) return null
  return {
    userId: payload.uid,
    expiresAt: payload.exp,
    autoLockMinutes:
      typeof payload.alm === 'number' && Number.isFinite(payload.alm) ? payload.alm : null,
  }
}

/**
 * Close the vault by deleting the cookie.
 */
export async function closeVault(): Promise<void> {
  const store = await cookies()
  store.delete(VAULT_COOKIE_NAME)
}
