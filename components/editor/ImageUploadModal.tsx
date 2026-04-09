'use client'

import { useEffect, useRef, useState } from 'react'
import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import XHRUpload from '@uppy/xhr-upload'
import ImageEditor from '@uppy/image-editor'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import '@uppy/image-editor/css/style.min.css'

interface ImageUploadModalProps {
  entryId: string
  onUploadComplete: (mediaId: string, fileUrl: string) => void
  onClose: () => void
}

interface QuotaResponse {
  currentUsage: number
  limit: number
  remainingSpace: number
  percentUsed: number
}

const FIVE_MB = 5 * 1024 * 1024

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

interface ResizeOptions {
  maxWidth: number | null
  maxHeight: number | null
  scalePercent: number
}

// Resize an image Blob via canvas. Applies scalePercent first, then clamps to
// maxWidth/maxHeight while preserving aspect ratio. Re-encodes as the same
// MIME type (falls back to image/jpeg for non-canvas-encodable types).
async function resizeImageBlob(
  blob: Blob,
  { maxWidth, maxHeight, scalePercent }: ResizeOptions,
): Promise<Blob> {
  const noResize =
    (scalePercent === 100 || !Number.isFinite(scalePercent)) &&
    !maxWidth &&
    !maxHeight
  if (noResize) return blob

  const bitmap = await createImageBitmap(blob)
  let w = bitmap.width * (scalePercent / 100)
  let h = bitmap.height * (scalePercent / 100)

  if (maxWidth && w > maxWidth) {
    h = h * (maxWidth / w)
    w = maxWidth
  }
  if (maxHeight && h > maxHeight) {
    w = w * (maxHeight / h)
    h = maxHeight
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const outType =
    blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg'
  const resized = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), outType, 0.92),
  )
  return resized ?? blob
}

export default function ImageUploadModal({
  entryId,
  onUploadComplete,
  onClose,
}: ImageUploadModalProps) {
  const [quota, setQuota] = useState<QuotaResponse | null>(null)
  const [maxWidth, setMaxWidth] = useState<string>('')
  const [maxHeight, setMaxHeight] = useState<string>('')
  const [scalePercent, setScalePercent] = useState<number>(100)
  const dashboardTargetRef = useRef<HTMLDivElement>(null)

  // Keep callbacks + resize settings in refs so the Uppy lifecycle effect below
  // stays mounted for the entire modal lifetime (no resubscribes / no
  // double-destroy under React StrictMode), while the preprocessor still reads
  // the latest values at upload time.
  const onUploadCompleteRef = useRef(onUploadComplete)
  const onCloseRef = useRef(onClose)
  const resizeOptsRef = useRef<ResizeOptions>({
    maxWidth: null,
    maxHeight: null,
    scalePercent: 100,
  })
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete
    onCloseRef.current = onClose
  }, [onUploadComplete, onClose])
  useEffect(() => {
    const w = parseInt(maxWidth, 10)
    const h = parseInt(maxHeight, 10)
    resizeOptsRef.current = {
      maxWidth: Number.isFinite(w) && w > 0 ? w : null,
      maxHeight: Number.isFinite(h) && h > 0 ? h : null,
      scalePercent: Number.isFinite(scalePercent) ? scalePercent : 100,
    }
  }, [maxWidth, maxHeight, scalePercent])

  // Fetch current quota on mount.
  useEffect(() => {
    let cancelled = false
    fetch('/api/storage/quota')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: QuotaResponse | null) => {
        if (!cancelled && data) setQuota(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Own the full Uppy lifecycle in a single effect: create the instance, mount
  // Dashboard into the ref'd div, subscribe to upload-success, and destroy on
  // unmount. Doing this in one effect (instead of useMemo + multiple effects)
  // is what makes it StrictMode-safe — the second mount creates a fresh
  // instance instead of reusing one that the first cleanup already destroyed.
  useEffect(() => {
    const target = dashboardTargetRef.current
    if (!target) return

    const instance = new Uppy({
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: FIVE_MB,
        allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      },
    })
      .use(Dashboard, {
        target,
        inline: true,
        proudlyDisplayPoweredByUppy: false,
        hideProgressDetails: false,
        height: 400,
        plugins: ['ImageEditor'],
      })
      .use(ImageEditor, { quality: 0.8 })
      .use(XHRUpload, {
        endpoint: '/api/media',
        formData: true,
        fieldName: 'file',
        headers: {},
        allowedMetaFields: ['entry_id'],
        getResponseData: (xhr) => {
          try {
            return JSON.parse(xhr.responseText) as Record<string, unknown>
          } catch {
            return {}
          }
        },
      })

    instance.setMeta({ entry_id: entryId })

    // Resize/scale each file via canvas right before XHRUpload sends it.
    instance.addPreProcessor(async (fileIDs: string[]) => {
      for (const id of fileIDs) {
        const file = instance.getFile(id)
        if (!file?.data || !(file.data instanceof Blob)) continue
        try {
          const resized = await resizeImageBlob(file.data, resizeOptsRef.current)
          if (resized !== file.data) {
            instance.setFileState(id, {
              data: resized,
              size: resized.size,
              type: resized.type || file.type,
            })
          }
        } catch (err) {
          console.error('Image resize failed, uploading original', err)
        }
      }
    })

    const handleSuccess = (
      _file: unknown,
      response: { body?: Record<string, unknown> } | undefined,
    ) => {
      const body = response?.body ?? {}
      const mediaId = typeof body.media_id === 'string' ? body.media_id : null
      const fileUrl = typeof body.file_url === 'string' ? body.file_url : null
      if (mediaId && fileUrl) {
        toast.success('Image uploaded')
        onUploadCompleteRef.current(mediaId, fileUrl)
        onCloseRef.current()
      }
    }
    instance.on('upload-success', handleSuccess)

    return () => {
      instance.off('upload-success', handleSuccess)
      instance.destroy()
    }
  }, [entryId])

  // Escape closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const percentUsed = quota?.percentUsed ?? 0
  const barColor =
    percentUsed > 90
      ? 'bg-red-500'
      : percentUsed > 70
        ? 'bg-yellow-500'
        : 'bg-green-500'

  const lowSpace =
    quota !== null && quota.remainingSpace > 0 && quota.remainingSpace < FIVE_MB
  const noSpace = quota !== null && quota.remainingSpace === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-[#1E1E1E] border border-[#E0E0E0] dark:border-[#3A3A3A] shadow-xl p-4">
        <button
          type="button"
          aria-label="Close image uploader"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
          Insert image
        </h2>

        {/* Quota row — always rendered (skeleton until loaded) so layout
            doesn't shift when the fetch resolves. */}
        <div className="mb-3" aria-busy={quota === null}>
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
            <span>
              {quota
                ? `${formatStorageSize(quota.currentUsage)} / ${formatStorageSize(quota.limit)} used`
                : 'Loading storage usage…'}
            </span>
            <span>{quota ? `${percentUsed}%` : '—'}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${quota ? barColor : 'bg-[var(--bg-muted)]'}`}
              style={{ width: quota ? `${Math.min(100, percentUsed)}%` : '0%' }}
            />
          </div>
          <p
            className={`mt-2 text-xs text-yellow-700 dark:text-yellow-400 ${lowSpace ? '' : 'invisible'}`}
          >
            You are running low on storage. Consider deleting old media to free up space.
          </p>
        </div>

        {/* Resize / scale controls — applied to the file via canvas before
            it is sent to /api/media. */}
        <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--text-secondary)]">
            Max width (px)
            <input
              type="number"
              min={1}
              placeholder="auto"
              value={maxWidth}
              onChange={(e) => setMaxWidth(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#121212] px-2 py-1 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="text-xs text-[var(--text-secondary)]">
            Max height (px)
            <input
              type="number"
              min={1}
              placeholder="auto"
              value={maxHeight}
              onChange={(e) => setMaxHeight(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#121212] px-2 py-1 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="text-xs text-[var(--text-secondary)]">
            Scale: {scalePercent}%
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={scalePercent}
              onChange={(e) => setScalePercent(parseInt(e.target.value, 10))}
              className="mt-2 w-full accent-[var(--brand)]"
            />
          </label>
        </div>

        {noSpace ? (
          <p className="text-sm text-red-600 dark:text-red-400 py-8 text-center">
            Storage limit reached. Delete existing media to upload new files.
          </p>
        ) : (
          <div ref={dashboardTargetRef} />
        )}
      </div>
    </div>
  )
}
