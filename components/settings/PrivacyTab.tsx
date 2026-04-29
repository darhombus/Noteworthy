'use client'

import { useState } from 'react'
import { Download, AlertTriangle } from 'lucide-react'
import ExportModal from '@/components/ExportModal'
import VaultSection from './VaultSection'
import { formatStorageSize } from '@/lib/storage/format'

interface Props {
  currentUsage: number
  storageLimit: number
  imageUsage: number
  videoUsage: number
  vaultSecretType: 'pin' | 'password' | null
  vaultAutoLockMinutes: number
}

export default function PrivacyTab({
  currentUsage,
  storageLimit,
  imageUsage,
  videoUsage,
  vaultSecretType,
  vaultAutoLockMinutes,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false)

  const percentUsed = Math.round((currentUsage / storageLimit) * 1000) / 10
  const approaching = currentUsage > 0.8 * storageLimit
  const almostFull = currentUsage > 0.95 * storageLimit

  const barColor = almostFull
    ? 'bg-red-500'
    : approaching
      ? 'bg-yellow-500'
      : 'bg-[#1976D2]'

  return (
    <div className="space-y-5">
      {/* Hidden Vault — setup, manage credential, auto-lock, danger zone */}
      <VaultSection
        secretType={vaultSecretType}
        autoLockMinutes={vaultAutoLockMinutes}
      />

      {/* Download All Data */}
      <div className="rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-6 space-y-3">
        <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">
          Download all data
        </h2>
        <p className="text-sm text-[#757575] dark:text-[#9E9E9E]">
          Export all your journals and entries as Markdown or JSON.
        </p>
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] text-[#212121] dark:text-[#F5F5F5] hover:bg-[#F5F5F5] dark:hover:bg-[#2C2C2C] transition-colors"
        >
          <Download className="w-4 h-4" />
          Download all my data
        </button>
      </div>

      {/* Storage Usage */}
      <div className="rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-6 space-y-3">
        <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">
          Storage usage
        </h2>

        <div className="flex items-center justify-between text-sm text-[#757575] dark:text-[#9E9E9E]">
          <span>
            {formatStorageSize(currentUsage)} of {formatStorageSize(storageLimit)} used
          </span>
          <span>{percentUsed}%</span>
        </div>

        <div className="h-2 w-full rounded-full bg-[#F5F5F5] dark:bg-[#2C2C2C] overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          />
        </div>

        <div className="flex gap-6 text-xs text-[#757575] dark:text-[#9E9E9E]">
          <span>
            Images:{' '}
            <span className="font-medium text-[#212121] dark:text-[#F5F5F5]">
              {formatStorageSize(imageUsage)}
            </span>
          </span>
          <span>
            Videos:{' '}
            <span className="font-medium text-[#212121] dark:text-[#F5F5F5]">
              {formatStorageSize(videoUsage)}
            </span>
          </span>
        </div>

        {almostFull ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">
              You are almost out of storage. Delete existing media to continue uploading.
            </p>
          </div>
        ) : approaching ? (
          <div className="flex items-start gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-yellow-700 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              You are approaching your storage limit. Consider deleting old media to free up space.
            </p>
          </div>
        ) : null}
      </div>

      {exportOpen && <ExportModal scope="all" onClose={() => setExportOpen(false)} />}
    </div>
  )
}
