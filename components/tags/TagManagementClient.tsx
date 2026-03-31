'use client'

import React, { useState, useTransition } from 'react'
import { Pencil, Trash2, GitMerge, Check, X, Tag, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { updateTag, deleteTag } from '@/lib/actions/tags'
import { TAG_COLORS } from '@/lib/validations/tags'
import TagChip from '@/components/ui/TagChip'
import MergeTagModal from './MergeTagModal'
import type { TagEntryRef } from '@/app/(app)/tags/page'

interface TagRow {
  tag_id: string
  tag_name: string
  color: string
  usage_count: number
}

interface TagManagementClientProps {
  initialTags: TagRow[]
  tagEntriesMap: Record<string, TagEntryRef[]>
}

export default function TagManagementClient({ initialTags, tagEntriesMap }: TagManagementClientProps) {
  const router = useRouter()
  const [tags, setTags] = useState<TagRow[]>(initialTags)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set())

  function toggleExpanded(tagId: string) {
    setExpandedTagIds((prev) => {
      const next = new Set(prev)
      next.has(tagId) ? next.delete(tagId) : next.add(tagId)
      return next
    })
  }
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editError, setEditError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null)
  const [mergeSource, setMergeSource] = useState<TagRow | null>(null)
  const [isPending, startTransition] = useTransition()

  function startEdit(tag: TagRow) {
    setEditingId(tag.tag_id)
    setEditName(tag.tag_name)
    setEditColor(tag.color)
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditColor('')
    setEditError('')
  }

  async function handleSave(tagId: string) {
    setEditError('')
    const result = await updateTag(tagId, { tag_name: editName, color: editColor as TagRow['color'] })
    if ('error' in result) {
      setEditError(result.error ?? 'Failed to update tag')
      return
    }
    setTags((prev) =>
      prev.map((t) =>
        t.tag_id === tagId
          ? { ...t, tag_name: result.tag.tag_name, color: result.tag.color }
          : t,
      ),
    )
    setEditingId(null)
    toast.success('Tag updated')
    router.refresh()
  }

  async function handleDelete(tagId: string) {
    const result = await deleteTag(tagId)
    setDeleteTarget(null)
    if ('error' in result) {
      toast.error(result.error ?? 'Failed to delete tag')
      return
    }
    setTags((prev) => prev.filter((t) => t.tag_id !== tagId))
    toast.success('Tag deleted')
  }

  function handleMergeSuccess() {
    startTransition(() => {
      router.refresh()
    })
  }

  const otherTags = mergeSource
    ? tags.filter((t) => t.tag_id !== mergeSource.tag_id)
    : []

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <Tag className="w-12 h-12 text-[#E0E0E0] dark:text-[#3A3A3A]" />
        <h2 className="text-lg font-medium text-[var(--text-secondary)]">No tags yet</h2>
        <p className="text-sm text-[var(--text-muted)]">Tags you add to entries will appear here.</p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-muted)]">
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] w-10">
                Colour
              </th>
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)]">
                Tag Name
              </th>
              <th className="text-left px-4 py-3 font-medium text-[var(--text-secondary)] w-28">
                Entry Count
              </th>
              <th className="text-right px-4 py-3 font-medium text-[var(--text-secondary)] w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tags.map((tag) => {
              const entries = tagEntriesMap[tag.tag_id] ?? []
              const isExpanded = expandedTagIds.has(tag.tag_id)
              return (
                <React.Fragment key={tag.tag_id}>
                  <tr
                    className="bg-[var(--bg-surface)] hover:bg-[var(--bg-muted)] transition-colors"
                  >
                    {/* Colour swatch */}
                    <td className="px-4 py-3">
                      <span
                        className="w-5 h-5 rounded-full inline-block"
                        style={{ backgroundColor: tag.color }}
                      />
                    </td>

                    {/* Tag name / edit mode */}
                    <td className="px-4 py-3">
                      {editingId === tag.tag_id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => {
                              setEditName(e.target.value)
                              setEditError('')
                            }}
                            className="px-2 py-1 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1976D2] w-48"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSave(tag.tag_id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          {/* Colour picker */}
                          <div className="flex gap-1.5 flex-wrap">
                            {TAG_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setEditColor(c)}
                                className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                                  editColor === c ? 'ring-2 ring-offset-1 ring-[#1976D2]' : ''
                                }`}
                                style={{ backgroundColor: c }}
                                aria-label={`Select colour ${c}`}
                              />
                            ))}
                          </div>
                          {editError && (
                            <p className="text-xs text-red-500 dark:text-red-400">{editError}</p>
                          )}
                        </div>
                      ) : (
                        <TagChip tagName={tag.tag_name} color={tag.color} size="sm" />
                      )}
                    </td>

                    {/* Entry count — clickable to expand */}
                    <td className="px-4 py-3">
                      {tag.usage_count > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(tag.tag_id)}
                          className="flex items-center gap-1 text-[#1976D2] hover:underline text-sm font-medium"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} entries for ${tag.tag_name}`}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {tag.usage_count}
                        </button>
                      ) : (
                        <span className="text-sm text-[var(--text-secondary)]">0</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editingId === tag.tag_id ? (
                          <>
                            <button
                              onClick={() => handleSave(tag.tag_id)}
                              className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors text-green-600 dark:text-green-400"
                              aria-label="Save"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
                              aria-label="Cancel"
                            >
                              <X size={15} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(tag)}
                              className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
                              aria-label={`Edit tag ${tag.tag_name}`}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setMergeSource(tag)}
                              className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
                              aria-label={`Merge tag ${tag.tag_name}`}
                              disabled={tags.length < 2}
                            >
                              <GitMerge size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(tag)}
                              className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500 dark:text-red-400"
                              aria-label={`Delete tag ${tag.tag_name}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expanded entries sub-row */}
                  {isExpanded && entries.length > 0 && (
                    <tr className="bg-[var(--bg-muted)]">
                      <td colSpan={4} className="px-4 py-3">
                        <ul className="flex flex-col gap-1.5 pl-2">
                          {entries.map((entry) => (
                            <li key={entry.entry_id}>
                              <Link
                                href={`/journals/${entry.journal_id}/entries/${entry.entry_id}`}
                                className="flex items-center gap-2 text-sm text-[var(--text-primary)] hover:text-[#1976D2] transition-colors group"
                              >
                                <FileText size={13} className="shrink-0 text-[var(--text-secondary)] group-hover:text-[#1976D2]" />
                                {entry.title?.trim() || 'Untitled entry'}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="flex flex-col gap-3 sm:hidden">
        {tags.map((tag) => {
          const entries = tagEntriesMap[tag.tag_id] ?? []
          const isExpanded = expandedTagIds.has(tag.tag_id)
          return (
            <div
              key={tag.tag_id}
              className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] p-4"
            >
              {editingId === tag.tag_id ? (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value)
                      setEditError('')
                    }}
                    className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1976D2]"
                    autoFocus
                  />
                  <div className="flex gap-2 flex-wrap">
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                          editColor === c ? 'ring-2 ring-offset-1 ring-[#1976D2]' : ''
                        }`}
                        style={{ backgroundColor: c }}
                        aria-label={`Select colour ${c}`}
                      />
                    ))}
                  </div>
                  {editError && (
                    <p className="text-xs text-red-500 dark:text-red-400">{editError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(tag.tag_id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#1976D2] rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex-1 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-muted)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="min-w-0">
                        <TagChip tagName={tag.tag_name} color={tag.color} size="sm" />
                        {tag.usage_count > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(tag.tag_id)}
                            className="flex items-center gap-1 text-xs text-[#1976D2] hover:underline mt-1"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {tag.usage_count} {tag.usage_count === 1 ? 'entry' : 'entries'}
                          </button>
                        ) : (
                          <p className="text-xs text-[var(--text-muted)] mt-1">0 entries</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(tag)}
                        className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
                        aria-label={`Edit tag ${tag.tag_name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setMergeSource(tag)}
                        className="p-1.5 rounded hover:bg-[var(--bg-muted)] transition-colors text-[var(--text-secondary)]"
                        aria-label={`Merge tag ${tag.tag_name}`}
                        disabled={tags.length < 2}
                      >
                        <GitMerge size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(tag)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-500 dark:text-red-400"
                        aria-label={`Delete tag ${tag.tag_name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded entries */}
                  {isExpanded && entries.length > 0 && (
                    <ul className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[var(--border)] pl-1">
                      {entries.map((entry) => (
                        <li key={entry.entry_id}>
                          <Link
                            href={`/journals/${entry.journal_id}/entries/${entry.entry_id}`}
                            className="flex items-center gap-2 text-sm text-[var(--text-primary)] hover:text-[#1976D2] transition-colors group"
                          >
                            <FileText size={13} className="shrink-0 text-[var(--text-secondary)] group-hover:text-[#1976D2]" />
                            {entry.title?.trim() || 'Untitled entry'}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDeleteTarget(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm bg-[var(--bg-surface)] rounded-xl shadow-2xl border border-[var(--border)] p-6">
            <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
              Delete tag &ldquo;{deleteTarget.tag_name}&rdquo;?
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              It will be removed from {deleteTarget.usage_count}{' '}
              {deleteTarget.usage_count === 1 ? 'entry' : 'entries'}. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.tag_id)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeSource && (
        <MergeTagModal
          sourceTag={mergeSource}
          allTags={otherTags}
          onClose={() => setMergeSource(null)}
          onSuccess={handleMergeSuccess}
        />
      )}
    </>
  )
}
