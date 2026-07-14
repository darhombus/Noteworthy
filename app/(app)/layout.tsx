import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/server'
import { getPerfTraceId, timePerf } from '@/lib/perf/server'
import AppShell from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const trace = await getPerfTraceId()
  return timePerf(
    'layout.app.render',
    async () => {
      const user = await getCurrentUser()
      if (!user) redirect('/login')
      const fullName =
        typeof user.fullName === 'string' && user.fullName.trim().length > 0
          ? user.fullName.trim()
          : 'User'

      const sidebarUser = {
        id: user.id,
        fullName,
        email: user.email ?? '',
        avatarUrl: null,
      }

      return <AppShell user={sidebarUser}>{children}</AppShell>
    },
    { trace },
  )
}
