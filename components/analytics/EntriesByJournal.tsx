'use client'

import { useEffect, useState, useRef } from 'react'
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

interface JournalStat {
  title: string
  color: string
  entryCount: number
}

interface EntriesByJournalProps {
  journals: JournalStat[]
}

export default function EntriesByJournal({ journals }: EntriesByJournalProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const journalsRef = useRef(journals)
  journalsRef.current = journals

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted ? resolvedTheme === 'dark' : false
  const textColor = isDark ? '#9E9E9E' : '#757575'
  const gridColor = isDark ? '#3A3A3A' : '#F3F4F6'
  const tooltipBg = isDark ? '#1E1E1E' : '#FFFFFF'
  const tooltipTitle = isDark ? '#F5F5F5' : '#212121'
  const tooltipBody = isDark ? '#9E9E9E' : '#757575'
  const tooltipBorder = isDark ? '#3A3A3A' : '#E0E0E0'

  const chartData = {
    labels: journals.map((j) => j.title),
    datasets: [
      {
        data: journals.map((j) => j.entryCount),
        backgroundColor: journals.map((j) => j.color),
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    indexAxis: 'y',
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
        beginAtZero: true,
        ticks: { stepSize: 1, color: textColor, font: { size: 11 } },
        grid: { color: gridColor },
        border: { display: false },
      },
      y: {
        grid: { display: false },
        ticks: { color: textColor, font: { size: 12 } },
        border: { display: false },
      },
    },
  }

  const chartHeight = Math.max(journals.length * 44, 100)

  if (journals.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6 flex items-center justify-center min-h-[180px]">
        <p className="text-sm text-[#9E9E9E]">No journal data yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
        Entries by Journal
      </h2>
      <div style={{ height: chartHeight }}>
        {mounted && <Bar data={chartData} options={options} />}
      </div>
    </div>
  )
}
