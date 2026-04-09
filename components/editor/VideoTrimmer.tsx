'use client'

/**
 * VideoTrimmer — client-side video trimming via the browser MediaRecorder API.
 *
 * Why NOT ffmpeg.wasm:
 *   - @ffmpeg/core single-threaded: "memory access out of bounds" on files > ~5 MB
 *   - @ffmpeg/core-mt multi-threaded: loads a 30+ MB WASM binary (10-30 s delay)
 *     and the nested SharedArrayBuffer workers hang inside Next.js dev server
 *
 * Why MediaRecorder:
 *   - No binary to download — trim controls appear instantly
 *   - Browser-native, handles any codec the browser can play
 *   - Progress tracks in real-time
 *
 * UX flow:
 *   1. User sees video + trim sliders → adjusts start / end
 *   2. Clicks "Trim" → browser records the segment in real-time
 *   3. Preview of trimmed clip appears → user reviews
 *   4. "Upload trimmed video" OR "Re-trim" → only on explicit action
 *   5. "Upload original" skips trimming entirely
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Film, Loader2, Scissors, Upload, X } from 'lucide-react'

const MAX_DURATION_SECONDS = 120
const MAX_VIDEO_BYTES = 30 * 1024 * 1024

interface VideoTrimmerProps {
  file: File
  onTrimComplete: (
    trimmedFile: File,
    thumbnail: File,
    metadata: { duration: number; width: number; height: number },
  ) => void
  onCancel: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function captureCanvasThumbnail(videoEl: HTMLVideoElement): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth || 640
    canvas.height = videoEl.videoHeight || 360
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('Canvas 2D unavailable')); return }
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Canvas toBlob returned null')); return }
        resolve(new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.85,
    )
  })
}

function getVideoMetadata(
  file: File,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const vid = document.createElement('video')
    vid.preload = 'metadata'
    vid.muted = true
    vid.onloadedmetadata = () => {
      const result = {
        duration: Math.round(vid.duration) || 0,
        width: vid.videoWidth || 0,
        height: vid.videoHeight || 0,
      }
      URL.revokeObjectURL(url)
      resolve(result)
    }
    vid.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ duration: 0, width: 0, height: 0 })
    }
    vid.src = url
  })
}

// Typed to include the non-standard mozCaptureStream Firefox variant
type CaptureStreamVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

export default function VideoTrimmer({ file, onTrimComplete, onCancel }: VideoTrimmerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trimmedVideoRef = useRef<HTMLVideoElement>(null)
  // Lets the rAF tick know when to stop without stale-closure issues
  const activeRef = useRef(false)
  // Tracks whether we're mid-duration-fix seek so onSeeked knows what to do
  const fixingTrimmedDurationRef = useRef(false)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [totalDuration, setTotalDuration] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)

  const [trimming, setTrimming] = useState(false)
  const [trimProgress, setTrimProgress] = useState(0)
  const [trimError, setTrimError] = useState<string | null>(null)

  // Populated after a successful trim
  const [trimmedBlob, setTrimmedBlob] = useState<Blob | null>(null)
  const [trimmedUrl, setTrimmedUrl] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Create object URL for the original file
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => { URL.revokeObjectURL(url); setVideoUrl(null) }
  }, [file])

  // Clean up trimmed preview URL on unmount
  useEffect(() => {
    return () => {
      if (trimmedUrl) URL.revokeObjectURL(trimmedUrl)
    }
  }, [trimmedUrl])

  // Stop any in-progress recording if the component unmounts
  useEffect(() => {
    return () => { activeRef.current = false }
  }, [])

  // ── Spacebar fix for fullscreen ──────────────────────────────
  //
  // Root cause: clicking the fullscreen button in the native video controls
  // leaves that shadow-DOM button focused. Pressing space then fires keyup on
  // the focused button, which re-activates it (toggling fullscreen instead of
  // playing/pausing). Intercepting only keydown is not enough because Chrome
  // activates buttons on keyup.
  //
  // Fix:
  //   1. On fullscreenchange — blur whatever element has focus so the
  //      fullscreen button is no longer the target for keyup.
  //   2. keydown capture — intercept space, play/pause manually, stop
  //      propagation so nothing downstream sees it.
  //   3. keyup capture — intercept space and preventDefault/stopPropagation
  //      so the blurred-but-still-somehow-targeted button cannot activate.
  //
  // All listeners use useCapture=true so they fire before any other handler
  // in the document, including the shadow DOM.
  useEffect(() => {
    const isOurVideoFullscreen = () => {
      const vid = videoRef.current
      if (!vid) return false
      const fs =
        document.fullscreenElement ??
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement
      return fs === vid
    }

    const onFullscreenChange = () => {
      if (isOurVideoFullscreen()) {
        // Remove focus from the native control button so it can't be
        // re-activated by keyup
        ;(document.activeElement as HTMLElement | null)?.blur()
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !isOurVideoFullscreen()) return
      e.preventDefault()
      e.stopPropagation()
      const vid = videoRef.current!
      if (vid.paused) void vid.play()
      else vid.pause()
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !isOurVideoFullscreen()) return
      // Prevent keyup from activating any focused button
      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
    }
  }, [])

  function handleMetadataLoaded() {
    const vid = videoRef.current
    if (!vid) return
    const dur = isFinite(vid.duration) ? vid.duration : 0
    setTotalDuration(dur)
    setStartTime(0)
    setEndTime(Math.min(dur, MAX_DURATION_SECONDS))
  }

  // ── Trim ─────────────────────────────────────────────────────

  async function handleTrim() {
    const vid = videoRef.current
    if (!vid) return

    const segDuration = endTime - startTime
    if (segDuration <= 0) return

    // Reset previous result
    if (trimmedUrl) { URL.revokeObjectURL(trimmedUrl); setTrimmedUrl(null) }
    setTrimmedBlob(null)
    setTrimError(null)
    setTrimProgress(0)
    setTrimming(true)
    activeRef.current = true

    try {
      const captureStreamFn =
        (vid as CaptureStreamVideo).captureStream ??
        (vid as CaptureStreamVideo).mozCaptureStream

      if (!captureStreamFn) {
        throw new Error(
          'Your browser does not support video trimming. Please upload the original instead.',
        )
      }

      const stream = captureStreamFn.call(vid)

      // Pick the best supported codec — VP9 gives better quality at same size
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

      await new Promise<void>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('MediaRecorder error'))

        recorder.onstop = () => {
          const containerType = mimeType.split(';')[0]
          const blob = new Blob(chunks, { type: containerType })
          setTrimmedBlob(blob)
          setTrimmedUrl(URL.createObjectURL(blob))
          setTrimProgress(100)
          resolve()
        }

        // 1. Seek to start time
        vid.currentTime = startTime

        const onSeeked = () => {
          vid.removeEventListener('seeked', onSeeked)

          // 2. Start recording and play
          recorder.start(200)
          void vid.play()

          // 3. Monitor progress; stop at end time
          const onTimeUpdate = () => {
            if (!activeRef.current) {
              vid.removeEventListener('timeupdate', onTimeUpdate)
              vid.pause()
              recorder.stop()
              return
            }

            const elapsed = vid.currentTime - startTime
            setTrimProgress(Math.min(98, Math.round((elapsed / segDuration) * 100)))

            if (vid.currentTime >= endTime - 0.08) {
              vid.removeEventListener('timeupdate', onTimeUpdate)
              vid.pause()
              recorder.requestData()
              recorder.stop()
            }
          }

          vid.addEventListener('timeupdate', onTimeUpdate)
        }

        vid.addEventListener('seeked', onSeeked)
      })
    } catch (err) {
      setTrimError(err instanceof Error ? err.message : 'Trimming failed. Please try again.')
    } finally {
      activeRef.current = false
      setTrimming(false)
    }
  }

  // ── Upload trimmed ────────────────────────────────────────────

  async function handleUploadTrimmed() {
    const previewVid = trimmedVideoRef.current
    if (!trimmedBlob || !previewVid) return

    setUploading(true)
    setUploadError(null)

    try {
      const containerType = trimmedBlob.type || 'video/webm'
      const ext = containerType.includes('mp4') ? 'mp4' : 'webm'
      const trimmedFile = new File([trimmedBlob], `trimmed.${ext}`, { type: containerType })

      if (trimmedFile.size > MAX_VIDEO_BYTES) {
        setUploadError('Trimmed video exceeds 30 MB. Try a shorter segment.')
        return
      }

      // Seek to frame 0 of the trimmed clip so the thumbnail shows the start
      previewVid.currentTime = 0
      await new Promise<void>((res) => {
        const onSeeked = () => { previewVid.removeEventListener('seeked', onSeeked); res() }
        previewVid.addEventListener('seeked', onSeeked)
        // Resolve immediately if already at 0
        if (previewVid.currentTime === 0) res()
      })

      const thumbnail = await captureCanvasThumbnail(previewVid)
      const metadata = await getVideoMetadata(trimmedFile)

      onTrimComplete(trimmedFile, thumbnail, metadata)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload preparation failed.')
    } finally {
      setUploading(false)
    }
  }

  // ── Upload original (no trim) ─────────────────────────────────

  async function handleUploadOriginal() {
    const vid = videoRef.current
    if (!vid) return

    const duration = isFinite(vid.duration) ? vid.duration : totalDuration

    if (duration > MAX_DURATION_SECONDS) {
      setUploadError('Video exceeds 2 minutes. Please trim it first.')
      return
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setUploadError('Video exceeds 30 MB.')
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      vid.currentTime = 0
      await new Promise<void>((res) => {
        const onSeeked = () => { vid.removeEventListener('seeked', onSeeked); res() }
        vid.addEventListener('seeked', onSeeked)
        if (vid.currentTime === 0) res()
      })

      const thumbnail = await captureCanvasThumbnail(vid)
      const metadata = {
        duration: Math.round(duration) || 0,
        width: vid.videoWidth || 0,
        height: vid.videoHeight || 0,
      }
      onTrimComplete(file, thumbnail, metadata)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to prepare video.')
      setUploading(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────

  const segmentDuration = endTime - startTime
  const segmentTooLong = segmentDuration > MAX_DURATION_SECONDS
  const originalTooLong = totalDuration > MAX_DURATION_SECONDS
  const hasTrimResult = !!trimmedUrl && !trimming

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Original video preview */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={videoUrl ?? undefined}
        muted
        controls={!trimming}
        preload="metadata"
        onLoadedMetadata={handleMetadataLoaded}
        className="w-full rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-black max-h-[240px]"
      />

      {totalDuration > 0 && (
        <p className="text-xs text-[var(--text-secondary)]">
          Duration: {formatTime(totalDuration)}
          {originalTooLong && (
            <span className="ml-2 text-yellow-700 dark:text-yellow-400">
              — over 2 min, you must trim before uploading
            </span>
          )}
        </p>
      )}

      {/* ── Trim panel ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-[var(--bg-surface)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-[#1976D2]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Trim <span className="font-normal text-[var(--text-secondary)]">(optional)</span>
          </h3>
          {totalDuration > 0 && (
            <span className="ml-auto text-xs text-[var(--text-secondary)]">
              Total: {formatTime(totalDuration)}
            </span>
          )}
        </div>

        {/* Start / End labels */}
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Start: {formatTime(startTime)}</span>
          <span>End: {formatTime(endTime)}</span>
        </div>

        {/* Start slider */}
        <input
          type="range"
          min={0}
          max={totalDuration || MAX_DURATION_SECONDS}
          step="any"
          value={startTime}
          disabled={trimming || uploading}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setStartTime(Math.min(v, endTime - 0.5))
          }}
          className="w-full accent-[#1976D2] disabled:opacity-50"
        />

        {/* End slider */}
        <input
          type="range"
          min={0}
          max={totalDuration || MAX_DURATION_SECONDS}
          step="any"
          value={endTime}
          disabled={trimming || uploading}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setEndTime(Math.max(v, startTime + 0.5))
          }}
          className="w-full accent-[#1976D2] disabled:opacity-50"
        />

        {/* Segment duration */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-secondary)]">Segment:</span>
          <span
            className={`font-medium ${
              segmentTooLong ? 'text-red-600 dark:text-red-400' : 'text-[var(--text-primary)]'
            }`}
          >
            {formatTime(segmentDuration)}
          </span>
          {segmentTooLong && (
            <span className="text-xs text-red-600 dark:text-red-400">— max 2 min</span>
          )}
        </div>

        {/* Preview from start */}
        <button
          type="button"
          disabled={trimming || uploading}
          onClick={() => {
            const vid = videoRef.current
            if (vid) { vid.currentTime = startTime; void vid.play() }
          }}
          className="text-xs text-[#1976D2] hover:underline disabled:opacity-50"
        >
          Preview from start
        </button>

        {/* Trimming progress */}
        {trimming && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 className="w-4 h-4 animate-spin text-[#1976D2] shrink-0" />
              <span>
                Trimming… {trimProgress}%
                {segmentDuration > 0 && trimProgress < 98 && (
                  <span className="ml-1">
                    — {formatTime(Math.round(segmentDuration * (1 - trimProgress / 100)))} left
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
              <div
                className="h-full bg-[#1976D2] transition-all duration-300"
                style={{ width: `${trimProgress}%` }}
              />
            </div>
          </div>
        )}

        {trimError && (
          <p className="text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
            {trimError}
          </p>
        )}

        {/* Trim button */}
        <button
          type="button"
          onClick={handleTrim}
          disabled={trimming || uploading || segmentTooLong || segmentDuration <= 0}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#1976D2] text-[#1976D2] hover:bg-[#1976D2]/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium px-4 py-2 transition-colors"
        >
          <Scissors className="w-4 h-4" />
          {trimming ? 'Trimming…' : hasTrimResult ? 'Re-trim' : 'Trim'}
        </button>
      </div>

      {/* ── Trimmed result ───────────────────────────────────────── */}
      {hasTrimResult && (
        <div className="rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Trimmed preview
            </h3>
          </div>

          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={trimmedVideoRef}
            src={trimmedUrl ?? undefined}
            controls
            preload="metadata"
            onLoadedMetadata={() => {
              const vid = trimmedVideoRef.current
              if (!vid || isFinite(vid.duration)) return
              // MediaRecorder WebM blobs have no duration in their header so
              // the browser reports Infinity, which disables the seek bar.
              // Seeking to a huge value forces the browser to scan to the last
              // frame and compute the real duration. onSeeked then seeks back
              // to 0 so the video starts from the beginning.
              fixingTrimmedDurationRef.current = true
              vid.currentTime = 1e101
            }}
            onSeeked={() => {
              if (!fixingTrimmedDurationRef.current) return
              fixingTrimmedDurationRef.current = false
              const vid = trimmedVideoRef.current
              if (vid) vid.currentTime = 0
            }}
            className="w-full rounded-lg bg-black max-h-[200px]"
          />

          {uploadError && (
            <p className="text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
              {uploadError}
            </p>
          )}

          <button
            type="button"
            onClick={handleUploadTrimmed}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1976D2] hover:bg-[#1565C0] disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
            ) : (
              <><Upload className="w-4 h-4" />Upload trimmed video</>
            )}
          </button>

          {/* Discard trim — resets sliders to full range and shows original upload */}
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              if (trimmedUrl) URL.revokeObjectURL(trimmedUrl)
              setTrimmedUrl(null)
              setTrimmedBlob(null)
              setUploadError(null)
              setStartTime(0)
              setEndTime(totalDuration)
              setTrimProgress(0)
            }}
            className="w-full text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors text-center"
          >
            ← Use original instead
          </button>
        </div>
      )}

      {/* ── Upload original ──────────────────────────────────────── */}
      {!hasTrimResult && (
        <>
          {uploadError && (
            <p className="text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 rounded-md px-3 py-2">
              {uploadError}
            </p>
          )}
          <button
            type="button"
            onClick={handleUploadOriginal}
            disabled={uploading || trimming || originalTooLong}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#1976D2] hover:bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 transition-colors"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Preparing…</>
            ) : (
              <><Upload className="w-4 h-4" />Upload original</>
            )}
          </button>
        </>
      )}

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancel}
        disabled={trimming || uploading}
        className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors"
      >
        <X className="w-4 h-4" />
        Cancel
      </button>
    </div>
  )
}
