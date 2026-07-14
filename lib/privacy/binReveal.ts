/**
 * Bin-reveal session — a SEPARATE HMAC-signed httpOnly cookie that
 * gates only the recycle bin's redaction. Knowing the vault PIN /
 * password lets the user expose hidden item titles in the bin without
 * also opening the actual vault content at /hidden.
 *
 * Why two cookies:
 *   • The vault (`nw_vault`) is sensitive — it grants navigation
 *     access to the user's hidden journals and entries, sliding-window
 *     auto-locks on inactivity, and locks on navigation away.
 *   • The recycle bin only needs to render placeholder titles. A user
 *     unlocking it shouldn't simultaneously grant /hidden access.
 *
 * The cookie is signed with VAULT_COOKIE_SECRET (same secret, different
 * cookie name) so deployments don't need to set up a second secret.
 * Cookie shape, TTL, and verification mirror vault.ts exactly.
 */

import { cache } from 'react'
import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

export const BIN_REVEAL_COOKIE_NAME = 'nw_bin_reveal'

interface BinRevealPayload {
  uid: string
  exp: number
}

function getSecret(): string {
  const s = process.env.VAULT_COOKIE_SECRET
  if (!s) {
    throw new Error(
      'VAULT_COOKIE_SECRET is not set — bin-reveal cookies cannot be signed.',
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

function sign(payload: BinRevealPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const tag = b64url(createHmac('sha256', getSecret()).update(body).digest())
  return `${body}.${tag}`
}

function verify(token: string): BinRevealPayload | null {
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot)
  const tag = token.slice(dot + 1)

  const expected = createHmac('sha256', getSecret()).update(body).digest()
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
      typeof (payload as BinRevealPayload).uid === 'string' &&
      typeof (payload as BinRevealPayload).exp === 'number'
    ) {
      return payload as BinRevealPayload
    }
    return null
  } catch {
    return null
  }
}

export async function openBinReveal(userId: string, minutes: number): Promise<void> {
  const maxAgeSeconds = Math.max(60, Math.floor(minutes * 60))
  const exp = Date.now() + maxAgeSeconds * 1000
  const token = sign({ uid: userId, exp })

  const store = await cookies()
  store.set(BIN_REVEAL_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

/**
 * React-cached so repeat calls within the same server render (e.g. the
 * SSR recycle bin page reads it, then a server component sub-tree reads
 * it again) are free. Cookie state can only change via Server Actions /
 * Route Handlers, never mid-render.
 */
export const isBinRevealed = cache(async (userId: string): Promise<boolean> => {
  const store = await cookies()
  const raw = store.get(BIN_REVEAL_COOKIE_NAME)?.value
  if (!raw) return false
  const payload = verify(raw)
  if (!payload) return false
  if (payload.uid !== userId) return false
  if (payload.exp <= Date.now()) return false
  return true
})

export async function closeBinReveal(): Promise<void> {
  const store = await cookies()
  store.delete(BIN_REVEAL_COOKIE_NAME)
}
