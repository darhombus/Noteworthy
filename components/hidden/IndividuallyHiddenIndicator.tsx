'use client'

import * as Tooltip from '@radix-ui/react-tooltip'

const TOOLTIP_COPY =
  'This entry is individually hidden. It will remain hidden if you unhide this journal.'
const ARIA_LABEL =
  'Individually hidden entry. Stays hidden when this journal is unhidden.'

interface Props {
  /** When true, the asterisk is positioned absolutely in the card's
   *  top-right corner. When false (the default), it renders inline so
   *  the parent layout can place it next to text. */
  absolute?: boolean
  className?: string
}

/** Tiny "*" glyph + tooltip that flags an entry as individually hidden.
 *  Used both inside hidden journals (to signal the entry will stay hidden
 *  when its journal is unhidden) and after the parent-journal label in
 *  search results for standalone-hidden entries. The character itself is
 *  not interactive — it's purely informational, focusable for keyboard
 *  users so the tooltip can surface on Tab. */
export default function IndividuallyHiddenIndicator({
  absolute = false,
  className,
}: Props) {
  return (
    <Tooltip.Provider delayDuration={500}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            tabIndex={0}
            aria-label={ARIA_LABEL}
            className={[
              'select-none font-bold leading-none cursor-default',
              'text-gray-400 dark:text-slate-400',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1976D2] rounded-sm',
              absolute ? 'absolute top-2 right-2 text-[14px]' : 'inline-block text-[14px]',
              className ?? '',
            ].join(' ')}
          >
            *
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 max-w-[240px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] shadow-lg"
          >
            {TOOLTIP_COPY}
            <Tooltip.Arrow className="fill-[var(--bg-surface)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
