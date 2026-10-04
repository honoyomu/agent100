import { ArrowUpRightIcon, MoreHorizontalIcon, PanelRightOpenIcon, PauseIcon, PlayIcon, TerminalIcon, Trash2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
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
  jumpUrl,
  useDeleteAgent,
  useStartAgent,
  useSuspendAgent,
  type Agent,
} from '@/lib/api'
import type { AgentSheetTab } from '@/components/agent-sheet'

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

export function AgentRowActions({ agent, onOpen }: { agent: Agent; onOpen: (tab: AgentSheetTab) => void }) {
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
      <IconAction label="Open in new tab" href={jumpUrl(agent)} disabled={!openable}>
        <ArrowUpRightIcon />
      </IconAction>
      <IconAction label="Terminal" disabled={!openable} onClick={() => onOpen('terminal')}>
        <TerminalIcon />
      </IconAction>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onOpen('overview')}>
            <PanelRightOpenIcon />
            Details
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!openable} asChild>
            <a href={jumpUrl(agent)} target="_blank" rel="noreferrer">
              <ArrowUpRightIcon />
              Open in new tab
            </a>
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
      <ConfirmDeleteDialog
        names={[agent.name]}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={() => run(remove.mutateAsync(agent.id), `Deleting ${agent.name}`)}
      />
    </div>
  )
}
