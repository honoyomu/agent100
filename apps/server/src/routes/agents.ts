import { Hono } from 'hono'
import { z } from 'zod'
import { HARNESSES as HARNESS_DEFS } from '../agents/harnesses.js'
import {
  AgentError,
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  MAX_AGENTS_PER_USER,
  startAgent,
  suspendAgent,
  type Agent,
} from '../agents/service.js'
import { signGrant } from '../agents/web-token.js'
import { db } from '../db/index.js'
import { env } from '../env.js'
import { HARNESSES, harnessImage } from '../db/schema.js'
import type { AppEnv } from './types.js'

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  harness: z.enum(HARNESSES),
})

function present(row: Agent) {
  const def = HARNESS_DEFS[row.harness]
  return {
    id: row.id,
    name: row.name,
    harness: row.harness,
    kind: def.kind,
    status: row.status,
    lastError: row.lastError,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
  }
}

export const agentRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    if (!c.get('user')) return c.json({ error: 'unauthenticated' }, 401)
    await next()
  })
  .onError((err, c) => {
    if (err instanceof AgentError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'internal error' }, 500)
  })
  .get('/harnesses', async (c) => {
    const images = await db.select({ harness: harnessImage.harness }).from(harnessImage)
    const available = new Set(images.map((i) => i.harness))
    return c.json({
      harnesses: HARNESSES.map((id) => ({
        id,
        label: HARNESS_DEFS[id].label,
        kind: HARNESS_DEFS[id].kind,
        available: available.has(id),
      })),
      maxAgents: MAX_AGENTS_PER_USER,
    })
  })
  .get('/agents', async (c) => {
    const rows = await listAgents(c.get('user')!.id)
    return c.json({ agents: rows.map(present) })
  })
  .post('/agents', async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid request' }, 400)
    const row = await createAgent(c.get('user')!.id, parsed.data.name, parsed.data.harness)
    return c.json({ agent: present(row) }, 201)
  })
  .get('/agents/:id', async (c) => {
    return c.json({ agent: present(await getAgent(c.get('user')!.id, c.req.param('id'))) })
  })
  .post('/agents/:id/start', async (c) => {
    return c.json({ agent: present(await startAgent(c.get('user')!.id, c.req.param('id'))) })
  })
  .post('/agents/:id/suspend', async (c) => {
    return c.json({ agent: present(await suspendAgent(c.get('user')!.id, c.req.param('id'))) })
  })
  .get('/agents/:id/web', async (c) => {
    const user = c.get('user')!
    const row = await getAgent(user.id, c.req.param('id'))
    if (HARNESS_DEFS[row.harness].kind !== 'web') return c.json({ error: 'this agent has no web UI' }, 400)
    if (!env.webProxyUrl) return c.json({ error: 'web UIs are not configured (WEB_PROXY_URL)' }, 503)
    const token = signGrant({ agentId: row.id, userId: user.id, purpose: 'handoff', exp: Date.now() + 60_000 })
    return c.redirect(`${env.webProxyUrl}/__agent100/open?token=${encodeURIComponent(token)}`)
  })
  .delete('/agents/:id', async (c) => {
    await deleteAgent(c.get('user')!.id, c.req.param('id'))
    return c.body(null, 204)
  })

