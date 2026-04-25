import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isVaultOpen } from '@/lib/privacy/vault'
import VaultUnlockScreen from '@/components/privacy/VaultUnlockScreen'
import VaultSetupScreen from '@/components/privacy/VaultSetupScreen'
import HiddenView from '@/components/privacy/HiddenView'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export const dynamic = 'force-dynamic'

type PrivacyPinType = 'none' | 'pin' | 'password'

export default async function HiddenPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('privacy_pin_type')
    .eq('user_id', user.id)
    .single()

  const pinType = (profile?.privacy_pin_type ?? 'none') as PrivacyPinType

  if (pinType === 'none') {
    return <VaultSetupScreen />
  }

  if (!(await isVaultOpen(user.id))) {
    return <VaultUnlockScreen pinType={pinType} />
  }

  // Vault is open — fetch the hidden lists.
  const [{ data: hiddenJournals }, { data: hiddenEntries }] = await Promise.all([
    supabase
      .from('journals')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_hidden', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    supabase
      .from('entries')
      .select('*, journals!inner(title, color, user_id)')
      .eq('is_hidden', true)
      .is('deleted_at', null)
      .eq('journals.user_id', user.id)
      .order('entry_date', { ascending: false }),
  ])

  type RawEntryRow = {
    entry_id: string
    journal_id: string
    title: string | null
    entry_date: string
    word_count: number
    is_hidden: boolean
    is_pinned: boolean
    content: unknown
    lock_hash: string | null
    lock_type: string
    deleted_at: string | null
    created_at: string
    updated_at: string
    journals: { title: string; color: string; user_id: string } | null
  }

  const entriesFlat = ((hiddenEntries ?? []) as unknown as RawEntryRow[]).map((e) => {
    const { journals, ...rest } = e
    return {
      ...rest,
      journal_title: journals?.title ?? 'Untitled',
      journal_color: journals?.color ?? '#1976D2',
    }
  }) as Parameters<typeof HiddenView>[0]['entries']

  return (
    <>
      <LiveDataRefresh />
      <HiddenView journals={hiddenJournals ?? []} entries={entriesFlat} />
    </>
  )
}
