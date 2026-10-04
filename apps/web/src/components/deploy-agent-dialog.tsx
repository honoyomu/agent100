import { PlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { HarnessIcon } from '@/components/harness-icon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCreateAgent, useHarnesses, type Harness } from '@/lib/api'
import { cn } from '@/lib/utils'

const DESCRIPTIONS: Record<Harness, string> = {
  'claude-code': "Anthropic's agentic coding CLI, in a web terminal.",
  codex: "OpenAI's coding agent CLI, in a web terminal.",
  opencode: 'Open-source coding agent with its own web UI.',
  hermes: "Nous Research's self-improving agent, with its own web dashboard.",
}

export function DeployAgentDialog({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [harness, setHarness] = useState<Harness>('claude-code')
  const [name, setName] = useState('')
  const { data } = useHarnesses()
  const create = useCreateAgent()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await create.mutateAsync({ name: name.trim(), harness })
      toast.success('Agent is being deployed')
      setOpen(false)
      setName('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Deploy failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <PlusIcon />
          Deploy agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Deploy an agent</DialogTitle>
            <DialogDescription>Each agent runs in its own cloud machine.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              maxLength={40}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Harness</Label>
            <RadioGroup value={harness} onValueChange={(v) => setHarness(v as Harness)} className="grid gap-2">
              {data?.harnesses.map((h) => (
                <Label
                  key={h.id}
                  htmlFor={`harness-${h.id}`}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal transition-colors',
                    'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted/50',
                    !h.available && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <HarnessIcon harness={h.id} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {h.label}
                      {!h.available && <span className="text-xs font-normal text-muted-foreground">Coming soon</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{DESCRIPTIONS[h.id]}</p>
                  </div>
                  <RadioGroupItem value={h.id} id={`harness-${h.id}`} disabled={!h.available} />
                </Label>
              ))}
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Deploying…' : 'Deploy'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
