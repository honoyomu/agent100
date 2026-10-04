// In-memory record of who is connected to which agent, and the reaper that
// suspends agents nobody has used for a while.
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { agent } from '../db/schema.js'
import { suspendIdle } from './service.js'

export const IDLE_SUSPEND_MS = 30 * 60_000
const TOUCH_EVERY_MS = 60_000

const connections = new Map<string, number>()
const lastTouch = new Map<string, number>()

/** Records activity on an agent (written at most once a minute). */
export function touch(agentId: string) {
  const now = Date.now()
  if (now - (lastTouch.get(agentId) ?? 0) < TOUCH_EVERY_MS) return
  lastTouch.set(agentId, now)
  db.update(agent).set({ lastActiveAt: new Date(now) }).where(eq(agent.id, agentId)).catch(() => {})
}

/** Marks a connection open; call the returned function when it closes. */
export function track(agentId: string): () => void {
  connections.set(agentId, (connections.get(agentId) ?? 0) + 1)
  lastTouch.delete(agentId)
  touch(agentId)
  let done = false
  return () => {
    if (done) return
    done = true
    const n = (connections.get(agentId) ?? 1) - 1
    if (n > 0) connections.set(agentId, n)
    else connections.delete(agentId)
    lastTouch.delete(agentId)
    touch(agentId)
  }
}

/** Keeps agents with open connections fresh even when nothing is typed. */
export function startHeartbeat() {
  setInterval(() => {
    for (const agentId of connections.keys()) touch(agentId)
  }, TOUCH_EVERY_MS).unref()
}

export function startIdleReaper() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - IDLE_SUSPEND_MS)
      const idle = await db
        .select()
        .from(agent)
        .where(and(eq(agent.status, 'running'), or(isNull(agent.lastActiveAt), lt(agent.lastActiveAt, cutoff))))
      for (const row of idle) {
        if (connections.get(row.id)) continue
        console.log(`suspending idle agent ${row.id}`)
        suspendIdle(row)
      }
    } catch (err) {
      console.error('idle reaper:', err)
    }
  }, 60_000).unref()
}
