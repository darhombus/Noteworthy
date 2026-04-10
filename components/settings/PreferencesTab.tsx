'use client'

import { useState, useId } from 'react'
import { toast } from 'sonner'
import { updatePreferences } from '@/lib/actions/settings'
import type { UserPreferences } from '@/lib/actions/settings'

interface Props {
  preferences: UserPreferences
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
      <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">{title}</h2>
      {children}
    </div>
  )
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2 cursor-pointer text-sm text-[#212121] dark:text-[#F5F5F5]"
        >
          <input
            type="radio"
            name={`${id}-${name}`}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-[#1976D2]"
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

export default function PreferencesTab({ preferences }: Props) {
  const [autoSaveInterval, setAutoSaveInterval] = useState<number>(
    preferences.autoSaveInterval ?? 3000,
  )
  const [dateFormat, setDateFormat] = useState<UserPreferences['dateFormat']>(
    preferences.dateFormat ?? 'DD/MM/YYYY',
  )
  const [firstDayOfWeek, setFirstDayOfWeek] = useState<'monday' | 'sunday'>(
    preferences.firstDayOfWeek ?? 'monday',
  )

  async function save(patch: Partial<UserPreferences>) {
    const result = await updatePreferences(patch)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Saved')
    }
  }

  return (
    <div className="space-y-5">
      {/* Auto-save interval */}
      <SectionCard title="Auto-save interval">
        <p className="text-sm text-[#757575] dark:text-[#9E9E9E]">
          How often your journal entry is saved while you type.
        </p>
        <RadioGroup
          name="autosave"
          options={[
            { value: '2000', label: '2 seconds' },
            { value: '3000', label: '3 seconds' },
            { value: '5000', label: '5 seconds' },
          ]}
          value={String(autoSaveInterval)}
          onChange={async (v) => {
            const ms = Number(v)
            setAutoSaveInterval(ms)
            await save({ autoSaveInterval: ms })
          }}
        />
      </SectionCard>

      {/* Date format */}
      <SectionCard title="Date format">
        <RadioGroup
          name="dateformat"
          options={[
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
          ]}
          value={dateFormat ?? 'DD/MM/YYYY'}
          onChange={async (v) => {
            const fmt = v as UserPreferences['dateFormat']
            setDateFormat(fmt)
            await save({ dateFormat: fmt })
          }}
        />
      </SectionCard>

      {/* First day of week */}
      <SectionCard title="First day of week">
        <RadioGroup
          name="firstday"
          options={[
            { value: 'monday', label: 'Monday' },
            { value: 'sunday', label: 'Sunday' },
          ]}
          value={firstDayOfWeek}
          onChange={async (v) => {
            const day = v as 'monday' | 'sunday'
            setFirstDayOfWeek(day)
            await save({ firstDayOfWeek: day })
          }}
        />
      </SectionCard>
    </div>
  )
}
