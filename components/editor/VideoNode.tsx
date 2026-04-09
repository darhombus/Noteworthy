'use client'
/**
 * Noteworthy custom Video node for Tiptap.
 *
 * Uses a React NodeView so we can attach onLoadedMetadata / onSeeked handlers.
 * This is required because trimmed videos are MediaRecorder WebM blobs that
 * carry no duration metadata — the browser reports Infinity, which disables
 * the native seek bar. The fix: seek to 1e101 on load so the browser scans
 * the entire stream and computes a real duration, then seek back to 0.
 *
 * The renderHTML / parseHTML pair is kept intact so the node still round-trips
 * correctly through JSONB storage (data-src, data-thumbnail-src, data-media-id).
 */
import { useRef } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

function VideoNodeView({ node }: NodeViewProps) {
  const vidRef = useRef<HTMLVideoElement>(null)
  const fixingDurationRef = useRef(false)

  const { src, thumbnailSrc } = node.attrs as {
    src: string | null
    thumbnailSrc: string | null
    mediaId: string | null
  }

  return (
    <NodeViewWrapper
      data-type="journal-video"
      style={{
        maxWidth: '100%',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        margin: '1rem 0',
        display: 'block',
      }}
    >
      <video
        ref={vidRef}
        src={src ?? undefined}
        poster={thumbnailSrc ?? undefined}
        controls
        preload="metadata"
        style={{ width: '100%', display: 'block' }}
        onLoadedMetadata={() => {
          const vid = vidRef.current
          if (!vid || isFinite(vid.duration)) return
          // WebM blobs from MediaRecorder have no duration header → Infinity.
          // Seeking past the end forces the browser to scan the stream and
          // populate a real duration value, which re-enables the seek bar.
          fixingDurationRef.current = true
          vid.currentTime = 1e101
        }}
        onSeeked={() => {
          if (!fixingDurationRef.current) return
          fixingDurationRef.current = false
          const vid = vidRef.current
          if (vid) vid.currentTime = 0
        }}
      />
    </NodeViewWrapper>
  )
}

export const VideoNode = Node.create({
  name: 'video',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-src') ?? null,
        renderHTML: (attrs) => (attrs.src ? { 'data-src': String(attrs.src) } : {}),
      },
      thumbnailSrc: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-thumbnail-src') ?? null,
        renderHTML: (attrs) =>
          attrs.thumbnailSrc ? { 'data-thumbnail-src': String(attrs.thumbnailSrc) } : {},
      },
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id') ?? null,
        renderHTML: (attrs) =>
          attrs.mediaId ? { 'data-media-id': String(attrs.mediaId) } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="journal-video"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // HTMLAttributes contains the *rendered* keys from each attribute's
    // renderHTML function (e.g. 'data-src'), not the raw attribute names.
    const dataSrc = HTMLAttributes['data-src']
    const dataThumbnailSrc = HTMLAttributes['data-thumbnail-src']

    const videoAttrs: Record<string, string> = {
      controls: '',
      preload: 'metadata',
      style: 'width: 100%;',
    }
    if (dataSrc) videoAttrs.src = String(dataSrc)
    if (dataThumbnailSrc) videoAttrs.poster = String(dataThumbnailSrc)

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'journal-video',
        style:
          'max-width: 100%; border-radius: 0.5rem; overflow: hidden; margin: 1rem 0;',
      }),
      ['video', videoAttrs],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView)
  },
})
