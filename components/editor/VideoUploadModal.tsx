'use client'

import { useEffect, useRef, useState } from 'react'
import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import { Film, X } from 'lucide-react'
import { toast } from 'sonner'
import VideoTrimmer from './VideoTrimmer'

import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'

// ─── Types ───────────────────────────────────────────────────

interface VideoUploadModalProps {
  entryId: string
  onUploadComplete: (mediaId: string, fileUrl: string, thumbnailUrl: string | null) => void
  onClose: () => void
}

interface QuotaResponse {
  currentUsage: number
  limit: number
  remainingSpace: number
  percentUsed: number
}

type Stage = 'select' | 'trim' | 'upload'

// ─── Constants ───────────────────────────────────────────────

const FIVE_MB = 5 * 1024 * 1024

// ─── Helpers ─────────────────────────────────────────────────

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

// ─── Main component ──────────────────────────────────────────

export default function VideoUploadModal({
  entryId,
  onUploadComplete,
  onClose,
}: VideoUploadModalProps) {
  const [stage, setStage] = useState<Stage>('select')
  const [quota, setQuota] = useState<QuotaResponse | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Trimmed video data — set when VideoTrimmer calls onTrimComplete
  const trimmedRef = useRef<{
    file: File
    thumbnail: File
    metadata: { duration: number; width: number; height: number }
  } | null>(null)

  const dashboardTargetRef = useRef<HTMLDivElement>(null)
  const onUploadCompleteRef = useRef(onUploadComplete)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete
    onCloseRef.current = onClose
  }, [onUploadComplete, onClose])

  // Fetch quota on mount
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

  // Uppy instance lifecycle — only active on 'select' stage
  useEffect(() => {
    if (stage !== 'select') return
    const target = dashboardTargetRef.current
    if (!target) return

    const instance = new Uppy({
      autoProceed: false,
      restrictions: {
        maxNumberOfFiles: 1,
        // Generous limit here — the 30 MB limit is enforced after trimming.
        maxFileSize: 100 * 1024 * 1024,
        allowedFileTypes: ['video/mp4', 'video/webm'],
      },
    }).use(Dashboard, {
      target,
      inline: true,
      proudlyDisplayPoweredByUppy: false,
      hideProgressDetails: false,
      height: 300,
      note: 'MP4 or WebM · will be trimmed before upload',
    })

    // No XHRUpload — upload is manual after trimming (Stage 3)

    instance.on('file-added', (file) => {
      if (!(file.data instanceof File)) return
      setSelectedFile(file.data)
      setStage('trim')
    })

    return () => {
      instance.destroy()
    }
  }, [stage]) // re-mount Uppy when returning to 'select' stage

  // Escape closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Handlers ────────────────────────────────────────────────

  function handleTrimComplete(
    trimmedFile: File,
    thumbnail: File,
    metadata: { duration: number; width: number; height: number },
  ) {
    trimmedRef.current = { file: trimmedFile, thumbnail, metadata }
    setStage('upload')
    doUpload(trimmedFile, thumbnail, metadata)
  }

  function doUpload(
    trimmedFile: File,
    thumbnail: File,
    metadata: { duration: number; width: number; height: number },
  ) {
    setUploadProgress(0)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', trimmedFile)
    formData.append('entry_id', entryId)
    formData.append('duration', metadata.duration.toString())
    formData.append('width', metadata.width.toString())
    formData.append('height', metadata.height.toString())
    formData.append('thumbnail_file', thumbnail)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as {
            media_id?: string
            file_url?: string
            thumbnail_url?: string | null
          }
          if (body.media_id && body.file_url) {
            toast.success('Video uploaded')
            onUploadCompleteRef.current(
              body.media_id,
              body.file_url,
              body.thumbnail_url ?? null,
            )
            onCloseRef.current()
          } else {
            setUploadError('Upload failed: unexpected response from server')
          }
        } catch {
          setUploadError('Upload failed: could not parse server response')
        }
      } else {
        let message = `Upload failed (${xhr.status})`
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string }
          if (body.error) message = body.error
        } catch { /* noop */ }
        setUploadError(message)
      }
    })

    xhr.addEventListener('error', () => {
      setUploadError('Upload failed: network error. Please check your connection.')
    })

    xhr.open('POST', '/api/media')
    xhr.send(formData)
  }

  function handleRetry() {
    const ref = trimmedRef.current
    if (!ref) return
    setStage('upload')
    doUpload(ref.file, ref.thumbnail, ref.metadata)
  }

  // ── Derived ────────────────────────────────────────────────

  const percentUsed = quota?.percentUsed ?? 0
  const barColor =
    percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'
  const noSpace = quota !== null && quota.remainingSpace === 0
  const lowSpace =
    quota !== null && quota.remainingSpace > 0 && quota.remainingSpace < FIVE_MB

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-[#1E1E1E] border border-[var(--border-strong)] dark:border-[#3A3A3A] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--border)] dark:border-[#3A3A3A] shrink-0 bg-white dark:bg-[#1E1E1E]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1976D2]/10 text-[#1976D2] shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                Insert video
              </h2>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {stage === 'select' && 'Choose a video file to upload'}
                {stage === 'trim' && 'Trim your video before uploading'}
                {stage === 'upload' && 'Uploading your video…'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close video uploader"
            onClick={onClose}
            className="p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5">
          {/* Quota bar — shown on select and trim stages */}
          {stage !== 'upload' && (
            <div aria-busy={quota === null}>
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
                <span className="font-medium">
                  {quota
                    ? `${formatStorageSize(quota.currentUsage)} / ${formatStorageSize(quota.limit)} used`
                    : 'Loading storage usage…'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden border border-[var(--border)] dark:border-[#3A3A3A]">
                <div
                  className={`h-full transition-all duration-300 ${quota ? barColor : ''}`}
                  style={{ width: quota ? `${Math.min(100, percentUsed)}%` : '0%' }}
                />
              </div>
              {lowSpace && (
                <p className="mt-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                  You are running low on storage (
                  {quota ? formatStorageSize(quota.remainingSpace) : '?'} remaining). Your
                  video will need to be trimmed to fit.
                </p>
              )}
            </div>
          )}

          {/* Stage 1 — File selection */}
          {stage === 'select' && (
            <>
              {noSpace ? (
                <p className="text-sm text-red-600 dark:text-red-400 py-12 text-center border border-dashed border-red-300 dark:border-red-900 rounded-lg">
                  Storage limit reached. Delete existing media to upload new files.
                </p>
              ) : (
                <div ref={dashboardTargetRef} />
              )}
            </>
          )}

          {/* Stage 2 — Trimming */}
          {stage === 'trim' && selectedFile && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null)
                  setStage('select')
                }}
                className="text-xs text-[#1976D2] hover:underline"
              >
                ← Pick a different file
              </button>
              <VideoTrimmer
                file={selectedFile}
                onTrimComplete={handleTrimComplete}
                onCancel={() => {
                  setSelectedFile(null)
                  setStage('select')
                }}
              />
            </>
          )}

          {/* Stage 3 — Uploading */}
          {stage === 'upload' && (
            <div className="space-y-4 py-4">
              {!uploadError ? (
                <>
                  <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                    <div className="w-4 h-4 rounded-full border-2 border-[#1976D2] border-t-transparent animate-spin shrink-0" />
                    <span>Uploading video… {uploadProgress > 0 ? `${uploadProgress}%` : ''}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
                    <div
                      className="h-full bg-[#1976D2] transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-600 dark:text-red-400 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 px-3 py-2">
                    {uploadError}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="flex-1 rounded-lg bg-[#1976D2] hover:bg-[#1565C0] text-white text-sm font-medium px-4 py-2 transition-colors"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage('trim')}
                      className="flex-1 rounded-lg border border-[var(--border-strong)] dark:border-[#3A3A3A] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] text-sm px-4 py-2 transition-colors"
                    >
                      Back to trim
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
