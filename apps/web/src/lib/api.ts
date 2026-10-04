import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type Harness = 'claude-code' | 'codex' | 'opencode' | 'hermes'
export type AgentStatus =
  | 'provisioning'
  | 'running'
  | 'suspending'
  | 'suspended'
  | 'starting'
  | 'deleting'
  | 'error'

export interface Agent {
  id: string
  name: string
  harness: Harness
  kind: 'terminal' | 'web'
  status: AgentStatus
  lastError: string | null
  lastActiveAt: string | null
  createdAt: string
}

export interface HarnessInfo {
  id: Harness
  label: string
  kind: 'terminal' | 'web'
  available: boolean
}

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`)
  return body as T
}

const TRANSITIONAL: AgentStatus[] = ['provisioning', 'starting', 'suspending', 'deleting']
export const isTransitional = (status: AgentStatus) => TRANSITIONAL.includes(status)

export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => request<{ agents: Agent[] }>('/agents').then((r) => r.agents),
    refetchInterval: (query) => (query.state.data?.some((a) => isTransitional(a.status)) ? 2000 : 15000),
  })
}

export function useHarnesses() {
  return useQuery({
    queryKey: ['harnesses'],
    queryFn: () => request<{ harnesses: HarnessInfo[]; maxAgents: number }>('/harnesses'),
    staleTime: 60_000,
  })
}

function useAgentMutation<V>(fn: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export const useCreateAgent = () =>
  useAgentMutation((vars: { name: string; harness: Harness }) =>
    request<{ agent: Agent }>('/agents', { method: 'POST', body: JSON.stringify(vars) }),
  )
export const useStartAgent = () =>
  useAgentMutation((id: string) => request(`/agents/${id}/start`, { method: 'POST' }))
export const useSuspendAgent = () =>
  useAgentMutation((id: string) => request(`/agents/${id}/suspend`, { method: 'POST' }))
export const useDeleteAgent = () =>
  useAgentMutation((id: string) => request(`/agents/${id}`, { method: 'DELETE' }))

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => request<{ agent: Agent }>(`/agents/${id}`).then((r) => r.agent),
  })
}
