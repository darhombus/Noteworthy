'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import XHRUpload from '@uppy/xhr-upload'
import {
  FlipHorizontal2,
  FlipVertical2,
  ImageIcon,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'

// ─── Types ───────────────────────────────────────────────────

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

type Mode = 'rescale' | 'crop'
type Rotation = 0 | 90 | 180 | 270
interface Rect { x: number; y: number; w: number; h: number }
interface Dims { w: number; h: number }

// ─── Constants ───────────────────────────────────────────────

const FIVE_MB = 5 * 1024 * 1024
const PREVIEW_MAX = 360
const PRESET_WIDTHS = [3840, 2560, 1920, 1440, 1280, 1024, 800, 640, 480, 320]

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

/** Bake rotation + flip into a new blob via canvas. */
async function bakeOrientation(
  blob: Blob,
  rotation: Rotation,
  flipH: boolean,
  flipV: boolean,
): Promise<{ blob: Blob; dims: Dims }> {
  const bitmap = await createImageBitmap(blob)
  const swap = rotation === 90 || rotation === 270
  const W = swap ? bitmap.height : bitmap.width
  const H = swap ? bitmap.width : bitmap.height
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close(); return { blob, dims: { w: bitmap.width, h: bitmap.height } } }
  ctx.translate(W / 2, H / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  bitmap.close()
  const outType = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg'
  const out = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), outType, 0.92))
  return { blob: out ?? blob, dims: { w: W, h: H } }
}

/** Apply crop + resize to a blob via canvas. */
async function applyCropAndResize(
  blob: Blob,
  crop: Rect | null,
  resize: Dims | null,
): Promise<Blob> {
  if (!crop && !resize) return blob
  const bitmap = await createImageBitmap(blob)
  const cx = crop?.x ?? 0
  const cy = crop?.y ?? 0
  const cw = crop?.w ?? bitmap.width
  const ch = crop?.h ?? bitmap.height
  const tw = resize?.w ?? cw
  const th = resize?.h ?? ch
  if (cx === 0 && cy === 0 && cw === bitmap.width && ch === bitmap.height && tw === cw && th === ch) {
    bitmap.close()
    return blob
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(tw))
  canvas.height = Math.max(1, Math.round(th))
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close(); return blob }
  ctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const outType = blob.type === 'image/png' || blob.type === 'image/webp' ? blob.type : 'image/jpeg'
  const out = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), outType, 0.92))
  return out ?? blob
}

// ─── Sub-components ──────────────────────────────────────────

function ToolButton({
  children, onClick, label, active,
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`p-2 rounded-md border transition-colors ${
        active
          ? 'bg-[#1976D2] text-white border-[#1976D2]'
          : 'border-[var(--border-strong)] dark:border-[#3A3A3A] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

/** Drag a corner handle to set the rescaled output size (aspect locked). */
function RescaleTool({
  src, imgDims, target, onChange,
}: {
  src: string
  imgDims: Dims
  target: Dims
  onChange: (d: Dims) => void
}) {
  const scale = useMemo(() => {
    const max = Math.max(imgDims.w, imgDims.h)
    return max > PREVIEW_MAX ? PREVIEW_MAX / max : 1
  }, [imgDims])
  const boxW = Math.round(imgDims.w * scale)
  const boxH = Math.round(imgDims.h * scale)
  const tW = Math.max(8, Math.round(target.w * scale))
  const tH = Math.max(8, Math.round(target.h * scale))
  const ratio = imgDims.w / imgDims.h

  const dragRef = useRef<{ sx: number; sw: number } | null>(null)

  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { sx: e.clientX, sw: target.w }
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    const dx = (e.clientX - dragRef.current.sx) / scale
    let nw = Math.round(dragRef.current.sw + dx)
    nw = Math.min(imgDims.w, Math.max(20, nw))
    const nh = Math.round(nw / ratio)
    onChange({ w: nw, h: nh })
  }
  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative rounded-md border border-[var(--border-strong)] dark:border-[#3A3A3A] bg-[var(--bg-muted)] overflow-hidden"
        style={{ width: boxW, height: boxH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-0 w-full h-full opacity-30 select-none pointer-events-none" draggable={false} />
        <div className="absolute top-0 left-0 overflow-hidden ring-2 ring-[#1976D2]" style={{ width: tW, height: tH }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Preview" className="select-none pointer-events-none" style={{ width: boxW, height: boxH }} draggable={false} />
        </div>
        <div
          role="slider"
          aria-label="Drag to rescale"
          aria-valuemin={20}
          aria-valuemax={imgDims.w}
          aria-valuenow={target.w}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-sm bg-[#1976D2] border-2 border-white dark:border-[#1E1E1E] shadow cursor-nwse-resize touch-none"
          style={{ left: tW, top: tH }}
        />
      </div>
      <p className="text-[11px] text-[var(--text-secondary)]">{target.w} × {target.h} px · drag the blue handle</p>
    </div>
  )
}

type CropHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Drag the crop rectangle or its 8 handles to define the crop area. */
function CropTool({
  src, imgDims, value, onChange,
}: {
  src: string
  imgDims: Dims
  value: Rect
  onChange: (r: Rect) => void
}) {
  const scale = useMemo(() => {
    const max = Math.max(imgDims.w, imgDims.h)
    return max > PREVIEW_MAX ? PREVIEW_MAX / max : 1
  }, [imgDims])
  const boxW = Math.round(imgDims.w * scale)
  const boxH = Math.round(imgDims.h * scale)

  const [drag, setDrag] = useState<{ kind: CropHandle; sx: number; sy: number; start: Rect } | null>(null)

  useEffect(() => {
    if (!drag) return
    function move(e: PointerEvent) {
      if (!drag) return
      const dx = (e.clientX - drag.sx) / scale
      const dy = (e.clientY - drag.sy) / scale
      let { x, y, w, h } = drag.start
      const k = drag.kind
      if (k === 'move') { x += dx; y += dy }
      if (k.includes('w') && k !== 'move') { x += dx; w -= dx }
      if (k.includes('e')) { w += dx }
      if (k.includes('n') && k !== 'move') { y += dy; h -= dy }
      if (k.includes('s')) { h += dy }
      const MIN = 20
      if (w < MIN) {
        if (k.includes('w') && k !== 'move') x = drag.start.x + drag.start.w - MIN
        w = MIN
      }
      if (h < MIN) {
        if (k.includes('n') && k !== 'move') y = drag.start.y + drag.start.h - MIN
        h = MIN
      }
      // Clamp to image bounds
      if (k === 'move') {
        if (x < 0) x = 0
        if (y < 0) y = 0
        if (x + w > imgDims.w) x = imgDims.w - w
        if (y + h > imgDims.h) y = imgDims.h - h
      } else {
        if (x < 0) { w += x; x = 0 }
        if (y < 0) { h += y; y = 0 }
        if (x + w > imgDims.w) w = imgDims.w - x
        if (y + h > imgDims.h) h = imgDims.h - y
      }
      onChange({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
    }
    function up() { setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [drag, scale, imgDims, onChange])

  function start(kind: CropHandle, e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDrag({ kind, sx: e.clientX, sy: e.clientY, start: { ...value } })
  }

  const rx = value.x * scale
  const ry = value.y * scale
  const rw = value.w * scale
  const rh = value.h * scale

  const handles: { k: Exclude<CropHandle, 'move'>; pos: React.CSSProperties; cursor: string }[] = [
    { k: 'nw', pos: { left: -5, top: -5 }, cursor: 'cursor-nwse-resize' },
    { k: 'n',  pos: { left: '50%', top: -5, transform: 'translateX(-50%)' }, cursor: 'cursor-ns-resize' },
    { k: 'ne', pos: { right: -5, top: -5 }, cursor: 'cursor-nesw-resize' },
    { k: 'e',  pos: { right: -5, top: '50%', transform: 'translateY(-50%)' }, cursor: 'cursor-ew-resize' },
    { k: 'se', pos: { right: -5, bottom: -5 }, cursor: 'cursor-nwse-resize' },
    { k: 's',  pos: { left: '50%', bottom: -5, transform: 'translateX(-50%)' }, cursor: 'cursor-ns-resize' },
    { k: 'sw', pos: { left: -5, bottom: -5 }, cursor: 'cursor-nesw-resize' },
    { k: 'w',  pos: { left: -5, top: '50%', transform: 'translateY(-50%)' }, cursor: 'cursor-ew-resize' },
  ]

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative rounded-md border border-[var(--border-strong)] dark:border-[#3A3A3A] overflow-hidden bg-black select-none"
        style={{ width: boxW, height: boxH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="absolute inset-0 w-full h-full pointer-events-none select-none" draggable={false} />
        {/* Dim overlay outside crop using 4 rects */}
        <div className="absolute bg-black/55 pointer-events-none" style={{ left: 0, top: 0, right: 0, height: ry }} />
        <div className="absolute bg-black/55 pointer-events-none" style={{ left: 0, top: ry + rh, right: 0, bottom: 0 }} />
        <div className="absolute bg-black/55 pointer-events-none" style={{ left: 0, top: ry, width: rx, height: rh }} />
        <div className="absolute bg-black/55 pointer-events-none" style={{ left: rx + rw, top: ry, right: 0, height: rh }} />
        {/* Crop rect */}
        <div
          onPointerDown={(e) => start('move', e)}
          className="absolute ring-2 ring-[#1976D2] cursor-move touch-none"
          style={{ left: rx, top: ry, width: rw, height: rh }}
        >
          {handles.map((h) => (
            <div
              key={h.k}
              onPointerDown={(e) => start(h.k, e)}
              className={`absolute w-2.5 h-2.5 bg-white border-2 border-[#1976D2] ${h.cursor} touch-none`}
              style={h.pos}
            />
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-secondary)]">{value.w} × {value.h} px · drag handles to crop</p>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────

export default function ImageUploadModal({
  entryId,
  onUploadComplete,
  onClose,
}: ImageUploadModalProps) {
  const [quota, setQuota] = useState<QuotaResponse | null>(null)

  // Edit pipeline state
  const [mode, setMode] = useState<Mode>('rescale')
  const [rotation, setRotation] = useState<Rotation>(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [baseBlob, setBaseBlob] = useState<Blob | null>(null)
  const [workingUrl, setWorkingUrl] = useState<string | null>(null)
  const [workingDims, setWorkingDims] = useState<Dims | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [resizeTarget, setResizeTarget] = useState<Dims | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string>('original')

  const dashboardTargetRef = useRef<HTMLDivElement>(null)
  const onUploadCompleteRef = useRef(onUploadComplete)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete
    onCloseRef.current = onClose
  }, [onUploadComplete, onClose])

  // Re-bake working image whenever orientation changes
  useEffect(() => {
    if (!baseBlob) return
    let cancelled = false
    bakeOrientation(baseBlob, rotation, flipH, flipV).then(({ blob, dims }) => {
      if (cancelled) return
      const url = URL.createObjectURL(blob)
      setWorkingUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
      setWorkingDims(dims)
      setCrop({ x: 0, y: 0, w: dims.w, h: dims.h })
      setResizeTarget({ w: dims.w, h: dims.h })
      setSelectedPreset('original')
    })
    return () => { cancelled = true }
  }, [baseBlob, rotation, flipH, flipV])

  // Revoke object URL on unmount
  const workingUrlRef = useRef<string | null>(null)
  useEffect(() => { workingUrlRef.current = workingUrl }, [workingUrl])
  useEffect(() => () => { if (workingUrlRef.current) URL.revokeObjectURL(workingUrlRef.current) }, [])

  // The "effective" pre-resize dims = current crop dims (or working if no crop)
  const effectiveDims = useMemo<Dims | null>(() => {
    if (!workingDims) return null
    if (crop) return { w: crop.w, h: crop.h }
    return workingDims
  }, [workingDims, crop])

  // When crop changes, sync the resize target to the new effective dims so the
  // user starts from "100% of the cropped image" before further rescaling.
  useEffect(() => {
    if (!effectiveDims) return
    setResizeTarget({ w: effectiveDims.w, h: effectiveDims.h })
    setSelectedPreset('original')
  }, [effectiveDims?.w, effectiveDims?.h]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolution presets — only widths < effective so user can only go down
  const resolutionPresets = useMemo(() => {
    if (!effectiveDims) return []
    const aspect = effectiveDims.h / effectiveDims.w
    return [
      { id: 'original', label: `Original — ${effectiveDims.w} × ${effectiveDims.h} px`, w: effectiveDims.w, h: effectiveDims.h },
      ...PRESET_WIDTHS.filter((pw) => pw < effectiveDims.w).map((pw) => {
        const ph = Math.round(pw * aspect)
        return { id: `${pw}`, label: `${pw} × ${ph} px`, w: pw, h: ph }
      }),
    ]
  }, [effectiveDims])

  function applyPreset(id: string) {
    setSelectedPreset(id)
    const p = resolutionPresets.find((p) => p.id === id)
    if (p) setResizeTarget({ w: p.w, h: p.h })
  }

  // Quota fetch
  useEffect(() => {
    let cancelled = false
    fetch('/api/storage/quota')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: QuotaResponse | null) => { if (!cancelled && data) setQuota(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Latest-state ref for the Uppy preprocessor (which closes over initial state)
  const stateRef = useRef({ baseBlob, rotation, flipH, flipV, crop, resizeTarget })
  useEffect(() => {
    stateRef.current = { baseBlob, rotation, flipH, flipV, crop, resizeTarget }
  })

  // Single Uppy lifecycle effect
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
        height: 320,
        note: 'JPEG, PNG, GIF, WebP · max 5 MB',
      })
      .use(XHRUpload, {
        endpoint: '/api/media',
        formData: true,
        fieldName: 'file',
        headers: {},
        allowedMetaFields: ['entry_id'],
        getResponseData: (xhr) => {
          try { return JSON.parse(xhr.responseText) as Record<string, unknown> }
          catch { return {} }
        },
      })

    instance.setMeta({ entry_id: entryId })

    instance.on('file-added', (file) => {
      if (!(file.data instanceof Blob)) return
      setBaseBlob(file.data)
      setRotation(0); setFlipH(false); setFlipV(false)
      setMode('rescale')
    })

    instance.on('file-removed', () => {
      setBaseBlob(null)
      setWorkingUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
      setWorkingDims(null)
      setCrop(null)
      setResizeTarget(null)
    })

    // Bake the full edit pipeline before XHRUpload sends.
    instance.addPreProcessor(async (fileIDs: string[]) => {
      for (const id of fileIDs) {
        const file = instance.getFile(id)
        if (!file?.data || !(file.data instanceof Blob)) continue
        try {
          const s = stateRef.current
          const source = s.baseBlob ?? file.data
          const baked = await bakeOrientation(source, s.rotation, s.flipH, s.flipV)
          const finalBlob = await applyCropAndResize(baked.blob, s.crop, s.resizeTarget)
          instance.setFileState(id, {
            data: finalBlob,
            size: finalBlob.size,
            type: finalBlob.type || file.type,
          })
        } catch (err) {
          console.error('Image processing failed, uploading original', err)
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // ── Derived ─────────────────────────────────────────────────

  const percentUsed = quota?.percentUsed ?? 0
  const barColor =
    percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-yellow-500' : 'bg-green-500'
  const lowSpace = quota !== null && quota.remainingSpace > 0 && quota.remainingSpace < FIVE_MB
  const noSpace = quota !== null && quota.remainingSpace === 0

  function reset() {
    setRotation(0); setFlipH(false); setFlipV(false)
    if (workingDims) {
      setCrop({ x: 0, y: 0, w: workingDims.w, h: workingDims.h })
      setResizeTarget({ w: workingDims.w, h: workingDims.h })
    }
    setSelectedPreset('original')
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-3xl rounded-xl bg-white dark:bg-[#1E1E1E] border border-[var(--border-strong)] dark:border-[#3A3A3A] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header — non-sticky, in normal flow above the scroll area */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--border)] dark:border-[#3A3A3A] shrink-0 bg-white dark:bg-[#1E1E1E]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1976D2]/10 text-[#1976D2] shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[var(--text-primary)] leading-tight">Insert image</h2>
              <p className="text-xs text-[var(--text-secondary)] truncate">Upload, edit and add to your entry</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close image uploader"
            onClick={onClose}
            className="p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto p-6 space-y-5">
          {/* Quota */}
          <div aria-busy={quota === null}>
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
              <span className="font-medium">
                {quota
                  ? `${formatStorageSize(quota.currentUsage)} of ${formatStorageSize(quota.limit)} used`
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
                Running low on storage. Delete old media to free space.
              </p>
            )}
          </div>

          {/* Uppy dashboard */}
          {noSpace ? (
            <p className="text-sm text-red-600 dark:text-red-400 py-12 text-center border border-dashed border-red-300 dark:border-red-900 rounded-lg">
              Storage limit reached. Delete existing media to upload new files.
            </p>
          ) : (
            <div ref={dashboardTargetRef} />
          )}

          {/* Edit panel */}
          {workingUrl && workingDims && crop && resizeTarget && (
            <div className="rounded-lg border border-[var(--border-strong)] dark:border-[#3A3A3A] bg-[var(--bg-surface)] dark:bg-[#181818]">
              {/* Toolbar with all the editing functions */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] dark:border-[#3A3A3A]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mr-auto">Edit image</h3>
                <ToolButton onClick={() => setRotation(((rotation + 270) % 360) as Rotation)} label="Rotate left">
                  <RotateCcw className="w-4 h-4" />
                </ToolButton>
                <ToolButton onClick={() => setRotation(((rotation + 90) % 360) as Rotation)} label="Rotate right">
                  <RotateCw className="w-4 h-4" />
                </ToolButton>
                <ToolButton onClick={() => setFlipH((v) => !v)} label="Flip horizontal" active={flipH}>
                  <FlipHorizontal2 className="w-4 h-4" />
                </ToolButton>
                <ToolButton onClick={() => setFlipV((v) => !v)} label="Flip vertical" active={flipV}>
                  <FlipVertical2 className="w-4 h-4" />
                </ToolButton>
                <div className="h-5 w-px bg-[var(--border)] dark:bg-[#3A3A3A] mx-1" />
                <ToolButton onClick={reset} label="Reset all edits">
                  <Undo2 className="w-4 h-4" />
                </ToolButton>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-[auto,1fr] gap-5 items-start">
                {/* Interactive tool */}
                {mode === 'rescale' ? (
                  <RescaleTool
                    src={workingUrl}
                    imgDims={workingDims}
                    target={resizeTarget}
                    onChange={(d) => { setResizeTarget(d); setSelectedPreset('') }}
                  />
                ) : (
                  <CropTool
                    src={workingUrl}
                    imgDims={workingDims}
                    value={crop}
                    onChange={setCrop}
                  />
                )}

                {/* Controls */}
                <div className="space-y-3 min-w-0">
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Tool</label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as Mode)}
                      className="w-full rounded-md border border-[var(--border-strong)] dark:border-[#3A3A3A] bg-white dark:bg-[#121212] px-2.5 py-1.5 text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-[#1976D2]"
                    >
                      <option value="rescale">Rescale — drag to resize</option>
                      <option value="crop">Crop — drag to select area</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Resolution</label>
                    <select
                      value={selectedPreset}
                      onChange={(e) => applyPreset(e.target.value)}
                      className="w-full rounded-md border border-[var(--border-strong)] dark:border-[#3A3A3A] bg-white dark:bg-[#121212] px-2.5 py-1.5 text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-[#1976D2]"
                    >
                      {selectedPreset === '' && (
                        <option value="">Custom — {resizeTarget.w} × {resizeTarget.h} px</option>
                      )}
                      {resolutionPresets.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Lower the resolution to reduce file size (e.g. 1080p → 720p).
                    </p>
                  </div>

                  <div className="rounded-md border border-[var(--border)] dark:border-[#3A3A3A] bg-white dark:bg-[#121212] px-3 py-2 text-xs text-[var(--text-secondary)] leading-relaxed space-y-1">
                    <div>
                      <span className="font-semibold text-[var(--text-primary)]">Original:</span>{' '}
                      {workingDims.w} × {workingDims.h} px
                    </div>
                    {(crop.w !== workingDims.w || crop.h !== workingDims.h) && (
                      <div>
                        <span className="font-semibold text-[var(--text-primary)]">After crop:</span>{' '}
                        {crop.w} × {crop.h} px
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-[var(--text-primary)]">Final:</span>{' '}
                      {resizeTarget.w} × {resizeTarget.h} px
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
