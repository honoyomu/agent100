import {
  AppWindowIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  Settings2Icon,
  SquareTerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AgentSettingsDialog } from '@/components/agent-settings-dialog'
import { AgentStatusBadge } from '@/components/agent-status-badge'
import { formatDuration } from '@/components/auto-pause-fields'
import { HarnessIcon } from '@/components/harness-icon'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeleteAgent, useStartAgent, useSuspendAgent, type Agent } from '@/lib/api'

const HARNESS_LABELS: Record<Agent['harness'], string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  hermes: 'Hermes',
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function OpenButton({
  href,
  enabled,
  icon,
  label,
}: {
  href: string
  enabled: boolean
  icon: ReactNode
  label: string
}) {
  return (
    <Button asChild={enabled} size="sm" className="flex-1" disabled={!enabled}>
      {enabled ? (
        <a href={href} target="_blank" rel="noreferrer">
          {icon}
          {label}
        </a>
      ) : (
        <span>
          {icon}
          {label}
        </span>
      )}
    </Button>
  )
}

export function AgentCard({ agent }: { agent: Agent }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const start = useStartAgent()
  const suspend = useSuspendAgent()
  const remove = useDeleteAgent()

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed'))

  const canOpen = agent.status === 'running' || agent.status === 'suspended'
  const terminalUrl = `/agents/${agent.id}/terminal`

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start gap-3 p-4">
        <HarnessIcon harness={agent.harness} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{agent.name}</p>
            <AgentStatusBadge status={agent.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {HARNESS_LABELS[agent.harness]} · active {timeAgo(agent.lastActiveAt)}
          </p>
          <p className="text-xs text-muted-foreground">
            {agent.autoPause ? `Auto-pauses after ${formatDuration(agent.idleTimeoutSeconds)} idle` : 'Auto pause off'}
          </p>
          {agent.status === 'error' && agent.lastError && (
            <p className="mt-2 line-clamp-3 text-xs text-destructive">{agent.lastError}</p>
          )}
        </div>
      </CardContent>
      <CardFooter className="gap-2 border-t p-3">
        <OpenButton
          href={agent.kind === 'web' ? `/api/agents/${agent.id}/web` : terminalUrl}
          enabled={canOpen}
          icon={agent.kind === 'web' ? <AppWindowIcon /> : <SquareTerminalIcon />}
          label={agent.kind === 'web' ? 'Open web UI' : 'Open terminal'}
        />
        {agent.kind === 'web' && (
          <Button asChild={canOpen} variant="outline" size="icon-sm" disabled={!canOpen} aria-label="Open terminal">
            {canOpen ? (
              <a href={terminalUrl} target="_blank" rel="noreferrer" title="Open terminal">
                <SquareTerminalIcon />
              </a>
            ) : (
              <span>
                <SquareTerminalIcon />
              </span>
            )}
          </Button>
        )}
        {/* Non-modal so the dialogs it opens get focus and pointer events. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="More actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {agent.status === 'running' && (
              <DropdownMenuItem onSelect={() => run(suspend.mutateAsync(agent.id), 'Suspending agent')}>
                <PauseIcon />
                Suspend
              </DropdownMenuItem>
            )}
            {(agent.status === 'suspended' || agent.status === 'error') && (
              <DropdownMenuItem onSelect={() => run(start.mutateAsync(agent.id), 'Starting agent')}>
                <PlayIcon />
                Start
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings2Icon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={agent.status === 'deleting'}
              onSelect={() => setConfirmDelete(true)}
            >
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
      <AgentSettingsDialog agent={agent} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {agent.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its machine and everything on it, including /data/workspace, will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run(remove.mutateAsync(agent.id), 'Deleting agent')}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
