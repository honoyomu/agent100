import { BotIcon } from 'lucide-react'
import { AgentCard } from '@/components/agent-card'
import { DeployAgentDialog } from '@/components/deploy-agent-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgents, useHarnesses } from '@/lib/api'

export function DashboardPage() {
  const { data: agents, isPending } = useAgents()
  const { data: harnesses } = useHarnesses()
  const atLimit = !!harnesses && !!agents && agents.length >= harnesses.maxAgents

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Your coding agents, each in its own cloud machine.
            {atLimit && ` You can run up to ${harnesses.maxAgents}.`}
          </p>
        </div>
        <DeployAgentDialog disabled={atLimit} />
      </div>
      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      ) : agents?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <BotIcon className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No agents yet</p>
              <p className="text-sm text-muted-foreground">Deploy your first agent to get started.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
