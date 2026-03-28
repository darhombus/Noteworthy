'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { type Editor, useEditorState } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Baseline,
  Highlighter,
  Link2,
  Undo2,
  Redo2,
  ChevronDown,
  X,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

interface FontOption {
  label: string
  value: string | null // null = unset (Default)
}

const SYSTEM_FONTS: FontOption[] = [
  { label: 'Default', value: null },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
]

const GOOGLE_FONTS: FontOption[] = [
  { label: 'Roboto', value: 'var(--font-roboto), sans-serif' },
  { label: 'Open Sans', value: 'var(--font-open-sans), sans-serif' },
  { label: 'Lato', value: 'var(--font-lato), sans-serif' },
  { label: 'Montserrat', value: 'var(--font-montserrat), sans-serif' },
  { label: 'Oswald', value: 'var(--font-oswald), sans-serif' },
  { label: 'Raleway', value: 'var(--font-raleway), sans-serif' },
  { label: 'Merriweather', value: 'var(--font-merriweather), serif' },
  { label: 'Lora', value: 'var(--font-lora), serif' },
  { label: 'Playfair Display', value: 'var(--font-playfair), serif' },
  { label: 'EB Garamond', value: 'var(--font-garamond), serif' },
  { label: 'Libre Baskerville', value: 'var(--font-baskerville), serif' },
  { label: 'Dancing Script', value: 'var(--font-dancing), cursive' },
]

const ALL_FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS]

const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 30, 36, 48, 60, 72] as const
const FONT_SIZE_DEFAULT = 11
const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 72

const TEXT_COLORS = [
  { label: 'Default', value: null, hex: '#374151' },
  { label: 'Blue', value: '#1976D2', hex: '#1976D2' },
  { label: 'Green', value: '#059669', hex: '#059669' },
  { label: 'Orange', value: '#D97706', hex: '#D97706' },
  { label: 'Purple', value: '#7C3AED', hex: '#7C3AED' },
  { label: 'Red', value: '#DC2626', hex: '#DC2626' },
  { label: 'Teal', value: '#0891B2', hex: '#0891B2' },
  { label: 'Lime', value: '#65A30D', hex: '#65A30D' },
  { label: 'Pink', value: '#DB2777', hex: '#DB2777' },
] as const

const HIGHLIGHT_COLORS = [
  { label: 'Yellow', value: '#FEF08A' },
  { label: 'Green', value: '#BBF7D0' },
  { label: 'Blue', value: '#BFDBFE' },
  { label: 'Pink', value: '#FBCFE8' },
  { label: 'Orange', value: '#FED7AA' },
] as const

const BLOCK_TYPES = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'heading1', label: 'Heading 1' },
  { value: 'heading2', label: 'Heading 2' },
  { value: 'heading3', label: 'Heading 3' },
  { value: 'bulletList', label: 'Bullet List' },
  { value: 'orderedList', label: 'Numbered List' },
  { value: 'taskList', label: 'Task List' },
  { value: 'blockquote', label: 'Blockquote' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBlockType(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'heading1'
  if (editor.isActive('heading', { level: 2 })) return 'heading2'
  if (editor.isActive('heading', { level: 3 })) return 'heading3'
  if (editor.isActive('bulletList')) return 'bulletList'
  if (editor.isActive('orderedList')) return 'orderedList'
  if (editor.isActive('taskList')) return 'taskList'
  if (editor.isActive('blockquote')) return 'blockquote'
  return 'paragraph'
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <div className="w-px h-5 bg-[#E0E0E0] dark:bg-[#3A3A3A] mx-1 shrink-0" aria-hidden />
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault() // keep editor focus
        if (!disabled) onClick()
      }}
      disabled={disabled}
      title={title}
      className={[
        'flex items-center justify-center w-8 h-8 rounded transition-colors shrink-0',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        active
          ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
          : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

interface ColorPickerProps {
  colors: ReadonlyArray<{ label: string; value: string | null; hex: string }>
  onSelect: (value: string | null) => void
  disabled?: boolean
  triggerIcon: React.ReactNode
  triggerTitle: string
  activeColor?: string | null
}

function ColorPicker({
  colors,
  onSelect,
  disabled,
  triggerIcon,
  triggerTitle,
  activeColor,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          if (!disabled) setOpen((p) => !p)
        }}
        disabled={disabled}
        title={triggerTitle}
        className={[
          'flex items-center justify-center w-8 h-8 rounded transition-colors shrink-0',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open
            ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
            : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
        ].join(' ')}
      >
        {triggerIcon}
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-[#3A3A3A] rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5 w-[152px]">
          {colors.map((c) => (
            <button
              key={c.value ?? 'default'}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(c.value)
                setOpen(false)
              }}
              title={c.label}
              className={[
                'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                activeColor === c.value
                  ? 'border-gray-700 dark:border-white scale-110'
                  : 'border-gray-300 dark:border-[#3A3A3A]',
              ].join(' ')}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface HighlightPickerProps {
  colors: ReadonlyArray<{ label: string; value: string }>
  onSelect: (value: string) => void
  onClear: () => void
  disabled?: boolean
  activeColor?: string | null
}

function HighlightPicker({ colors, onSelect, onClear, disabled, activeColor }: HighlightPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          if (!disabled) setOpen((p) => !p)
        }}
        disabled={disabled}
        title="Highlight color"
        className={[
          'flex items-center justify-center w-8 h-8 rounded transition-colors shrink-0',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open
            ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
            : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
        ].join(' ')}
      >
        <Highlighter className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-[#3A3A3A] rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5 w-[120px]">
          {colors.map((c) => (
            <button
              key={c.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(c.value)
                setOpen(false)
              }}
              title={c.label}
              className={[
                'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                activeColor === c.value
                  ? 'border-gray-700 dark:border-white scale-110'
                  : 'border-gray-300 dark:border-[#3A3A3A]',
              ].join(' ')}
              style={{ backgroundColor: c.value }}
            />
          ))}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onClear()
              setOpen(false)
            }}
            title="Remove highlight"
            className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-[#3A3A3A] bg-white dark:bg-[#333333] flex items-center justify-center hover:scale-110 transition-transform"
          >
            <X className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      )}
    </div>
  )
}

interface FontSizePickerProps {
  currentSize: number
  onApply: (pt: number) => void
  disabled?: boolean
}

function FontSizePicker({ currentSize, onApply, disabled }: FontSizePickerProps) {
  const [inputValue, setInputValue] = useState(String(currentSize))
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep input in sync when cursor moves to differently-sized text
  useEffect(() => {
    setInputValue(String(currentSize))
  }, [currentSize])

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  function clamp(n: number): number {
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, n))
  }

  function commit(raw: string) {
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) {
      const clamped = clamp(parsed)
      onApply(clamped)
      setInputValue(String(clamped))
    } else {
      setInputValue(String(currentSize))
    }
  }

  return (
    <div ref={containerRef} className="relative flex items-center shrink-0">
      {/* Combobox shell — single visual unit like Word */}
      <div
        className={[
          'flex items-center h-8 rounded border overflow-hidden',
          'border-gray-200 dark:border-[#3A3A3A]',
          disabled ? 'opacity-40' : '',
        ].join(' ')}
      >
        {/* Editable number field */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={inputValue}
          disabled={disabled}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget as Node)) {
              commit(inputValue)
              setDropdownOpen(false)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(inputValue)
              setDropdownOpen(false)
              inputRef.current?.blur()
            }
            if (e.key === 'Escape') {
              setInputValue(String(currentSize))
              setDropdownOpen(false)
              inputRef.current?.blur()
            }
          }}
          className={[
            'w-10 h-full text-center text-sm',
            'bg-white dark:bg-[#333333] text-gray-700 dark:text-[#F5F5F5]',
            'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand)]',
            'disabled:cursor-not-allowed',
          ].join(' ')}
        />

        {/* Chevron button */}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault()
            if (!disabled) setDropdownOpen((p) => !p)
          }}
          disabled={disabled}
          title="Font size"
          className={[
            'flex items-center justify-center h-full w-5 shrink-0',
            'border-l border-gray-200 dark:border-[#3A3A3A]',
            'bg-white dark:bg-[#333333] text-gray-400 dark:text-slate-400',
            'hover:bg-[#EEEEEE] dark:hover:bg-[#333333] transition-colors',
            'disabled:cursor-not-allowed',
          ].join(' ')}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Preset list */}
      {dropdownOpen && (
        <div className="absolute top-full mt-1 left-0 z-30 w-16 max-h-56 overflow-y-auto bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-[#3A3A3A] rounded-lg shadow-lg py-1">
          {FONT_SIZE_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onApply(size)
                setDropdownOpen(false)
              }}
              className={[
                'w-full text-center px-2 py-1 text-sm transition-colors',
                currentSize === size
                  ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
                  : 'text-gray-700 dark:text-[#F5F5F5] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
              ].join(' ')}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface BlockTypePickerProps {
  currentType: string
  onSelect: (value: string) => void
  disabled?: boolean
}

function BlockTypePicker({ currentType, onSelect, disabled }: BlockTypePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const activeLabel = BLOCK_TYPES.find((t) => t.value === currentType)?.label ?? 'Paragraph'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          if (!disabled) setOpen((p) => !p)
        }}
        disabled={disabled}
        title="Block type"
        className={[
          'flex items-center justify-between gap-1 h-8 w-[130px] px-2 rounded text-sm',
          'border border-gray-200 dark:border-[#3A3A3A] transition-colors shrink-0',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open
            ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)] border-[var(--brand)]'
            : 'bg-white dark:bg-[#333333] text-gray-700 dark:text-[#F5F5F5] hover:bg-[#F5F5F5] dark:hover:bg-[#333333]',
        ].join(' ')}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 w-[130px] bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-[#3A3A3A] rounded-lg shadow-lg py-1">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(t.value)
                setOpen(false)
              }}
              className={[
                'w-full text-left px-3 py-1.5 text-sm transition-colors',
                currentType === t.value
                  ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
                  : 'text-gray-700 dark:text-[#F5F5F5] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface FontFamilyPickerProps {
  currentFont: string | null
  onSelect: (value: string | null) => void
  disabled?: boolean
}

function FontFamilyPicker({ currentFont, onSelect, disabled }: FontFamilyPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const activeLabel = ALL_FONTS.find((f) => f.value === currentFont)?.label ?? 'Default'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          if (!disabled) setOpen((p) => !p)
        }}
        disabled={disabled}
        title="Font family"
        className={[
          'flex items-center justify-between gap-1 h-8 w-[180px] px-2 rounded text-sm',
          'border border-gray-200 dark:border-[#3A3A3A] transition-colors shrink-0',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open
            ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)] border-[var(--brand)]'
            : 'bg-white dark:bg-[#333333] text-gray-700 dark:text-[#F5F5F5] hover:bg-[#F5F5F5] dark:hover:bg-[#333333]',
        ].join(' ')}
      >
        <span
          className="truncate"
          style={{ fontFamily: currentFont ?? 'inherit' }}
        >
          {activeLabel}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 w-[180px] max-h-72 overflow-y-auto bg-white dark:bg-[#2C2C2C] border border-gray-200 dark:border-[#3A3A3A] rounded-lg shadow-lg py-1">
          {/* Group A — System fonts */}
          {SYSTEM_FONTS.map((font) => (
            <button
              key={font.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(font.value)
                setOpen(false)
              }}
              className={[
                'w-full text-left px-3 py-1.5 text-sm transition-colors',
                currentFont === font.value
                  ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
                  : 'text-gray-700 dark:text-[#F5F5F5] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
              ].join(' ')}
              style={{ fontFamily: font.value ?? 'inherit' }}
            >
              {font.label}
            </button>
          ))}

          {/* Divider between groups */}
          <div className="my-1 border-t border-gray-200 dark:border-[#3A3A3A]" />

          {/* Group B — Google Fonts */}
          {GOOGLE_FONTS.map((font) => (
            <button
              key={font.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(font.value)
                setOpen(false)
              }}
              className={[
                'w-full text-left px-3 py-1.5 text-sm transition-colors',
                currentFont === font.value
                  ? 'bg-[#E3F2FD] dark:bg-[#1E3A5F] text-[var(--brand)]'
                  : 'text-gray-700 dark:text-[#F5F5F5] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]',
              ].join(' ')}
              style={{ fontFamily: font.value ?? 'inherit' }}
            >
              {font.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Toolbar state type ───────────────────────────────────────────────────────

interface ToolbarState {
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  isStrike: boolean
  isAlignCenter: boolean
  isAlignRight: boolean
  canUndo: boolean
  canRedo: boolean
  isLink: boolean
  currentColor: string | null
  currentHighlight: string | null
  currentFontFamily: string | null
  currentFontSize: number
}

const DEFAULT_STATE: ToolbarState = {
  isBold: false,
  isItalic: false,
  isUnderline: false,
  isStrike: false,
  isAlignCenter: false,
  isAlignRight: false,
  canUndo: false,
  canRedo: false,
  isLink: false,
  currentColor: null,
  currentHighlight: null,
  currentFontFamily: null,
  currentFontSize: FONT_SIZE_DEFAULT,
}

// ─── Main Toolbar ─────────────────────────────────────────────────────────────

interface EditorToolbarProps {
  editor: Editor
  disabled?: boolean
}

export default function EditorToolbar({ editor, disabled = false }: EditorToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null)

  // Bug 1 fix: track block type via transaction listener so cursor moves update the dropdown
  const [blockType, setBlockType] = useState(() => getBlockType(editor))
  useEffect(() => {
    const handler = () => setBlockType(getBlockType(editor))
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

  const applyBlockType = useCallback((type: string) => {
    const { state } = editor
    const { doc, selection } = state
    const { from, to } = selection
    const lastNode = doc.lastChild

    // When the selection reaches the document boundary (e.g. after Ctrl+A),
    // clamp `to` so it lands *inside* the last text block rather than at/past
    // the closing token. Tiptap's setNode calls
    //   TextSelection.create(doc, $from.pos, $to.pos)
    // after rewriting nodes. If $to.pos == doc.content.size (outside every
    // node), ProseMirror cannot resolve a valid cursor there and normalises
    // the document, which inserts a spurious trailing empty paragraph.
    //
    // Two sub-cases:
    //  • Last node is empty  → exclude it entirely (keep it unconverted).
    //    Use docSize - lastNode.nodeSize - 1, which is the last valid cursor
    //    position *inside the previous node*.
    //  • Last node has content → just pull `to` one step inside:
    //    docSize - 1 is always the last valid cursor position in the document.
    let selTo = to
    if (to >= doc.content.size - 1 && lastNode) {
      const newTo = lastNode.content.size === 0
        ? doc.content.size - lastNode.nodeSize - 1   // before the empty node
        : doc.content.size - 1                       // inside the last node
      if (newTo > from) {
        selTo = newTo
      }
    }

    // Detect active wrapper nodes so we can lift them before switching
    const isInBulletList = editor.isActive('bulletList')
    const isInOrderedList = editor.isActive('orderedList')
    const isInTaskList = editor.isActive('taskList')
    const isInBlockquote = editor.isActive('blockquote')
    const isInList = isInBulletList || isInOrderedList || isInTaskList

    if (isInList) {
      editor.chain().focus().liftListItem('listItem').run()
      if (isInTaskList) {
        editor.chain().focus().liftListItem('taskItem').run()
      }
      if (
        editor.isActive('bulletList') ||
        editor.isActive('orderedList') ||
        editor.isActive('taskList')
      ) {
        editor.chain().focus().lift('listItem').run()
        editor.chain().focus().lift('taskItem').run()
      }
    }

    if (isInBlockquote) {
      editor.chain().focus().lift('blockquote').run()
    }

    // Build the base chain. When the selection needs trimming, set it inside
    // the same chain so the block-type command sees the correct range.
    let chain = editor.chain().focus()
    if (selTo !== to) {
      chain = chain.setTextSelection({ from, to: selTo })
    }

    switch (type) {
      case 'paragraph':
        chain.setParagraph().run()
        break
      case 'heading1':
        chain.setHeading({ level: 1 }).run()
        break
      case 'heading2':
        chain.setHeading({ level: 2 }).run()
        break
      case 'heading3':
        chain.setHeading({ level: 3 }).run()
        break
      case 'bulletList':
        chain.toggleBulletList().run()
        break
      case 'orderedList':
        chain.toggleOrderedList().run()
        break
      case 'taskList':
        chain.toggleTaskList().run()
        break
      case 'blockquote':
        chain.setBlockquote().run()
        break
    }
  }, [editor])

  const state = useEditorState<ToolbarState>({
    editor,
    selector: (ctx) => {
      if (!ctx) return DEFAULT_STATE
      const ed = ctx.editor
      return {
        isBold: ed.isActive('bold'),
        isItalic: ed.isActive('italic'),
        isUnderline: ed.isActive('underline'),
        isStrike: ed.isActive('strike'),
        isAlignCenter: ed.isActive({ textAlign: 'center' }),
        isAlignRight: ed.isActive({ textAlign: 'right' }),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        isLink: ed.isActive('link'),
        currentColor: (ed.getAttributes('textStyle').color as string | undefined) ?? null,
        currentHighlight: (ed.getAttributes('highlight').color as string | undefined) ?? null,
        currentFontFamily: (ed.getAttributes('textStyle').fontFamily as string | undefined) ?? null,
        currentFontSize: (() => {
          const raw = ed.getAttributes('textStyle').fontSize as string | undefined
          if (!raw) return FONT_SIZE_DEFAULT
          const parsed = parseInt(raw, 10)
          return isNaN(parsed) ? FONT_SIZE_DEFAULT : parsed
        })(),
      }
    },
  })

  const isAlignLeft = !state.isAlignCenter && !state.isAlignRight

  const handleApplyLink = useCallback(() => {
    const trimmed = linkUrl.trim()
    if (!trimmed) return // keep input open on empty

    const normalised =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : 'https://' + trimmed

    const noTextSelected = !savedSelection || savedSelection.from === savedSelection.to

    if (noTextSelected) {
      // Nothing was selected — insert the URL as the link text at the cursor
      const insertAt = savedSelection ? savedSelection.from : editor.state.selection.from
      editor
        .chain()
        .focus()
        .setTextSelection(insertAt)
        .insertContent({
          type: 'text',
          text: trimmed,
          marks: [{ type: 'link', attrs: { href: normalised } }],
        })
        .run()
    } else {
      // Text was selected — apply the link mark to the selection
      editor
        .chain()
        .focus()
        .setTextSelection(savedSelection!)
        .setLink({ href: normalised })
        .run()
    }

    setShowLinkInput(false)
    setLinkUrl('')
    setSavedSelection(null)
  }, [editor, linkUrl, savedSelection])

  const handleCancelLink = useCallback(() => {
    editor.chain().focus().run()
    setShowLinkInput(false)
    setLinkUrl('')
    setSavedSelection(null)
  }, [editor])

  return (
    <div className="editor-toolbar sticky top-0 z-10 bg-white dark:bg-[#1E1E1E] border-b border-[#E0E0E0] dark:border-[#3A3A3A]">
      {/* Main button row */}
      <div className="flex items-center flex-wrap gap-0.5 px-3 py-1.5">

        {/* Group 0 — Font family */}
        <FontFamilyPicker
          currentFont={state.currentFontFamily}
          onSelect={(value) => {
            if (value === null) {
              editor.chain().focus().unsetFontFamily().run()
            } else {
              editor.chain().focus().setFontFamily(value).run()
            }
          }}
          disabled={disabled}
        />

        <Divider />

        {/* Font size */}
        <FontSizePicker
          currentSize={state.currentFontSize}
          onApply={(pt) => editor.chain().focus().setFontSize(`${pt}pt`).run()}
          disabled={disabled}
        />

        <Divider />

        {/* Group 1 — Block type */}
        <BlockTypePicker
          currentType={blockType}
          onSelect={applyBlockType}
          disabled={disabled}
        />

        <Divider />

        {/* Group 2 — Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={state.isBold}
          disabled={disabled}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={state.isItalic}
          disabled={disabled}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={state.isUnderline}
          disabled={disabled}
          title="Underline (Ctrl+U)"
        >
          <Underline className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={state.isStrike}
          disabled={disabled}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Group 3 — Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={isAlignLeft}
          disabled={disabled}
          title="Align left"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={state.isAlignCenter}
          disabled={disabled}
          title="Align center"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={state.isAlignRight}
          disabled={disabled}
          title="Align right"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Group 4 — Color */}
        <ColorPicker
          colors={TEXT_COLORS}
          onSelect={(value) => {
            if (value === null) {
              editor.chain().focus().unsetColor().run()
            } else {
              editor.chain().focus().setColor(value).run()
            }
          }}
          disabled={disabled}
          triggerTitle="Text color"
          triggerIcon={
            <div className="relative">
              <Baseline className="w-4 h-4" />
              <div
                className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded"
                style={{ backgroundColor: state.currentColor ?? '#374151' }}
              />
            </div>
          }
          activeColor={state.currentColor}
        />

        <HighlightPicker
          colors={HIGHLIGHT_COLORS}
          onSelect={(value) => editor.chain().focus().setHighlight({ color: value }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
          disabled={disabled}
          activeColor={state.currentHighlight}
        />

        <Divider />

        {/* Group 5 — Insert */}
        <ToolbarButton
          onClick={() => {
            // Save selection BEFORE the input appears — clicking the input
            // steals focus and clears the editor selection
            const { from, to } = editor.state.selection
            setSavedSelection({ from, to })
            const existingHref = editor.getAttributes('link').href as string | undefined
            setLinkUrl(existingHref ?? '')
            setShowLinkInput(true)
          }}
          active={state.isLink || showLinkInput}
          disabled={disabled}
          title="Insert link — Ctrl+Click a link to open it"
        >
          <Link2 className="w-4 h-4" />
        </ToolbarButton>

        <Divider />

        {/* Group 6 — History */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !state.canUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !state.canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Link input row */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E]">
          <Link2 className="w-4 h-4 text-gray-400 dark:text-[#616161] shrink-0" />
          <input
            autoFocus
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleApplyLink()
              }
              if (e.key === 'Escape') {
                handleCancelLink()
              }
            }}
            placeholder="https://…"
            className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#616161] focus:outline-none"
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              handleApplyLink()
            }}
            className="px-3 py-1 text-sm bg-[var(--brand)] text-white rounded hover:opacity-90 transition-opacity shrink-0"
          >
            Apply
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              handleCancelLink()
            }}
            className="px-3 py-1 text-sm text-gray-600 dark:text-[#BDBDBD] hover:text-gray-900 dark:hover:text-white transition-colors shrink-0"
          >
            Cancel
          </button>
          {state.isLink && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().unsetLink().run()
                setShowLinkInput(false)
                setLinkUrl('')
                setSavedSelection(null)
              }}
              className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:underline shrink-0"
            >
              Remove link
            </button>
          )}
        </div>
      )}
    </div>
  )
}
