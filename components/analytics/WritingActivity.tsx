'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useTheme } from 'next-themes'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

type Range = '7D' | '30D' | '12M'

interface EntryPoint {
  entryDate: string
}

interface WritingActivityProps {
  entries: EntryPoint[]
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------
function buildSeries(entries: EntryPoint[], range: Range): { labels: string[]; data: number[] } {
  const now = new Date()

  if (range === '7D') {
    const slots = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now)
      d.setDate(now.getDate() - (6 - i))
      return {
        key: d.toISOString().split('T')[0],
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      }
    })
    const counts = new Map(slots.map((s) => [s.key, 0]))
    entries.forEach((e) => {
      if (counts.has(e.entryDate)) counts.set(e.entryDate, counts.get(e.entryDate)! + 1)
    })
    return { labels: slots.map((s) => s.label), data: slots.map((s) => counts.get(s.key) ?? 0) }
  }

  if (range === '30D') {
    const slots = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now)
      d.setDate(now.getDate() - (29 - i))
      return {
        key: d.toISOString().split('T')[0],
        // Full date label for every slot — Chart.js autoSkip will thin them out
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      }
    })
    const counts = new Map(slots.map((s) => [s.key, 0]))
    entries.forEach((e) => {
      if (counts.has(e.entryDate)) counts.set(e.entryDate, counts.get(e.entryDate)! + 1)
    })
    return { labels: slots.map((s) => s.label), data: slots.map((s) => counts.get(s.key) ?? 0) }
  }

  // 12M — group by month
  const slots = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
    }
  })
  const counts = new Map(slots.map((s) => [s.key, 0]))
  entries.forEach((e) => {
    const key = e.entryDate.slice(0, 7)
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1)
  })
  return { labels: slots.map((s) => s.label), data: slots.map((s) => counts.get(s.key) ?? 0) }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const RANGES: Range[] = ['7D', '30D', '12M']

export default function WritingActivity({ entries }: WritingActivityProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [range, setRange] = useState<Range>('7D')
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === 'dark' : false
  const { labels, data } = buildSeries(entries, range)

  const textColor = isDark ? '#9E9E9E' : '#757575'
  const gridColor = isDark ? '#3A3A3A' : '#F3F4F6'
  const tooltipBg = isDark ? '#1E1E1E' : '#FFFFFF'
  const tooltipTitle = isDark ? '#F5F5F5' : '#212121'
  const tooltipBody = isDark ? '#9E9E9E' : '#757575'
  const tooltipBorder = isDark ? '#3A3A3A' : '#E0E0E0'

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: data.map((n) =>
          n > 0 ? '#1976D2' : isDark ? '#334155' : '#E5E7EB',
        ),
        borderRadius: 4,
        barPercentage: range === '30D' ? 0.75 : 0.55,
        categoryPercentage: 0.9,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item: TooltipItem<'bar'>) => {
            const n = item.raw as number
            return ` ${n} ${n === 1 ? 'entry' : 'entries'}`
          },
        },
        backgroundColor: tooltipBg,
        titleColor: tooltipTitle,
        bodyColor: tooltipBody,
        borderColor: tooltipBorder,
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: textColor,
          font: { size: range === '30D' ? 10 : 11 },
          // 30D: show every label, rotated 90° so all 30 fit without overlap
          autoSkip: false,
          maxRotation: range === '30D' ? 90 : 0,
          minRotation: range === '30D' ? 90 : 0,
        },
      },
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, color: textColor, font: { size: 11 } },
        grid: { color: gridColor },
        border: { display: false },
      },
    },
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Writing Activity
        </h2>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#2C2C2C] rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                range === r
                  ? 'bg-[#1976D2] text-white'
                  : 'text-[#757575] dark:text-[#9E9E9E] hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* 30D needs extra height to accommodate the 90° rotated date labels */}
      <div className={range === '30D' ? 'h-72' : 'h-52'}>
        {mounted && <Bar data={chartData} options={options} />}
      </div>
    </div>
  )
}
