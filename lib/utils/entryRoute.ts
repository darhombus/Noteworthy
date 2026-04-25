/**
 * URL helpers that keep the hidden-journal/entry routing separate from
 * the public `/journals/...` tree.
 *
 * The hidden tree is:
 *   /hidden                                              — vault dashboard
 *   /hidden/journals/<jid>                               — hidden journal list
 *   /hidden/journals/<jid>/entries/<eid>                 — entry inside a hidden journal
 *   /hidden/entries/<eid>                                — standalone hidden entry
 *
 * When a page is rendered under /hidden/**, any in-page navigation
 * (entry cards, "back to journal", delete redirect, new-entry redirect)
 * must stay on the hidden side. These helpers take the current pathname
 * and return the right target URL so we don't leak back to /journals/<jid>
 * and expose structure through the breadcrumb.
 */

export function isHiddenPathname(pathname: string): boolean {
  return pathname === '/hidden' || pathname.startsWith('/hidden/')
}

/**
 * URL of the list view for the given journal. On a hidden-context page,
 * this points at the /hidden mirror; otherwise the public /journals route.
 */
export function journalListHref(pathname: string, journalId: string): string {
  return isHiddenPathname(pathname)
    ? `/hidden/journals/${journalId}`
    : `/journals/${journalId}`
}

/**
 * URL of the editor for the given entry, honoring the current hidden/public
 * context. On the hidden side we prefer the nested `/hidden/journals/<jid>/entries/<eid>`
 * form when the caller renders inside a hidden journal (so the breadcrumb
 * shows "Hidden > <journal> > <entry>"); otherwise the flat `/hidden/entries/<eid>`
 * form.
 */
export function entryEditorHref(
  pathname: string,
  journalId: string,
  entryId: string,
): string {
  if (!isHiddenPathname(pathname)) {
    return `/journals/${journalId}/entries/${entryId}`
  }
  // Inside a hidden journal → nested URL. Anywhere else in /hidden (the
  // dashboard or the standalone entry editor) → flat URL.
  if (/^\/hidden\/journals\/[^/]+(\/|$)/.test(pathname)) {
    return `/hidden/journals/${journalId}/entries/${entryId}`
  }
  return `/hidden/entries/${entryId}`
}
