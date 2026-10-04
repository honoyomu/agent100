import { Loader2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { isTransitional, type AgentStatus } from '@/lib/api'
import { cn } from '@/lib/utils'

const LABELS: Record<AgentStatus, string> = {
  provisioning: 'Provisioning',
  running: 'Running',
  suspending: 'Suspending',
  suspended: 'Suspended',
  starting: 'Starting',
  deleting: 'Deleting',
  error: 'Error',
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return (
    <Badge
      variant={status === 'error' ? 'destructive' : 'secondary'}
      className={cn(status === 'running' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')}
    >
      {isTransitional(status) ? (
        <Loader2Icon className="animate-spin" />
      ) : (
        status === 'running' && <span className="size-1.5 rounded-full bg-emerald-500" />
      )}
      {LABELS[status]}
    </Badge>
  )
}
