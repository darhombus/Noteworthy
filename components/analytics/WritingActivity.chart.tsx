'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
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

interface WritingActivityProps {
  series: {
    dayCounts: Record<string, number>
    byRange: {
      '7D': { labels: string[]; data: number[] }
      '30D': { labels: string[]; data: number[] }
      '12M': { labels: string[]; data: number[] }
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const RANGES: Range[] = ['7D', '30D', '12M']

function isRange(v: string | null): v is Range {
  return v === '7D' || v === '30D' || v === '12M'
}

export default function WritingActivity({ series }: WritingActivityProps) {
  const { resolvedTheme } = useTheme()
  // The selector persists in the URL (`?range=30D`) so it survives the
  // force-remount the parent does when entries data changes, page refreshes,
  // and shared links. We read the URL once via useState initializer, then
  // sync future changes with window.history.replaceState — using router.replace
  // would trigger a server re-fetch on every click.
  const searchParams = useSearchParams()
  const [range, setRangeState] = useState<Range>(() => {
    const initial = searchParams.get('range')
    return isRange(initial) ? initial : '7D'
  })
  function setRange(r: Range) {
    setRangeState(r)
    const sp = new URLSearchParams(window.location.search)
    sp.set('range', r)
    window.history.replaceState(null, '', `?${sp.toString()}`)
  }

  const isDark = resolvedTheme === 'dark'
  const { labels, data } = series.byRange[range]

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
        <Bar data={chartData} options={options} />
      </div>
    </div>
  )
}
