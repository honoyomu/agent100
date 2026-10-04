import { ArrowUpRightIcon, CheckIcon, CopyIcon, PauseIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AgentAutoPauseForm } from '@/components/agent-auto-pause-form'
import { AgentState } from '@/components/agent-state'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WebTerminal } from '@/components/web-terminal'
import {
  HARNESS_LABELS,
  canOpen,
  isTransitional,
  jumpUrl,
  useAgentMachine,
  useDeleteAgent,
  useStartAgent,
  useSuspendAgent,
  type Agent,
} from '@/lib/api'
import { timeAgo } from '@/lib/format'

export type AgentSheetTab = 'overview' | 'terminal'

const LABEL = 'font-mono text-xs uppercase tracking-wider text-muted-foreground'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className={LABEL}>{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-4 border-b py-2.5 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={mono ? 'min-w-0 font-mono text-xs break-all' : 'min-w-0 text-sm'}>{children}</dd>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copy"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

function parseVersions(versions: string | null) {
  return (versions ?? '')
    .split(/\s+/)
    .map((part) => part.split('='))
    .filter((kv) => kv.length === 2 && kv[1])
}

export function AgentSheet({
  agent,
  tab,
  onTabChange,
  onClose,
}: {
  agent: Agent | null
  tab: AgentSheetTab
  onTabChange: (tab: AgentSheetTab) => void
  onClose: () => void
}) {
  return (
    <Sheet open={!!agent} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[min(1200px,92vw)]"
      >
        {agent && <AgentSheetBody agent={agent} tab={tab} onTabChange={onTabChange} onDeleted={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function AgentSheetBody({
  agent,
  tab,
  onTabChange,
  onDeleted,
}: {
  agent: Agent
  tab: AgentSheetTab
  onTabChange: (tab: AgentSheetTab) => void
  onDeleted: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { data: machine } = useAgentMachine(agent.machineId ? agent.id : null)
  const start = useStartAgent()
  const suspend = useSuspendAgent()
  const remove = useDeleteAgent()
  const busy = isTransitional(agent.status)
  const openable = canOpen(agent)
  const url = new URL(jumpUrl(agent), location.origin).toString()

  const run = (p: Promise<unknown>, ok: string) =>
    p.then(() => toast.success(ok)).catch((err) => toast.error(err instanceof Error ? err.message : 'Failed'))

  return (
    <Tabs value={tab} onValueChange={(v) => onTabChange(v as AgentSheetTab)} className="flex h-full flex-col gap-0">
      <div className="space-y-4 border-b px-6 pt-6 pr-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3">
              <SheetTitle className="truncate text-2xl font-medium tracking-tight">{agent.name}</SheetTitle>
              <AgentState status={agent.status} error={agent.lastError} />
            </div>
            <SheetDescription className="font-mono text-xs">
              {HARNESS_LABELS[agent.harness]} · {agent.id}
            </SheetDescription>
          </div>
          <div className="flex items-center gap-2">
            {agent.status === 'running' ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => run(suspend.mutateAsync(agent.id), `Pausing ${agent.name}`)}>
                <PauseIcon />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => run(start.mutateAsync(agent.id), `Starting ${agent.name}`)}
              >
                <PlayIcon />
                Start
              </Button>
            )}
            <Button size="sm" asChild={openable} disabled={!openable}>
              {openable ? (
                <a href={jumpUrl(agent)} target="_blank" rel="noreferrer">
                  Open
                  <ArrowUpRightIcon />
                </a>
              ) : (
                <span>
                  Open
                  <ArrowUpRightIcon />
                </span>
              )}
            </Button>
          </div>
        </div>
        <TabsList variant="line" className="-mb-px h-10 gap-4 bg-transparent p-0">
          <TabsTrigger value="overview" className="px-0">
            Overview
          </TabsTrigger>
          <TabsTrigger value="terminal" className="px-0">
            Terminal
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-10 px-6 py-6 lg:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-10">
            <Section title="Access">
              <dl>
                <Field label={agent.kind === 'web' ? 'Web UI' : 'Agent terminal'}>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate font-mono text-xs" title={url}>
                      {url}
                    </span>
                    <CopyButton text={url} />
                    <Button variant="ghost" size="icon-sm" aria-label="Open" asChild={openable} disabled={!openable}>
                      {openable ? (
                        <a href={jumpUrl(agent)} target="_blank" rel="noreferrer">
                          <ArrowUpRightIcon />
                        </a>
                      ) : (
                        <span>
                          <ArrowUpRightIcon />
                        </span>
                      )}
                    </Button>
                  </div>
                </Field>
                <Field label="Shell">
                  <button type="button" className="underline-offset-4 hover:underline" onClick={() => onTabChange('terminal')}>
                    Open a shell in /data/workspace
                  </button>
                </Field>
              </dl>
            </Section>

            <Section title="Spec">
              <dl>
                <Field label="Harness">{HARNESS_LABELS[agent.harness]}</Field>
                <Field label="Interface">{agent.kind === 'web' ? 'Own web UI + terminal' : 'Terminal'}</Field>
                <Field label="State">
                  <div className="space-y-1">
                    <AgentState status={agent.status} />
                    {agent.status === 'error' && agent.lastError && (
                      <p className="text-xs text-destructive">{agent.lastError}</p>
                    )}
                  </div>
                </Field>
                <Field label="CPU">{machine?.spec.vcpus ?? agent.resources.vcpus} vCPU</Field>
                <Field label="Memory">{(machine?.spec.memMiB ?? agent.resources.memGiB * 1024) / 1024} GiB</Field>
                <Field label="Disk">
                  {machine
                    ? `${machine.spec.persistentDiskGiB} GiB ${machine.storage.mountPath} · ${machine.spec.rootDiskGiB ?? '—'} GiB root`
                    : `${agent.resources.diskGiB} GiB`}
                </Field>
                <Field label="Created">{new Date(agent.createdAt).toLocaleString()}</Field>
                <Field label="Last active">{timeAgo(agent.lastActiveAt)}</Field>
              </dl>
            </Section>

            <Section title="Auto pause">
              <AgentAutoPauseForm agent={agent} />
            </Section>
          </div>

          <div className="space-y-10">
            <Section title="Machine">
              {machine ? (
                <dl>
                  <Field label="Machine ID" mono>
                    {machine.id}
                  </Field>
                  <Field label="Hangar state" mono>
                    {machine.state}
                    {machine.ready ? ' · ready' : ''}
                    {machine.processesPreserved === false ? ' · cold boot' : ''}
                  </Field>
                  <Field label="Image" mono>
                    {machine.image ? (machine.image.name ?? machine.image.id) : '—'}
                  </Field>
                  <Field label="Template" mono>
                    {machine.template}
                  </Field>
                  <Field label="Snapshot synced" mono>
                    {machine.storage.synced ? 'yes' : 'no'}
                  </Field>
                  <Field label="Updated">{timeAgo(machine.updatedAt)}</Field>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {agent.machineId ? 'Loading machine…' : 'No machine yet.'}
                </p>
              )}
            </Section>

            {machine?.image?.versions && (
              <Section title="Installed">
                <div className="flex flex-wrap gap-2">
                  {parseVersions(machine.image.versions).map(([name, version]) => (
                    <span key={name} className="rounded-md border px-2 py-1 font-mono text-xs">
                      {name} <span className="text-muted-foreground">{version}</span>
                    </span>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Danger zone">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 p-4">
                <div>
                  <p className="text-sm font-medium">Delete this agent</p>
                  <p className="text-sm text-muted-foreground">Its machine and /data/workspace are deleted for good.</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={agent.status === 'deleting'}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              </div>
            </Section>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="terminal" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-6 py-2 font-mono text-xs text-muted-foreground">
          <span>bash · /data/workspace · {agent.machineId ?? '—'}</span>
          {agent.status === 'suspended' && <span>Connecting wakes the machine</span>}
        </div>
        {openable ? (
          <WebTerminal agentId={agent.id} mode="shell" className="flex-1" />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            The terminal is available once the agent is running.
          </div>
        )}
      </TabsContent>

      <ConfirmDeleteDialog
        names={[agent.name]}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          run(remove.mutateAsync(agent.id), `Deleting ${agent.name}`)
          onDeleted()
        }}
      />
    </Tabs>
  )
}
