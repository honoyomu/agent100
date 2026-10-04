import { AgentAutoPauseForm } from '@/components/agent-auto-pause-form'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Agent } from '@/lib/api'

export function AgentSettingsDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent.name} settings</DialogTitle>
          <DialogDescription>Changes apply right away; the idle timer restarts when you save.</DialogDescription>
        </DialogHeader>
        <AgentAutoPauseForm agent={agent} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
