/**
 * Server-only crypto helpers for lock PIN/password hashing.
 * Import only from Server Actions or Route Handlers — never from client code.
 */
import { createHash, randomBytes } from 'crypto'

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = createHash('sha256').update(`${salt}:${secret}`).digest('hex')
  return `${salt}:${hash}`
}

export function verifySecret(secret: string, stored: string): boolean {
  const colonIdx = stored.indexOf(':')
  if (colonIdx === -1) return false
  const salt = stored.slice(0, colonIdx)
  const storedHash = stored.slice(colonIdx + 1)
  const computed = createHash('sha256').update(`${salt}:${secret}`).digest('hex')
  return computed === storedHash
}
