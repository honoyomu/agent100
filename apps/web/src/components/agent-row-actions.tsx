import {
  AppWindowIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  Settings2Icon,
  TerminalIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AgentSettingsDialog } from '@/components/agent-settings-dialog'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  canOpen,
  isTransitional,
  terminalUrl,
  useDeleteAgent,
  useStartAgent,
  useSuspendAgent,
  webUrl,
  type Agent,
} from '@/lib/api'

function IconAction({
  label,
  href,
  onClick,
  disabled,
  children,
}: {
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          asChild={!!href && !disabled}
          onClick={onClick}
        >
          {href && !disabled ? (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ) : (
            children
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function AgentRowActions({ agent }: { agent: Agent }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const start = useStartAgent()
  const suspend = useSuspendAgent()
  const remove = useDeleteAgent()

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed'))

  const busy = isTransitional(agent.status)
  const openable = canOpen(agent)

  return (
    <div className="flex items-center justify-end gap-0.5">
      {agent.status === 'running' ? (
        <IconAction label="Pause" disabled={busy} onClick={() => run(suspend.mutateAsync(agent.id), `Pausing ${agent.name}`)}>
          <PauseIcon />
        </IconAction>
      ) : (
        <IconAction
          label="Start"
          disabled={busy || agent.status === 'deleting'}
          onClick={() => run(start.mutateAsync(agent.id), `Starting ${agent.name}`)}
        >
          <PlayIcon />
        </IconAction>
      )}
      {agent.kind === 'web' ? (
        <IconAction label="Open web UI" href={webUrl(agent)} disabled={!openable}>
          <AppWindowIcon />
        </IconAction>
      ) : (
        // Keeps every row's icons in the same columns.
        <span className="size-7" aria-hidden />
      )}
      <IconAction label="Open terminal" href={terminalUrl(agent)} disabled={!openable}>
        <TerminalIcon />
      </IconAction>
      {/* Non-modal so the dialogs it opens get focus and pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {agent.kind === 'web' && (
            <DropdownMenuItem disabled={!openable} asChild>
              <a href={webUrl(agent)} target="_blank" rel="noreferrer">
                <AppWindowIcon />
                Open web UI
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={!openable} asChild>
            <a href={terminalUrl(agent)} target="_blank" rel="noreferrer">
              <TerminalIcon />
              Open terminal
            </a>
          </DropdownMenuItem>
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
      <AgentSettingsDialog agent={agent} open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ConfirmDeleteDialog
        names={[agent.name]}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={() => run(remove.mutateAsync(agent.id), `Deleting ${agent.name}`)}
      />
    </div>
  )
}
