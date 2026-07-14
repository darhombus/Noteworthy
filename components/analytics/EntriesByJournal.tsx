'use client'

import dynamic from 'next/dynamic'

interface JournalStat {
  title: string
  color: string
  entryCount: number
}

interface EntriesByJournalProps {
  journals: JournalStat[]
}

const Chart = dynamic(() => import('./EntriesByJournal.chart'), {
  ssr: false,
  loading: () => (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6 h-72">
      <div className="h-5 w-36 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] mb-4 animate-pulse" />
      <div className="h-52 rounded bg-[#F3F4F6] dark:bg-[#2A2A2A] animate-pulse" />
    </div>
  ),
})

export default function EntriesByJournal(props: EntriesByJournalProps) {
  return <Chart {...props} />
}
