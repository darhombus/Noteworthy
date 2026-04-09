'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  ChevronDown,
  Link2,
  Type,
  Highlighter,
  SuperscriptIcon,
  SubscriptIcon,
  Ban,
} from 'lucide-react'

interface EditorToolbarProps {
  editor: Editor
}

// ─────────────────────────────────────────────────────────────────────────
// Font / size / color definitions
// ─────────────────────────────────────────────────────────────────────────

interface FontOption {
  label: string
  /** Exact value stored in the `fontFamily` attr — must round-trip through
   *  save/reload unchanged. */
  value: string
}

// All Google Fonts referenced below are already preloaded via next/font in
// `app/layout.tsx` — we reference them through their CSS variables so the
// hashed font-family names injected by next/font stay resolvable.
const FONT_OPTIONS: FontOption[] = [
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Lora', value: 'var(--font-lora), Georgia, serif' },
  { label: 'Merriweather', value: 'var(--font-merriweather), Georgia, serif' },
  { label: 'Playfair Display', value: 'var(--font-playfair), Georgia, serif' },
  { label: 'EB Garamond', value: 'var(--font-garamond), Georgia, serif' },
  { label: 'Libre Baskerville', value: 'var(--font-baskerville), Georgia, serif' },
  { label: 'Inter', value: 'var(--font-inter), system-ui, sans-serif' },
  { label: 'Roboto', value: 'var(--font-roboto), Arial, sans-serif' },
  { label: 'Open Sans', value: 'var(--font-open-sans), Arial, sans-serif' },
  { label: 'Lato', value: 'var(--font-lato), Arial, sans-serif' },
  { label: 'Montserrat', value: 'var(--font-montserrat), Arial, sans-serif' },
  { label: 'Dancing Script', value: 'var(--font-dancing), cursive' },
]

/** Default font size when no `fontSize` attr is set on the selection. Matches
 *  the base `text-[11pt]` class applied to the editor root. */
const DEFAULT_FONT_SIZE_LABEL = '11'

const FONT_SIZES = [
  '8',
  '9',
  '10',
  '11',
  '12',
  '14',
  '16',
  '18',
  '20',
  '24',
  '28',
  '32',
  '36',
  '48',
  '72',
]

interface ColorOption {
  name: string
  value: string
}

const TEXT_COLORS: ColorOption[] = [
  { name: 'Black', value: '#000000' },
  { name: 'Gray', value: '#757575' },
  { name: 'Red', value: '#E53935' },
  { name: 'Orange', value: '#FB8C00' },
  { name: 'Yellow', value: '#FDD835' },
  { name: 'Green', value: '#43A047' },
  { name: 'Teal', value: '#00ACC1' },
  { name: 'Blue', value: '#1976D2' },
  { name: 'Purple', value: '#8E24AA' },
  { name: 'Pink', value: '#EC407A' },
  { name: 'Brown', value: '#6D4C41' },
  { name: 'White', value: '#FFFFFF' },
]

const HIGHLIGHT_COLORS: ColorOption[] = [
  { name: 'Yellow', value: '#FFF59D' },
  { name: 'Orange', value: '#FFCC80' },
  { name: 'Red', value: '#EF9A9A' },
  { name: 'Green', value: '#A5D6A7' },
  { name: 'Teal', value: '#80DEEA' },
  { name: 'Blue', value: '#90CAF9' },
  { name: 'Purple', value: '#CE93D8' },
  { name: 'Pink', value: '#F48FB1' },
]

// ─────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────

interface ToolButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  ariaLabel: string
  /** Override the hover tooltip — defaults to `ariaLabel`. */
  tooltip?: string
  children: ReactNode
}

function ToolButton({
  onClick,
  isActive,
  disabled,
  ariaLabel,
  tooltip,
  children,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      // Prevent button click from stealing focus from the editor so the
      // current selection stays intact until the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      title={tooltip ?? ariaLabel}
      className={`p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        isActive
          ? 'bg-[var(--brand)]/15 text-[var(--brand)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-[var(--border)] mx-1" aria-hidden="true" />
}

interface DropdownProps {
  label?: string
  icon?: ReactNode
  ariaLabel: string
  /** Override the hover tooltip — defaults to `ariaLabel`. */
  tooltip?: string
  widthClass?: string
  isActive?: boolean
  align?: 'start' | 'end'
  children: (close: () => void) => ReactNode
}

function Dropdown({
  label,
  icon,
  ariaLabel,
  tooltip,
  widthClass = 'min-w-[160px]',
  isActive,
  align = 'start',
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={tooltip ?? ariaLabel}
        className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors text-xs ${
          isActive
            ? 'bg-[var(--brand)]/15 text-[var(--brand)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]'
        }`}
      >
        {icon}
        {label && <span className="font-medium whitespace-nowrap">{label}</span>}
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${widthClass} bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-lg z-20 py-1 max-h-[320px] overflow-y-auto`}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  onClick: () => void
  isActive?: boolean
  children: ReactNode
}

function MenuItem({ onClick, isActive, children }: MenuItemProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
        isActive
          ? 'bg-[var(--brand)]/10 text-[var(--brand)]'
          : 'text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
      }`}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Label helpers
// ─────────────────────────────────────────────────────────────────────────

function getHeadingLabel(editor: Editor): string {
  if (editor.isActive('heading', { level: 1 })) return 'Heading 1'
  if (editor.isActive('heading', { level: 2 })) return 'Heading 2'
  if (editor.isActive('heading', { level: 3 })) return 'Heading 3'
  return 'Normal text'
}

function getFontLabel(editor: Editor): string {
  const current = editor.getAttributes('textStyle').fontFamily as string | undefined
  if (!current) return 'Georgia'
  const match = FONT_OPTIONS.find((f) => f.value === current)
  return match?.label ?? 'Font'
}

function getFontSizeLabel(editor: Editor): string {
  const current = editor.getAttributes('textStyle').fontSize as string | undefined
  if (!current) return DEFAULT_FONT_SIZE_LABEL
  return current.replace(/pt|px|rem|em/g, '')
}

// ─────────────────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────────────────

export default function EditorToolbar({ editor }: EditorToolbarProps) {
  // Tiptap doesn't trigger React re-renders on selection-only transactions
  // by default in v3 — subscribe so active-state highlighting stays accurate.
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const update = () => forceUpdate((n) => n + 1)
    editor.on('transaction', update)
    editor.on('selectionUpdate', update)
    return () => {
      editor.off('transaction', update)
      editor.off('selectionUpdate', update)
    }
  }, [editor])

  function setLink() {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Enter URL', previousUrl ?? 'https://')
    if (url === null) return
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim() })
      .run()
  }

  const currentTextColor = (editor.getAttributes('textStyle').color as string | undefined) ?? null
  const currentHighlightColor = (editor.getAttributes('highlight').color as string | undefined) ?? null

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg shadow-sm">
      {/* Undo / Redo */}
      <ToolButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        ariaLabel="Undo"
      >
        <Undo className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        ariaLabel="Redo"
      >
        <Redo className="w-4 h-4" />
      </ToolButton>

      <Divider />

      {/* Heading dropdown (Normal / H1 / H2 / H3) */}
      <Dropdown
        label={getHeadingLabel(editor)}
        ariaLabel="Paragraph style"
        widthClass="min-w-[180px]"
        isActive={editor.isActive('heading')}
      >
        {(close) => (
          <>
            <MenuItem
              isActive={!editor.isActive('heading')}
              onClick={() => {
                editor.chain().focus().setParagraph().run()
                close()
              }}
            >
              <span className="text-base">Normal text</span>
            </MenuItem>
            <MenuItem
              isActive={editor.isActive('heading', { level: 1 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 1 }).run()
                close()
              }}
            >
              <span className="text-2xl font-bold">Heading 1</span>
            </MenuItem>
            <MenuItem
              isActive={editor.isActive('heading', { level: 2 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 2 }).run()
                close()
              }}
            >
              <span className="text-xl font-semibold">Heading 2</span>
            </MenuItem>
            <MenuItem
              isActive={editor.isActive('heading', { level: 3 })}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level: 3 }).run()
                close()
              }}
            >
              <span className="text-lg font-semibold">Heading 3</span>
            </MenuItem>
          </>
        )}
      </Dropdown>

      {/* Font family dropdown */}
      <Dropdown
        label={getFontLabel(editor)}
        ariaLabel="Font family"
        widthClass="min-w-[200px]"
      >
        {(close) => (
          <>
            {FONT_OPTIONS.map((font) => {
              const isActive =
                (editor.getAttributes('textStyle').fontFamily as string | undefined) === font.value
              return (
                <MenuItem
                  key={font.label}
                  isActive={isActive}
                  onClick={() => {
                    editor.chain().focus().setFontFamily(font.value).run()
                    close()
                  }}
                >
                  <span style={{ fontFamily: font.value }}>{font.label}</span>
                </MenuItem>
              )
            })}
          </>
        )}
      </Dropdown>

      {/* Font size dropdown */}
      <Dropdown
        label={getFontSizeLabel(editor)}
        ariaLabel="Font size"
        widthClass="min-w-[72px]"
      >
        {(close) => (
          <>
            {FONT_SIZES.map((size) => {
              const current = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? ''
              const currentNumeric = current.replace(/pt|px|rem|em/g, '')
              const isActive =
                currentNumeric === size ||
                (!current && size === DEFAULT_FONT_SIZE_LABEL)
              return (
                <MenuItem
                  key={size}
                  isActive={isActive}
                  onClick={() => {
                    editor.chain().focus().setFontSize(`${size}pt`).run()
                    close()
                  }}
                >
                  <span>{size}</span>
                </MenuItem>
              )
            })}
          </>
        )}
      </Dropdown>

      <Divider />

      {/* Inline marks: bold / italic / underline / strike */}
      <ToolButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        ariaLabel="Bold"
      >
        <Bold className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        ariaLabel="Italic"
      >
        <Italic className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        ariaLabel="Underline"
      >
        <Underline className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        ariaLabel="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolButton>

      {/* Superscript / subscript */}
      <ToolButton
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        isActive={editor.isActive('superscript')}
        ariaLabel="Superscript"
      >
        <SuperscriptIcon className="w-4 h-4" />
      </ToolButton>
      <ToolButton
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        isActive={editor.isActive('subscript')}
        ariaLabel="Subscript"
      >
        <SubscriptIcon className="w-4 h-4" />
      </ToolButton>

      <Divider />

      {/* Text color */}
      <Dropdown
        icon={
          <span className="relative flex items-end">
            <Type className="w-4 h-4" />
            <span
              className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-sm border border-[var(--border)]"
              style={{ backgroundColor: currentTextColor ?? '#000000' }}
              aria-hidden="true"
            />
          </span>
        }
        ariaLabel="Text color"
        widthClass="min-w-[180px]"
      >
        {(close) => (
          <div className="px-2 py-1.5">
            <div className="grid grid-cols-6 gap-1.5 mb-2">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(color.value).run()
                    close()
                  }}
                  aria-label={`Text color ${color.name}`}
                  title={color.name}
                  className="w-6 h-6 rounded border border-[var(--border)] hover:scale-110 transition-transform"
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetColor().run()
                close()
              }}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] rounded"
            >
              <Ban className="w-3 h-3" />
              Remove color
            </button>
          </div>
        )}
      </Dropdown>

      {/* Highlight color */}
      <Dropdown
        icon={
          <span className="relative flex items-end">
            <Highlighter className="w-4 h-4" />
            <span
              className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-sm border border-[var(--border)]"
              style={{ backgroundColor: currentHighlightColor ?? '#FFF59D' }}
              aria-hidden="true"
            />
          </span>
        }
        ariaLabel="Highlight color"
        widthClass="min-w-[180px]"
      >
        {(close) => (
          <div className="px-2 py-1.5">
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setHighlight({ color: color.value }).run()
                    close()
                  }}
                  aria-label={`Highlight ${color.name}`}
                  title={color.name}
                  className="w-8 h-6 rounded border border-[var(--border)] hover:scale-110 transition-transform"
                  style={{ backgroundColor: color.value }}
                />
              ))}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetHighlight().run()
                close()
              }}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] rounded"
            >
              <Ban className="w-3 h-3" />
              Remove highlight
            </button>
          </div>
        )}
      </Dropdown>

      <Divider />

      {/* Link */}
      <ToolButton
        onClick={setLink}
        isActive={editor.isActive('link')}
        ariaLabel="Insert link"
      >
        <Link2 className="w-4 h-4" />
      </ToolButton>

      <Divider />

      {/* Align dropdown (left/center/right/justify) */}
      <Dropdown
        icon={<AlignLeft className="w-4 h-4" />}
        ariaLabel="Text alignment"
        widthClass="min-w-[150px]"
        isActive={
          editor.isActive({ textAlign: 'center' }) ||
          editor.isActive({ textAlign: 'right' }) ||
          editor.isActive({ textAlign: 'justify' })
        }
      >
        {(close) => (
          <>
            <MenuItem
              isActive={editor.isActive({ textAlign: 'left' }) || !editor.getAttributes('paragraph').textAlign}
              onClick={() => {
                editor.chain().focus().setTextAlign('left').run()
                close()
              }}
            >
              <AlignLeft className="w-4 h-4" />
              Align left
            </MenuItem>
            <MenuItem
              isActive={editor.isActive({ textAlign: 'center' })}
              onClick={() => {
                editor.chain().focus().setTextAlign('center').run()
                close()
              }}
            >
              <AlignCenter className="w-4 h-4" />
              Align center
            </MenuItem>
            <MenuItem
              isActive={editor.isActive({ textAlign: 'right' })}
              onClick={() => {
                editor.chain().focus().setTextAlign('right').run()
                close()
              }}
            >
              <AlignRight className="w-4 h-4" />
              Align right
            </MenuItem>
            <MenuItem
              isActive={editor.isActive({ textAlign: 'justify' })}
              onClick={() => {
                editor.chain().focus().setTextAlign('justify').run()
                close()
              }}
            >
              <AlignJustify className="w-4 h-4" />
              Justify
            </MenuItem>
          </>
        )}
      </Dropdown>

      {/* Lists dropdown (bullet / numbered / checklist) */}
      <Dropdown
        icon={<List className="w-4 h-4" />}
        ariaLabel="List style"
        widthClass="min-w-[170px]"
        isActive={
          editor.isActive('bulletList') ||
          editor.isActive('orderedList') ||
          editor.isActive('taskList')
        }
      >
        {(close) => (
          <>
            <MenuItem
              isActive={editor.isActive('bulletList')}
              onClick={() => {
                editor.chain().focus().toggleBulletList().run()
                close()
              }}
            >
              <List className="w-4 h-4" />
              Bullet list
            </MenuItem>
            <MenuItem
              isActive={editor.isActive('orderedList')}
              onClick={() => {
                editor.chain().focus().toggleOrderedList().run()
                close()
              }}
            >
              <ListOrdered className="w-4 h-4" />
              Numbered list
            </MenuItem>
            <MenuItem
              isActive={editor.isActive('taskList')}
              onClick={() => {
                editor.chain().focus().toggleTaskList().run()
                close()
              }}
            >
              <ListTodo className="w-4 h-4" />
              Checklist
            </MenuItem>
          </>
        )}
      </Dropdown>

      <ToolButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        ariaLabel="Blockquote"
      >
        <Quote className="w-4 h-4" />
      </ToolButton>
    </div>
  )
}
