import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AutoPauseFields, parseAutoPause, type AutoPauseValue } from '@/components/auto-pause-fields'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useHarnesses, useUpdateAgent, type Agent } from '@/lib/api'

export function AgentSettingsDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<AutoPauseValue>({
    autoPause: agent.autoPause,
    seconds: String(agent.idleTimeoutSeconds),
  })
  const { data } = useHarnesses()
  const update = useUpdateAgent()

  // Start from the saved values each time the dialog opens.
  useEffect(() => {
    if (open) setValue({ autoPause: agent.autoPause, seconds: String(agent.idleTimeoutSeconds) })
  }, [open, agent.autoPause, agent.idleTimeoutSeconds])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const settings = parseAutoPause(value, data?.idleTimeout)
    if ('error' in settings) return void toast.error(settings.error)
    try {
      await update.mutateAsync({ id: agent.id, ...settings })
      toast.success('Settings saved')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-6">
          <DialogHeader>
            <DialogTitle>{agent.name} settings</DialogTitle>
            <DialogDescription>Changes apply right away; the idle timer restarts when you save.</DialogDescription>
          </DialogHeader>
          <AutoPauseFields idPrefix={`settings-${agent.id}`} value={value} onChange={setValue} />
          <DialogFooter>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
