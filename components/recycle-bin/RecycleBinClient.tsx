'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, FileText, Trash2 } from 'lucide-react'
import ConfirmDeleteModal from '@/components/recycle-bin/ConfirmDeleteModal'
import ClearAllModal from '@/components/recycle-bin/ClearAllModal'

export interface RecycleBinItem {
  item_type: 'entry' | 'journal'
  id: string
  title: string
  deleted_at: string
  journal_title: string | null
  days_remaining: number
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
}

export default function RecycleBinClient({ initialItems }: Props) {
  const [items, setItems] = useState<RecycleBinItem[]>(initialItems)
  const [deleteTarget, setDeleteTarget] = useState<RecycleBinItem | null>(null)
  const [showClearAll, setShowClearAll] = useState(false)

  async function handleRestore(item: RecycleBinItem) {
    // Optimistic: remove from list and show toast immediately.
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    toast.success(`"${item.title}" restored`)
    // Drop any in-session "unlocked" grant so a restored locked item forces
    // re-authentication via LockScreen on next open. Otherwise a user who
    // unlocked the item before deleting it would re-enter without a prompt.
    sessionStorage.removeItem(`nw:unlocked:${item.item_type}:${item.id}`)
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
    // Optimistic: close modal, remove from list, and show toast immediately.
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
    // Optimistic: clear list, close modal, and show toast immediately.
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
                      <span className="truncate max-w-[180px] font-medium text-[#212121] dark:text-[#F5F5F5]">
                        {item.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-[#757575] dark:text-[#9E9E9E]">
                    {item.item_type}
                  </td>
                  <td className="hidden px-4 py-3 text-[#757575] dark:text-[#9E9E9E] sm:table-cell">
                    {item.journal_title ?? <span className="text-[#E0E0E0] dark:text-[#3A3A3A]">—</span>}
                  </td>
                  <td className="hidden px-4 py-3 text-[#757575] dark:text-[#9E9E9E] md:table-cell">
                    {new Date(item.deleted_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <DaysBadge days={item.days_remaining} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-[#1976D2] hover:bg-blue-50 dark:hover:bg-[#1E3A5F]/30"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
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
    </div>
  )
}
