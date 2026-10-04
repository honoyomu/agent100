import { isTransitional, type AgentStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const LABELS: Record<AgentStatus, string> = {
  provisioning: 'Provisioning',
  running: 'Running',
  suspending: 'Pausing',
  suspended: 'Paused',
  starting: 'Starting',
  deleting: 'Deleting',
  error: 'Error',
}

export function AgentState({ status, error }: { status: AgentStatus; error?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2" title={error ?? undefined}>
      <span
        className={cn(
          'size-2 rounded-full',
          status === 'running' && 'bg-emerald-400',
          status === 'suspended' && 'bg-neutral-500',
          status === 'error' && 'bg-red-500',
          isTransitional(status) && 'animate-pulse bg-amber-400',
        )}
      />
      <span className={cn(status === 'running' ? 'text-foreground' : 'text-muted-foreground')}>{LABELS[status]}</span>
    </span>
  )
}
