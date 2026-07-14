import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
import { isBinRevealed } from '@/lib/privacy/binReveal'
import RecycleBinClient from '@/components/recycle-bin/RecycleBinClient'
import type { RecycleBinItem } from '@/components/recycle-bin/RecycleBinClient'

export default async function RecycleBinPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/login')
  const supabase = await createClient()

  // Redaction is gated only by the bin-reveal cookie. Opening the
  // vault elsewhere does not auto-reveal the bin.
  const reveal = await isBinRevealed(userId)

  const now = Date.now()
  const daysRemaining = (deletedAt: string) =>
    Math.max(0, 30 - Math.floor((now - new Date(deletedAt).getTime()) / 86_400_000))

  const [{ data: entries }, { data: journals }] = await Promise.all([
    supabase
      .from('entries')
      .select('entry_id, title, deleted_at, is_hidden, journals!inner(title, is_hidden, user_id)')
      .not('deleted_at', 'is', null)
      .eq('journals.user_id', userId),
    supabase
      .from('journals')
      .select('journal_id, title, deleted_at, is_hidden')
      .eq('user_id', userId)
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
      <RecycleBinClient
        initialItems={initialItems}
        vaultSecretType={null}
      />
    </>
  )
}
