import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  createJournalOpen: boolean
  setCreateJournalOpen: (open: boolean) => void
  // Sibling flag for the Hidden surface. Kept as a separate boolean (rather
  // than a discriminated `mode` field) so the public TopBar's New Journal
  // button can never accidentally open a hidden-journal modal and vice
  // versa — each surface owns its own flag and reads only that one.
  createHiddenJournalOpen: boolean
  setCreateHiddenJournalOpen: (open: boolean) => void
  isSearchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
  // True while the Hidden surface is showing its locked gate (unlock or
  // setup screen). TopBar reads this to suppress the "Search vault"
  // affordance — searching makes no sense before the vault is open.
  hiddenVaultLocked: boolean
  setHiddenVaultLocked: (locked: boolean) => void
  // Profile data — synced from server on mount, updatable by settings
  profileName: string
  profileAvatarUrl: string | null
  setProfileName: (name: string) => void
  setProfileAvatarUrl: (url: string | null) => void
  // Breadcrumb: maps a dynamic-route id (journalId, entryId, …) to its
  // display title. Pages register here via <BreadcrumbTitle> so the TopBar
  // can show "Journals > My Diary > First Entry" instead of raw UUIDs.
  breadcrumbTitles: Record<string, string>
  setBreadcrumbTitle: (id: string, title: string) => void
  clearBreadcrumbTitle: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  createJournalOpen: false,
  setCreateJournalOpen: (open) => set({ createJournalOpen: open }),
  createHiddenJournalOpen: false,
  setCreateHiddenJournalOpen: (open) => set({ createHiddenJournalOpen: open }),
  isSearchOpen: false,
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  hiddenVaultLocked: false,
  setHiddenVaultLocked: (locked) => set({ hiddenVaultLocked: locked }),
  profileName: '',
  profileAvatarUrl: null,
  setProfileName: (name) => set({ profileName: name }),
  setProfileAvatarUrl: (url) => set({ profileAvatarUrl: url }),
  breadcrumbTitles: {},
  setBreadcrumbTitle: (id, title) =>
    set((s) =>
      s.breadcrumbTitles[id] === title
        ? s
        : { breadcrumbTitles: { ...s.breadcrumbTitles, [id]: title } },
    ),
  clearBreadcrumbTitle: (id) =>
    set((s) => {
      if (!(id in s.breadcrumbTitles)) return s
      const next = { ...s.breadcrumbTitles }
      delete next[id]
      return { breadcrumbTitles: next }
    }),
}))
