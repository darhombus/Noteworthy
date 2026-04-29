'use client'

/**
 * Surface context — 'public' or 'hidden'. Set by the route group's
 * layout (/journals/** vs /hidden/**) and read by shared components
 * (EntryCard, EntryList, EntryEditor, DeleteEntryModal, JournalCard)
 * to decide which Hide/Unhide affordance to show and which href to
 * navigate to.
 *
 * Components MUST NOT sniff the pathname to figure out which surface
 * they're on — call useSurface() instead.
 */

import { createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'

export type Surface = 'public' | 'hidden'

const SurfaceContext = createContext<Surface>('public')

export function SurfaceProvider({
  value,
  children,
}: {
  value: Surface
  children: React.ReactNode
}) {
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>
}

export function useSurface(): Surface {
  return useContext(SurfaceContext)
}

/**
 * Provides Surface context derived from the current pathname. Used by
 * components mounted globally (outside any route-group layout) — the
 * route-group SurfaceProviders don't wrap them, so useSurface() would
 * otherwise always read the default 'public'. Pathname is the only
 * available signal at that level.
 */
export function SurfaceFromPath({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const surface: Surface =
    pathname === '/hidden' || pathname.startsWith('/hidden/') ? 'hidden' : 'public'
  return <SurfaceContext.Provider value={surface}>{children}</SurfaceContext.Provider>
}
