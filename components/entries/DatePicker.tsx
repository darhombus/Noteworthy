'use client'

import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  /** YYYY-MM-DD */
  value: string
  onChange: (value: string) => void
  /** YYYY-MM-DD — latest selectable date (inclusive). Defaults to today. */
  max?: string
}

// Parse "YYYY-MM-DD" as a local-time Date so we never shift a day due to UTC.
function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

function formatIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Deterministic format — no `toLocaleDateString`, which would render
// differently on the Node server (en-US) vs a user's browser (e.g. en-GB)
// and break SSR hydration.
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatDisplay(d: Date): string {
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export default function DatePicker({ value, onChange, max }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = parseIso(value)
  const maxDate = startOfDay(max ? parseIso(max) : new Date())
  const today = startOfDay(new Date())

  const [viewMonth, setViewMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  )

  // Reset view to the selected month whenever the popover opens.
  useEffect(() => {
    if (open) {
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Build the grid for the viewed month, padded with leading blanks so the
  // 1st lands on the right column.
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
  ).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d))
  }

  const canGoNext = () => {
    const nextMonthStart = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      1,
    )
    return nextMonthStart <= maxDate
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-strong)] rounded-lg hover:bg-[var(--bg-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
      >
        <Calendar className="w-4 h-4 text-[var(--text-secondary)]" />
        <span>{formatDisplay(selected)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute top-full left-0 mt-1 z-30 w-[288px] bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl shadow-lg p-3"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
                )
              }
              className="p-1 rounded hover:bg-[var(--bg-muted)] text-[var(--text-secondary)]"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() =>
                setViewMonth(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
                )
              }
              disabled={!canGoNext()}
              className="p-1 rounded hover:bg-[var(--bg-muted)] text-[var(--text-secondary)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAY_NAMES.map((n, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-semibold text-[var(--text-muted)] py-1 uppercase tracking-wide"
              >
                {n}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              if (!cell) return <div key={i} />
              const disabled = cell > maxDate
              const isSelected = sameDay(cell, selected)
              const isToday = sameDay(cell, today)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onChange(formatIso(cell))
                    setOpen(false)
                  }}
                  className={`h-8 w-full rounded text-sm transition-colors ${
                    isSelected
                      ? 'bg-[var(--brand)] text-white font-semibold'
                      : disabled
                        ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                        : isToday
                          ? 'text-[var(--brand)] font-semibold ring-1 ring-[var(--brand)]/40 hover:bg-[var(--bg-muted)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-muted)]'
                  }`}
                >
                  {cell.getDate()}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between">
            <button
              type="button"
              onClick={() => {
                onChange(formatIso(today))
                setOpen(false)
              }}
              className="text-xs font-medium text-[var(--brand)] hover:underline"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
