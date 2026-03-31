'use client'

import { X } from 'lucide-react'

interface TagChipProps {
  tagName: string
  color: string
  onRemove?: () => void
  onClick?: () => void
  size?: 'sm' | 'md'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

export default function TagChip({
  tagName,
  color,
  onRemove,
  onClick,
  size = 'md',
}: TagChipProps) {
  const rgb = hexToRgb(color)
  const bg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : `${color}26`

  const paddingClasses = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-0.5'
  const textClasses = size === 'sm' ? 'text-xs' : 'text-sm'

  const inner = (
    <>
      <span className={`${textClasses} font-medium`} style={{ color }}>
        {tagName}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove tag ${tagName}`}
          className="hover:opacity-70 transition-opacity leading-none"
        >
          <X size={12} style={{ color }} />
        </button>
      )}
    </>
  )

  const sharedClasses = `rounded-full inline-flex items-center gap-1 ${paddingClasses}`

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sharedClasses} cursor-pointer`}
        style={{ background: bg }}
      >
        {inner}
      </button>
    )
  }

  return (
    <span className={sharedClasses} style={{ background: bg }}>
      {inner}
    </span>
  )
}
