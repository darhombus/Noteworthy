'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface CalendarHeatmapProps {
  entries: { entryDate: string }[] // last 365 days
  initialYear: number
  initialMonth: number // 0-indexed
}

// Four clearly distinct intensity levels
function cellClass(count: number): string {
  if (count === 0)
    return 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500'
  if (count === 1)
    return 'bg-blue-200 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
  if (count === 2)
    return 'bg-blue-500 dark:bg-blue-500 text-white'
  return 'bg-blue-800 dark:bg-blue-400 text-white dark:text-blue-900'
}

const LEGEND = [
  { label: '0', cls: 'bg-gray-100 dark:bg-slate-800' },
  { label: '1', cls: 'bg-blue-200 dark:bg-blue-900' },
  { label: '2', cls: 'bg-blue-500' },
  { label: '3+', cls: 'bg-blue-800 dark:bg-blue-400' },
]

export default function CalendarHeatmap({
  entries,
  initialYear,
  initialMonth,
}: CalendarHeatmapProps) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const isCurrentMonth = year === currentYear && month === currentMonth

  function goBack() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }

  function goForward() {
    if (isCurrentMonth) return
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  // Build date→count map for the displayed month
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const dayCounts: Record<string, number> = {}
  for (const e of entries) {
    if (e.entryDate.startsWith(monthStr)) {
      dayCounts[e.entryDate] = (dayCounts[e.entryDate] ?? 0) + 1
    }
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1)
  const totalDays = new Date(year, month + 1, 0).getDate()
  const startDow = firstDay.getDay()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const monthLabel = firstDay.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const cells: (number | null)[] = [
    ...Array<null>(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6 flex flex-col h-full">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={goBack}
            className="p-1.5 rounded-lg text-[#757575] dark:text-[#9E9E9E] hover:bg-gray-100 dark:hover:bg-[#2C2C2C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goForward}
            disabled={isCurrentMonth}
            className={`p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2] ${
              isCurrentMonth
                ? 'text-gray-300 dark:text-slate-700 cursor-not-allowed'
                : 'text-[#757575] dark:text-[#9E9E9E] hover:bg-gray-100 dark:hover:bg-[#2C2C2C]'
            }`}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-[#9E9E9E]">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex flex-col gap-1 flex-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (day === null) return <div key={di} />
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const count = dayCounts[dateStr] ?? 0
              const isToday = dateStr === todayStr
              return (
                <div
                  key={di}
                  title={`${dateStr}: ${count} ${count === 1 ? 'entry' : 'entries'}`}
                  className={`
                    aspect-square rounded-md flex items-center justify-center
                    text-[11px] font-medium select-none
                    ${cellClass(count)}
                    ${isToday ? 'ring-2 ring-offset-1 ring-[#1976D2] dark:ring-offset-[#1E1E1E]' : ''}
                  `}
                >
                  {day}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-[#E0E0E0] dark:border-[#3A3A3A]">
        <span className="text-[10px] text-[#9E9E9E]">Entries:</span>
        {LEGEND.map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${s.cls}`} />
            <span className="text-[10px] text-[#9E9E9E]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
