import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { AutoPauseFields, parseAutoPause, type AutoPauseValue } from '@/components/auto-pause-fields'
import { Button } from '@/components/ui/button'
import { useHarnesses, useUpdateAgent, type Agent } from '@/lib/api'

/** Auto-pause switch and timeout for one agent, saved with PATCH /api/agents/:id. */
export function AgentAutoPauseForm({ agent, onSaved }: { agent: Agent; onSaved?: () => void }) {
  const saved: AutoPauseValue = { autoPause: agent.autoPause, seconds: String(agent.idleTimeoutSeconds) }
  const [value, setValue] = useState<AutoPauseValue>(saved)
  const { data } = useHarnesses()
  const update = useUpdateAgent()

  // Follow the saved values when they change underneath (another tab, a save).
  useEffect(() => {
    setValue({ autoPause: agent.autoPause, seconds: String(agent.idleTimeoutSeconds) })
  }, [agent.autoPause, agent.idleTimeoutSeconds])

  const dirty = value.autoPause !== saved.autoPause || (value.autoPause && value.seconds !== saved.seconds)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const settings = parseAutoPause(value, data?.idleTimeout)
    if ('error' in settings) return void toast.error(settings.error)
    try {
      await update.mutateAsync({ id: agent.id, ...settings })
      toast.success('Auto pause saved')
      onSaved?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings')
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <AutoPauseFields idPrefix={`auto-pause-${agent.id}`} value={value} onChange={setValue} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
