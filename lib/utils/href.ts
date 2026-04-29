/**
 * Pure URL builders — single source of truth for the public/hidden URL
 * shapes. No pathname sniffing, no router lookups; just the surface and
 * the IDs in, the right path out.
 *
 *   Public surface:
 *     /journals
 *     /journals/<jid>
 *     /journals/<jid>/entries/<eid>
 *
 *   Hidden surface:
 *     /hidden                   — vault gate / dashboard
 *     /hidden/<jid>             — entries list inside a hidden journal
 *     /hidden/<jid>/<eid>       — entry inside a hidden journal
 *     /hidden/entry/<eid>       — standalone hidden entry whose parent
 *                                  journal is public
 */

import type { Surface } from '@/lib/surface'

export function journalListHref(surface: Surface): string {
  return surface === 'hidden' ? '/hidden' : '/journals'
}

export function journalHref(surface: Surface, journalId: string): string {
  return surface === 'hidden' ? `/hidden/${journalId}` : `/journals/${journalId}`
}

export function entryHref(
  surface: Surface,
  journalId: string,
  entryId: string,
  opts?: { standalone?: boolean },
): string {
  if (surface === 'hidden') {
    return opts?.standalone ? `/hidden/entry/${entryId}` : `/hidden/${journalId}/${entryId}`
  }
  return `/journals/${journalId}/entries/${entryId}`
}
