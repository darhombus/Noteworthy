'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  onClose: () => void
}

export default function ImageLightbox({ src, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        aria-label="Close lightbox"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
      >
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain"
      />
    </div>
  )
}
