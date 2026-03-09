import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single()

  const sidebarUser = {
    fullName: profile?.full_name ?? user.email?.split('@')[0] ?? 'User',
    email: user.email ?? '',
    avatarUrl: profile?.avatar_url ?? null,
  }

  return <AppShell user={sidebarUser}>{children}</AppShell>
}
