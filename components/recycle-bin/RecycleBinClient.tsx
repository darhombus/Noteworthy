'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen, FileText, Lock, ShieldCheck, Trash2 } from 'lucide-react'
import ConfirmDeleteModal from '@/components/recycle-bin/ConfirmDeleteModal'
import ClearAllModal from '@/components/recycle-bin/ClearAllModal'
import VaultUnlockModal from '@/components/privacy/VaultUnlockModal'
import { hideBin } from '@/lib/actions/vault'

export interface RecycleBinItem {
  item_type: 'entry' | 'journal'
  id: string
  title: string
  deleted_at: string
  journal_title: string | null
  days_remaining: number
  /** Row is hidden (or its parent journal is). True even after the
   *  vault unlocks, so the SSR re-render after unlock can still tell
   *  these rows apart from rows that never needed the vault. */
  requires_vault: boolean
  /** requires_vault AND vault is currently closed → title is redacted
   *  on the server, Restore / Delete-permanently are disabled, and
   *  clicking the row opens the unlock modal. */
  locked: boolean
}

function DaysBadge({ days }: { days: number }) {
  const colour =
    days > 20
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : days >= 10
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colour}`}>
      {days}d left
    </span>
  )
}

interface Props {
  initialItems: RecycleBinItem[]
  /** Drives the unlock modal's input shape. Null when no vault has
   *  been configured — in which case no row would be locked anyway. */
  vaultSecretType: 'pin' | 'password' | null
}

export default function RecycleBinClient({ initialItems, vaultSecretType }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<RecycleBinItem[]>(initialItems)
  const [deleteTarget, setDeleteTarget] = useState<RecycleBinItem | null>(null)
  const [showClearAll, setShowClearAll] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)
  const [lockPending, startLockTransition] = useTransition()

  // Sync local state when the server passes a new snapshot — fires
  // after `router.refresh()` (e.g. on vault unlock, where the SSR
  // re-renders with locked rows now unredacted) and after
  // LiveDataRefresh's realtime invalidations. Without this the
  // `useState(initialItems)` initializer would only seed once on
  // first mount and the table would keep showing stale "Hidden
  // entry" placeholders after the vault opens.
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  const lockedCount = items.filter((i) => i.locked).length
  // Rows that came from the Hidden vault — counted whether or not the
  // vault is currently open, since the relock affordance also wants
  // to know "did the user reveal anything via the vault?".
  const vaultRowCount = items.filter((i) => i.requires_vault).length
  // Vault is open iff it WAS open at SSR time AND there's at least one
  // vault-requiring row in the bin (otherwise there's nothing to relock
  // from this surface). `requires_vault && !locked` is the unredacted
  // form — if any such row exists, the vault is open and revealed it.
  const hasRevealedVaultRows = items.some((i) => i.requires_vault && !i.locked)

  function requestUnlock() {
    if (!vaultSecretType) {
      toast.error('No vault has been configured.')
      return
    }
    setShowUnlock(true)
  }

  function handleHideBin() {
    // Closes only the bin-reveal cookie; the actual vault is
    // untouched. The SSR re-render swaps unredacted titles back to
    // "Hidden entry" / "Hidden journal" placeholders without
    // affecting any /hidden navigation that may be in flight.
    startLockTransition(async () => {
      try {
        await hideBin()
        toast.success('Hidden items hidden again')
        router.refresh()
      } catch {
        toast.error('Failed to hide items')
      }
    })
  }

  async function handleRestore(item: RecycleBinItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    toast.success(`"${item.title}" restored`)
    try {
      const res = await fetch(`/api/recycle-bin/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.item_type }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems((prev) => [item, ...prev])
      toast.error('Failed to restore item')
    }
  }

  async function handlePermanentDelete(item: RecycleBinItem) {
    setDeleteTarget(null)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    toast.success(`"${item.title}" permanently deleted`)
    try {
      const res = await fetch(`/api/recycle-bin/${item.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.item_type }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems((prev) => [item, ...prev])
      toast.error('Failed to delete item')
    }
  }

  async function handleClearAll() {
    const previous = items
    setItems([])
    setShowClearAll(false)
    toast.success('Recycle bin cleared')
    try {
      const res = await fetch('/api/recycle-bin/all', { method: 'DELETE' })
      if (!res.ok) throw new Error()
    } catch {
      setItems(previous)
      toast.error('Failed to clear recycle bin')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#212121] dark:text-[#F5F5F5]">
            Recycle Bin
          </h1>
          <p className="mt-1 text-sm text-[#757575] dark:text-[#9E9E9E]">
            Items are permanently deleted after 30 days.
          </p>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => setShowClearAll(true)}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Vault banner — three states.
          1. Locked, items present: prompt to unlock.
          2. Open, items revealed: offer to relock so the user can
             redact in place without navigating away.
          3. No vault rows in the bin: nothing rendered. */}
      {lockedCount > 0 ? (
        <button
          type="button"
          onClick={requestUnlock}
          className="mb-4 flex w-full items-center gap-3 rounded-lg border border-[#1976D2]/30 bg-[#1976D2]/10 px-4 py-3 text-left text-sm transition-colors hover:bg-[#1976D2]/15 dark:border-[#1E3A5F] dark:bg-[#1E3A5F]/40 dark:hover:bg-[#234670]"
        >
          <Lock size={16} className="shrink-0 text-[#1976D2] dark:text-[#64B5F6]" />
          <span className="flex-1 text-[#1976D2] dark:text-[#64B5F6]">
            {lockedCount} {lockedCount === 1 ? 'item is' : 'items are'} from your
            Hidden vault.{' '}
            <span className="font-semibold underline">
              {vaultSecretType === 'pin'
                ? 'Enter your PIN to reveal them.'
                : 'Enter your password to reveal them.'}
            </span>
          </span>
        </button>
      ) : hasRevealedVaultRows ? (
        <button
          type="button"
          onClick={handleHideBin}
          disabled={lockPending}
          className="mb-4 flex w-full items-center gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-left text-sm transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40"
        >
          <ShieldCheck
            size={16}
            className="shrink-0 text-emerald-700 dark:text-emerald-400"
          />
          <span className="flex-1 text-emerald-800 dark:text-emerald-300">
            {vaultRowCount}{' '}
            {vaultRowCount === 1 ? 'hidden item is' : 'hidden items are'} revealed
            below.{' '}
            <span className="font-semibold underline">
              {lockPending ? 'Hiding…' : 'Click to hide them again.'}
            </span>
          </span>
        </button>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Trash2 className="mb-4 h-12 w-12 text-[#E0E0E0] dark:text-[#3A3A3A]" />
          <p className="text-base font-medium text-[#212121] dark:text-[#F5F5F5]">
            Recycle bin is empty
          </p>
          <p className="mt-1 text-sm text-[#757575] dark:text-[#9E9E9E]">
            Deleted items appear here for 30 days.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E0E0E0] bg-white shadow-sm dark:border-[#3A3A3A] dark:bg-[#1E1E1E]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E0E0E0] bg-[#F5F5F5] dark:border-[#3A3A3A] dark:bg-[#2C2C2C]">
                <th className="px-4 py-3 text-left font-medium text-[#757575] dark:text-[#9E9E9E]">
                  Title
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#757575] dark:text-[#9E9E9E]">
                  Type
                </th>
                <th className="hidden px-4 py-3 text-left font-medium text-[#757575] dark:text-[#9E9E9E] sm:table-cell">
                  Journal
                </th>
                <th className="hidden px-4 py-3 text-left font-medium text-[#757575] dark:text-[#9E9E9E] md:table-cell">
                  Deleted
                </th>
                <th className="px-4 py-3 text-left font-medium text-[#757575] dark:text-[#9E9E9E]">
                  Expires
                </th>
                <th className="px-4 py-3 text-right font-medium text-[#757575] dark:text-[#9E9E9E]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E0E0E0] dark:divide-[#3A3A3A]">
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-[#FAFAFA] dark:hover:bg-[#121212]/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.item_type === 'journal' ? (
                        <BookOpen size={16} className="shrink-0 text-[#1976D2]" />
                      ) : (
                        <FileText size={16} className="shrink-0 text-[#757575] dark:text-[#9E9E9E]" />
                      )}
                      {item.locked ? (
                        // Clickable placeholder — opens the unlock
                        // dialog. The title text mirrors the row's
                        // type so the user understands what's behind
                        // the lock without leaking the real name.
                        <button
                          type="button"
                          onClick={requestUnlock}
                          className="flex items-center gap-1.5 truncate text-left font-medium italic text-[#1976D2] hover:underline dark:text-[#64B5F6]"
                          title={
                            vaultSecretType === 'pin'
                              ? 'Enter PIN to reveal'
                              : 'Enter password to reveal'
                          }
                        >
                          <span className="max-w-[160px] truncate">{item.title}</span>
                          <Lock size={12} className="shrink-0" aria-label="Locked by vault" />
                        </button>
                      ) : (
                        <span className="max-w-[180px] truncate font-medium text-[#212121] dark:text-[#F5F5F5]">
                          {item.title}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-[#757575] dark:text-[#9E9E9E]">
                    {item.item_type}
                  </td>
                  <td className="hidden px-4 py-3 text-[#757575] dark:text-[#9E9E9E] sm:table-cell">
                    {item.journal_title ?? <span className="text-[#E0E0E0] dark:text-[#3A3A3A]">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-[#757575] dark:text-[#9E9E9E] md:table-cell">
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    }).format(new Date(item.deleted_at))}
                  </td>
                  <td className="px-4 py-3">
                    <DaysBadge days={item.days_remaining} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={item.locked}
                        title={
                          item.locked
                            ? vaultSecretType === 'pin'
                              ? 'Enter PIN to restore'
                              : 'Enter password to restore'
                            : undefined
                        }
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-[#1976D2] hover:bg-blue-50 dark:hover:bg-[#1E3A5F]/30 disabled:cursor-not-allowed disabled:text-[#9E9E9E] disabled:opacity-50 disabled:hover:bg-transparent dark:disabled:text-[#616161] dark:disabled:hover:bg-transparent"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        disabled={item.locked}
                        title={
                          item.locked
                            ? vaultSecretType === 'pin'
                              ? 'Enter PIN to delete'
                              : 'Enter password to delete'
                            : undefined
                        }
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:cursor-not-allowed disabled:text-[#9E9E9E] disabled:opacity-50 disabled:hover:bg-transparent dark:disabled:text-[#616161] dark:disabled:hover:bg-transparent"
                      >
                        Delete permanently
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          title={deleteTarget.title}
          onConfirm={() => handlePermanentDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showClearAll && (
        <ClearAllModal
          onConfirm={handleClearAll}
          onCancel={() => setShowClearAll(false)}
        />
      )}

      {showUnlock && vaultSecretType && (
        <VaultUnlockModal
          secretType={vaultSecretType}
          mode="bin"
          onClose={() => setShowUnlock(false)}
        />
      )}
    </div>
  )
}
