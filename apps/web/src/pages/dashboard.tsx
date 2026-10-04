import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListFilterIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AgentRowActions } from '@/components/agent-row-actions'
import { AgentState } from '@/components/agent-state'
import { formatDuration } from '@/components/auto-pause-fields'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { DeployAgentDialog } from '@/components/deploy-agent-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  HARNESS_LABELS,
  isTransitional,
  useAgents,
  useDeleteAgent,
  useHarnesses,
  useStartAgent,
  useSuspendAgent,
  type Agent,
  type AgentStatus,
  type Harness,
} from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

type StateGroup = 'running' | 'paused' | 'in-progress' | 'error'
const STATE_GROUPS: { id: StateGroup; label: string; match: (s: AgentStatus) => boolean }[] = [
  { id: 'running', label: 'Running', match: (s) => s === 'running' },
  { id: 'paused', label: 'Paused', match: (s) => s === 'suspended' },
  { id: 'in-progress', label: 'In progress', match: isTransitional },
  { id: 'error', label: 'Error', match: (s) => s === 'error' },
]

type SortKey = 'name' | 'lastActiveAt' | 'createdAt'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

function compare(a: Agent, b: Agent, { key, dir }: Sort) {
  const v = (x: Agent) => (key === 'name' ? x.name.toLowerCase() : new Date(x[key] ?? 0).getTime())
  const r = v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0
  return dir === 'asc' ? r : -r
}

function toggle<T>(set: Set<T>, value: T) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

const HEAD = 'h-11 font-mono text-xs font-normal uppercase tracking-wider text-muted-foreground'

function SortHead({ label, sortKey, sort, onSort, className }: {
  label: string
  sortKey: SortKey
  sort: Sort
  onSort: (sort: Sort) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDownIcon : sort.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead className={cn(HEAD, className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 uppercase hover:text-foreground"
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </TableHead>
  )
}

export function DashboardPage() {
  const { data: agents, isPending, refetch, isFetching } = useAgents()
  const { data: harnesses } = useHarnesses()
  const start = useStartAgent()
  const suspend = useSuspendAgent()
  const remove = useDeleteAgent()

  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<Set<StateGroup>>(new Set())
  const [harnessFilter, setHarnessFilter] = useState<Set<Harness>>(new Set())
  const [sort, setSort] = useState<Sort>({ key: 'createdAt', dir: 'desc' })
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const all = useMemo(() => agents ?? [], [agents])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.id.includes(q))
      .filter((a) => !stateFilter.size || STATE_GROUPS.some((g) => stateFilter.has(g.id) && g.match(a.status)))
      .filter((a) => !harnessFilter.size || harnessFilter.has(a.harness))
      .sort((a, b) => compare(a, b, sort))
  }, [all, query, stateFilter, harnessFilter, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const rows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  // Drop selections of agents that disappeared (deleted elsewhere).
  const selected = all.filter((a) => selectedIds.has(a.id))
  const pageSelected = rows.filter((a) => selectedIds.has(a.id)).length
  const headerChecked = rows.length > 0 && pageSelected === rows.length ? true : pageSelected > 0 ? 'indeterminate' : false

  const startable = selected.filter((a) => a.status === 'suspended' || a.status === 'error')
  const pausable = selected.filter((a) => a.status === 'running')
  const deletable = selected.filter((a) => a.status !== 'deleting')
  const filterCount = stateFilter.size + harnessFilter.size
  const atLimit = !!harnesses && all.length >= harnesses.maxAgents

  async function bulk(targets: Agent[], action: (id: string) => Promise<unknown>, verb: string) {
    const results = await Promise.allSettled(targets.map((a) => action(a.id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed) toast.error(`${verb} failed for ${failed} of ${targets.length} agents`)
    else toast.success(`${verb} ${targets.length} agent${targets.length > 1 ? 's' : ''}`)
    setSelectedIds(new Set())
  }

  return (
    <div className="flex min-h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex-1 space-y-6 px-6 py-8 md:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-4xl font-medium tracking-tight">Agents</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Coding agents, each in its own cloud machine.
              {harnesses && ` ${all.length} of ${harnesses.maxAgents} used.`}
            </p>
          </div>
          <DeployAgentDialog disabled={atLimit} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder="Search by name"
              className="h-9 pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9">
                <ListFilterIcon />
                Filter
                {filterCount > 0 && (
                  <span className="rounded bg-primary px-1.5 font-mono text-[11px] text-primary-foreground">
                    {filterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                State
              </DropdownMenuLabel>
              {STATE_GROUPS.map((g) => (
                <DropdownMenuCheckboxItem
                  key={g.id}
                  checked={stateFilter.has(g.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => {
                    setStateFilter((s) => toggle(s, g.id))
                    setPage(0)
                  }}
                >
                  {g.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Harness
              </DropdownMenuLabel>
              {(Object.keys(HARNESS_LABELS) as Harness[]).map((h) => (
                <DropdownMenuCheckboxItem
                  key={h}
                  checked={harnessFilter.has(h)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => {
                    setHarnessFilter((s) => toggle(s, h))
                    setPage(0)
                  }}
                >
                  {HARNESS_LABELS[h]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1">
                <span className="px-1 font-mono text-xs text-muted-foreground">{selected.length} selected</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!startable.length}
                  onClick={() => bulk(startable, start.mutateAsync, 'Starting')}
                >
                  <PlayIcon />
                  Start{startable.length ? ` (${startable.length})` : ''}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!pausable.length}
                  onClick={() => bulk(pausable, suspend.mutateAsync, 'Pausing')}
                >
                  <PauseIcon />
                  Pause{pausable.length ? ` (${pausable.length})` : ''}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={!deletable.length}
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())}>
                  <XIcon />
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              aria-label="Refresh"
              onClick={() => refetch()}
            >
              <RefreshCwIcon className={cn(isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-4">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={headerChecked}
                    onCheckedChange={(checked) =>
                      setSelectedIds((s) => {
                        const next = new Set(s)
                        for (const a of rows) {
                          if (checked) next.add(a.id)
                          else next.delete(a.id)
                        }
                        return next
                      })
                    }
                  />
                </TableHead>
                <SortHead label="Name" sortKey="name" sort={sort} onSort={setSort} />
                <TableHead className={HEAD}>State</TableHead>
                <TableHead className={HEAD}>Harness</TableHead>
                <TableHead className={HEAD}>Auto pause</TableHead>
                <TableHead className={HEAD}>Resources</TableHead>
                <SortHead label="Last active" sortKey="lastActiveAt" sort={sort} onSort={setSort} />
                <TableHead className={cn(HEAD, 'w-44 border-l')} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 2 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8} className="p-4">
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="h-56 text-center">
                    {all.length === 0 ? (
                      <EmptyState title="No agents yet" body="Deploy your first agent to get started.">
                        <DeployAgentDialog disabled={atLimit} />
                      </EmptyState>
                    ) : (
                      <EmptyState title="No matching agents" body="Try a different search or filter." />
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((agent) => (
                  <TableRow key={agent.id} data-state={selectedIds.has(agent.id) ? 'selected' : undefined} className="h-14">
                    <TableCell className="pl-4">
                      <Checkbox
                        aria-label={`Select ${agent.name}`}
                        checked={selectedIds.has(agent.id)}
                        onCheckedChange={() => setSelectedIds((s) => toggle(s, agent.id))}
                      />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate font-medium" title={agent.id}>
                        {agent.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AgentState status={agent.status} error={agent.lastError} />
                    </TableCell>
                    <TableCell>{HARNESS_LABELS[agent.harness]}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {agent.autoPause ? formatDuration(agent.idleTimeoutSeconds) : 'Off'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-4 font-mono text-xs text-muted-foreground">
                        <span>{agent.resources.vcpus} vCPU</span>
                        <span>{agent.resources.memGiB} GiB</span>
                        <span>{agent.resources.diskGiB} GiB</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(agent.lastActiveAt)}</TableCell>
                    <TableCell className="border-l pr-3">
                      <AgentRowActions agent={agent} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-6 py-4 md:px-8">
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPageSize(Number(v))
            setPage(0)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {filtered.length === 0
              ? '0 agents'
              : `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length}`}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="Previous page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="Next page"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <ConfirmDeleteDialog
        names={deletable.map((a) => a.name)}
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        onConfirm={() => bulk(deletable, remove.mutateAsync, 'Deleting')}
      />
    </div>
  )
}

function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  )
}
