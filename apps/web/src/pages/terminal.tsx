import { useEffect } from 'react'
import { useParams } from 'react-router'
import { WebTerminal } from '@/components/web-terminal'
import { useAgent } from '@/lib/api'

export function TerminalPage() {
  const { id = '' } = useParams()
  const { data: agent } = useAgent(id)

  useEffect(() => {
    document.title = agent ? `${agent.name} · Agent100` : 'Terminal · Agent100'
  }, [agent])

  return <WebTerminal agentId={id} className="h-svh" />
}
