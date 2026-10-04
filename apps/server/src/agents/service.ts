import { randomBytes } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { agent, harnessImage, type AgentStatus, type Harness } from '../db/schema.js'
import { hangar, HangarError } from '../hangar/client.js'
import * as pool from '../hangar/pool.js'
import { configureAgent } from './configure.js'

export type Agent = typeof agent.$inferSelect

export const MAX_AGENTS_PER_USER = 2
const MACHINE_SPEC = { vcpus: 2, memMiB: 4096 }
const READY_TIMEOUT_MS = 3 * 60_000

const openrouterApiKey = () => {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set')
  return key
}

export function newAgentId() {
  // Lowercase base32-ish, usable inside a hangar machine name.
  return randomBytes(10).toString('hex')
}

export class AgentError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 429,
    message: string,
  ) {
    super(message)
  }
}

async function update(id: string, values: Partial<Agent>) {
  const [row] = await db.update(agent).set(values).where(eq(agent.id, id)).returning()
  return row
}

const setStatus = (id: string, status: AgentStatus, extra: Partial<Agent> = {}) =>
  update(id, { status, lastError: null, ...extra })

function errorMessage(err: unknown) {
  if (err instanceof HangarError) return `Hangar: ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

// Agents with an operation in flight. Background work runs at most once per
// agent per process.
const busy = new Set<string>()

function background(id: string, work: () => Promise<void>) {
  if (busy.has(id)) return
  busy.add(id)
  work()
    .catch(async (err) => {
      console.error(`agent ${id}:`, err)
      await update(id, { status: 'error', lastError: errorMessage(err), operationId: null }).catch(() => {})
    })
    .finally(() => busy.delete(id))
}

async function waitOperation(id: string, opId: string) {
  await update(id, { operationId: opId })
  const op = await hangar.waitOperation(opId)
  await update(id, { operationId: null })
  if (op.state !== 'succeeded') throw new Error(`${op.type} failed: ${op.error?.message ?? 'unknown error'}`)
  return op
}

async function waitReady(machineId: string) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (;;) {
    const machine = await hangar.getMachine(machineId)
    if (machine.state === 'running' && machine.runtime.ready) return machine
    if (machine.state === 'error') throw new Error(machine.lastError?.message ?? 'machine failed')
    if (Date.now() > deadline) throw new Error(`machine not ready after ${READY_TIMEOUT_MS / 1000}s (${machine.state})`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

// --- lifecycle ---

async function provision(id: string) {
  const [row] = await db.select().from(agent).where(eq(agent.id, id))
  if (!row) return
  let machineId = row.machineId
  if (!machineId) {
    const [image] = await db
      .select()
      .from(harnessImage)
      .where(eq(harnessImage.harness, row.harness))
      .orderBy(desc(harnessImage.createdAt))
      .limit(1)
    if (!image) throw new Error(`no image built for ${row.harness}`)
    // The idempotency key makes a retry after a crash return the same machine.
    const op = await hangar.createMachine(
      { name: `a100-${row.id}`, imageId: image.imageId, ...MACHINE_SPEC },
      `create-${row.id}`,
    )
    machineId = op.machineId
    await update(id, { machineId })
    await waitOperation(id, op.id)
  }
  await waitReady(machineId)
  const { client, release } = await pool.acquire(machineId)
  try {
    await configureAgent(client, row.harness, { openrouterApiKey: openrouterApiKey() })
  } finally {
    release()
  }
  await setStatus(id, 'running', { lastActiveAt: new Date() })
}

async function start(id: string, machineId: string) {
  await setStatus(id, 'starting')
  const op = await hangar.startMachine(machineId)
  await waitOperation(id, op.id)
  await waitReady(machineId)
  await setStatus(id, 'running', { lastActiveAt: new Date() })
}

async function suspend(id: string, machineId: string) {
  await setStatus(id, 'suspending')
  await pool.close(machineId)
  const op = await hangar.suspendMachine(machineId)
  await waitOperation(id, op.id)
  await setStatus(id, 'suspended')
}

async function destroy(id: string, machineId: string | null) {
  if (machineId) {
    await pool.close(machineId)
    try {
      const op = await hangar.deleteMachine(machineId, `delete-${id}`)
      await waitOperation(id, op.id)
    } catch (err) {
      if (!(err instanceof HangarError && err.status === 404)) throw err
    }
  }
  await db.delete(agent).where(eq(agent.id, id))
}

// --- public API ---

export function listAgents(userId: string) {
  return db.select().from(agent).where(eq(agent.userId, userId)).orderBy(desc(agent.createdAt))
}

export async function getAgent(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(agent)
    .where(and(eq(agent.id, id), eq(agent.userId, userId)))
  if (!row) throw new AgentError(404, 'agent not found')
  return row
}

export async function createAgent(userId: string, name: string, harness: Harness) {
  const existing = await db.select({ id: agent.id }).from(agent).where(eq(agent.userId, userId))
  if (existing.length >= MAX_AGENTS_PER_USER) {
    throw new AgentError(429, `You can run up to ${MAX_AGENTS_PER_USER} agents. Delete one first.`)
  }
  const [image] = await db.select().from(harnessImage).where(eq(harnessImage.harness, harness)).limit(1)
  if (!image) throw new AgentError(400, `${harness} is not available yet`)

  const [row] = await db.insert(agent).values({ id: newAgentId(), userId, name, harness }).returning()
  background(row.id, () => provision(row.id))
  return row
}

export async function startAgent(userId: string, id: string) {
  const row = await getAgent(userId, id)
  if (row.status === 'running' || row.status === 'starting') return row
  if (row.status === 'error') {
    background(id, () => recover(row))
    return { ...row, status: row.machineId ? ('starting' as const) : ('provisioning' as const) }
  }
  if (row.status !== 'suspended' || !row.machineId) throw new AgentError(409, `cannot start an agent that is ${row.status}`)
  const machineId = row.machineId
  background(id, () => start(id, machineId))
  return { ...row, status: 'starting' as const }
}

export async function suspendAgent(userId: string, id: string) {
  const row = await getAgent(userId, id)
  if (row.status !== 'running' || !row.machineId) throw new AgentError(409, `cannot suspend an agent that is ${row.status}`)
  const machineId = row.machineId
  background(id, () => suspend(id, machineId))
  return { ...row, status: 'suspending' as const }
}

export async function deleteAgent(userId: string, id: string) {
  const row = await getAgent(userId, id)
  await setStatus(id, 'deleting')
  // Deletion wins over whatever else is running for this agent.
  busy.delete(id)
  background(id, () => destroy(id, row.machineId))
}

/** Suspends a running agent nobody is using (called by the idle reaper). */
export function suspendIdle(row: Agent) {
  if (row.status !== 'running' || !row.machineId) return
  const machineId = row.machineId
  background(row.id, () => suspend(row.id, machineId))
}

/**
 * Makes sure the agent's machine is running before a connection, starting it
 * when suspended. Resolves with the machine id.
 */
export async function ensureRunning(row: Agent): Promise<string> {
  if (!row.machineId) throw new AgentError(409, `agent is ${row.status}`)
  if (row.status === 'suspended') {
    busy.add(row.id)
    try {
      await start(row.id, row.machineId)
    } finally {
      busy.delete(row.id)
    }
  } else if (row.status !== 'running') {
    throw new AgentError(409, `agent is ${row.status}`)
  }
  return row.machineId
}

/** Re-derives an agent's state from its machine and finishes what was in flight. */
async function recover(row: Agent) {
  if (!row.machineId) return provision(row.id)
  const machine = await hangar.getMachine(row.machineId).catch((err) => {
    if (err instanceof HangarError && err.status === 404) return null
    throw err
  })
  if (!machine) {
    await update(row.id, { machineId: null })
    return provision(row.id)
  }
  if (machine.operationId) await waitOperation(row.id, machine.operationId)
  const { state } = await hangar.getMachine(row.machineId)
  if (state === 'suspended' || state === 'stopped') {
    if (row.status === 'suspending') return void (await setStatus(row.id, 'suspended'))
    await start(row.id, row.machineId)
  }
  // Configuring is idempotent, so a running machine is simply (re)configured.
  return provision(row.id)
}

/** On boot, resumes the work of agents caught mid-operation by a restart. */
export async function reconcile() {
  const stuck = await db
    .select()
    .from(agent)
    .where(inArray(agent.status, ['provisioning', 'starting', 'suspending', 'deleting']))
  for (const row of stuck) {
    if (row.status === 'deleting') background(row.id, () => destroy(row.id, row.machineId))
    else background(row.id, () => recover(row))
  }
}
