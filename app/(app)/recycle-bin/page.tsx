import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isBinRevealed } from '@/lib/privacy/binReveal'
import RecycleBinClient from '@/components/recycle-bin/RecycleBinClient'
import type { RecycleBinItem } from '@/components/recycle-bin/RecycleBinClient'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export default async function RecycleBinPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Redaction is gated SOLELY by the bin-reveal cookie. Opening the
  // vault elsewhere does not auto-reveal the bin — the two states
  // are intentionally disjoint, so a user with an open /hidden tab
  // who navigates to the bin still has to enter their secret to see
  // the titles. (The same secret unlocks both, but each surface
  // grants only its own scope.) Items themselves are always listed
  // — only the titles redact.
  const reveal = await isBinRevealed(user.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('vault_secret_type')
    .eq('user_id', user.id)
    .single()
  const vaultSecretType =
    (profile?.vault_secret_type as 'pin' | 'password' | null) ?? null

  const now = Date.now()
  const daysRemaining = (deletedAt: string) =>
    Math.max(0, 30 - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000))

  const [{ data: entries }, { data: journals }] = await Promise.all([
    supabase
      .from('entries')
      .select('entry_id, title, deleted_at, is_hidden, journals!inner(title, is_hidden, user_id)')
      .not('deleted_at', 'is', null)
      .eq('journals.user_id', user.id),
    supabase
      .from('journals')
      .select('journal_id, title, deleted_at, is_hidden')
      .eq('user_id', user.id)
      .not('deleted_at', 'is', null),
  ])

  type JournalRelation = { title: string; is_hidden: boolean; user_id: string }

  const entryItems: RecycleBinItem[] = (entries ?? []).map((e) => {
    const journal = e.journals as unknown as JournalRelation | null
    const journalHidden = journal?.is_hidden ?? false
    const requiresVault = !!e.is_hidden || journalHidden
    const locked = requiresVault && !reveal
    return {
      item_type: 'entry',
      id: e.entry_id,
      title: locked ? 'Hidden entry' : (e.title ?? 'Untitled'),
      deleted_at: e.deleted_at as string,
      journal_title: locked
        ? journalHidden
          ? 'Hidden journal'
          : (journal?.title ?? null)
        : (journal?.title ?? null),
      days_remaining: daysRemaining(e.deleted_at as string),
      requires_vault: requiresVault,
      locked,
    }
  })

  const journalItems: RecycleBinItem[] = (journals ?? []).map((j) => {
    const requiresVault = j.is_hidden
    const locked = requiresVault && !reveal
    return {
      item_type: 'journal',
      id: j.journal_id,
      title: locked ? 'Hidden journal' : j.title,
      deleted_at: j.deleted_at as string,
      journal_title: null,
      days_remaining: daysRemaining(j.deleted_at as string),
      requires_vault: requiresVault,
      locked,
    }
  })

  const initialItems = [...entryItems, ...journalItems].sort(
    (a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime(),
  )

  return (
    <>
      <LiveDataRefresh />
      <RecycleBinClient
        initialItems={initialItems}
        vaultSecretType={vaultSecretType}
      />
    </>
  )
}
