import type { Harness } from '@/lib/api'
import { cn } from '@/lib/utils'

const STYLES: Record<Harness, { label: string; className: string }> = {
  'claude-code': { label: 'CC', className: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  codex: { label: 'CX', className: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' },
  opencode: { label: 'OC', className: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  hermes: { label: 'HM', className: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
}

export function HarnessIcon({ harness, className }: { harness: Harness; className?: string }) {
  const style = STYLES[harness]
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold',
        style.className,
        className,
      )}
    >
      {style.label}
    </div>
  )
}
