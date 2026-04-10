import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  createJournalOpen: boolean
  setCreateJournalOpen: (open: boolean) => void
  isSearchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
  // Profile data — synced from server on mount, updatable by settings
  profileName: string
  profileAvatarUrl: string | null
  setProfileName: (name: string) => void
  setProfileAvatarUrl: (url: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  createJournalOpen: false,
  setCreateJournalOpen: (open) => set({ createJournalOpen: open }),
  isSearchOpen: false,
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  profileName: '',
  profileAvatarUrl: null,
  setProfileName: (name) => set({ profileName: name }),
  setProfileAvatarUrl: (url) => set({ profileAvatarUrl: url }),
}))
