import Sidebar, { type SidebarUser } from './Sidebar'
import TopBar from './TopBar'
import InactivityModal from './InactivityModal'
import SearchOverlay from './SearchOverlay'
import VaultAutoLock from '@/components/privacy/VaultAutoLock'
import { SurfaceFromPath } from '@/lib/surface'

interface AppShellProps {
  user: SidebarUser
  children: React.ReactNode
}

export default function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="flex h-screen bg-[var(--bg-page)] overflow-hidden">
      <Sidebar user={user} />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />

        {/* Scrollable content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] w-full px-4 py-6 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      <InactivityModal />
      {/* SearchOverlay lives globally (above the route-group layouts that
          set Surface), so wrap it in a pathname-derived provider so it can
          read useSurface() instead of sniffing pathname itself. */}
      <SurfaceFromPath>
        <SearchOverlay />
      </SurfaceFromPath>
      <VaultAutoLock />
    </div>
  )
}
