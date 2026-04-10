'use client'

import { useEffect, useRef, useState } from 'react'
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

interface DayData {
  label: string // 'Sun', 'Mon' …
  date: string  // 'Apr 6'
  count: number
}

interface WeekActivityProps {
  days: DayData[]
}

export default function WeekActivity({ days }: WeekActivityProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Keep a stable ref to days so the chart key doesn't change on every render
  const daysRef = useRef(days)
  daysRef.current = days

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === 'dark' : false

  const FILLED = '#1976D2'
  const EMPTY_LIGHT = '#E5E7EB'
  const EMPTY_DARK = '#334155'

  const data = {
    labels: days.map((d) => d.label),
    datasets: [
      {
        data: days.map((d) => d.count),
        backgroundColor: days.map((d) =>
          d.count > 0 ? FILLED : isDark ? EMPTY_DARK : EMPTY_LIGHT,
        ),
        borderRadius: 6,
        barPercentage: 0.55,
        categoryPercentage: 0.8,
      },
    ],
  }

  const textColor = isDark ? '#9E9E9E' : '#757575'
  const gridColor = isDark ? '#3A3A3A' : '#F3F4F6'
  const tooltipBg = isDark ? '#1E1E1E' : '#FFFFFF'
  const tooltipTitle = isDark ? '#F5F5F5' : '#212121'
  const tooltipBody = isDark ? '#9E9E9E' : '#757575'
  const tooltipBorder = isDark ? '#3A3A3A' : '#E0E0E0'

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'bar'>[]) => daysRef.current[items[0].dataIndex].date,
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
        ticks: { color: textColor, font: { size: 12 } },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        max: Math.max(...days.map((d) => d.count), 2) + 1,
        ticks: { stepSize: 1, color: textColor, font: { size: 11 } },
        grid: { color: gridColor },
        border: { display: false },
      },
    },
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        This Week
      </h2>
      <div className="h-44">
        {mounted && <Bar data={data} options={options} />}
      </div>
    </div>
  )
}
