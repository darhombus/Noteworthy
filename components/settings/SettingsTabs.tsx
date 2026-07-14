import Link from 'next/link'

const TABS = [
  { id: 'account', label: 'Account' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'privacy', label: 'Privacy' },
] as const

type Tab = (typeof TABS)[number]['id']

interface Props {
  activeTab: Tab
}

export default function SettingsTabs({ activeTab }: Props) {
  return (
    <div className="flex border-b border-[#E0E0E0] dark:border-[#3A3A3A]">
      {TABS.map(({ id, label }) => (
        <Link
          key={id}
          href={`/settings?tab=${id}`}
          className={`px-4 py-2.5 text-sm transition-colors ${
            activeTab === id
              ? 'border-b-2 border-[#1976D2] text-[#1976D2] font-medium'
              : 'text-gray-500 dark:text-[#9E9E9E] hover:text-[#212121] dark:hover:text-[#F5F5F5]'
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
