// Web proxy role: serves one agent's own web UI (e.g. OpenCode) at the root of
// this host, tunnelled over SSH to the machine's loopback port. The agent is
// chosen by a signed cookie set from a dashboard handoff link.
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { track } from './agents/activity.js'
import { HARNESSES } from './agents/harnesses.js'
import { ensureRunning, getAgent, type Agent } from './agents/service.js'
import { signGrant, verifyGrant } from './agents/web-token.js'
import * as pool from './hangar/pool.js'
import { forward } from './hangar/ssh.js'

const COOKIE = 'a100_agent'
const SESSION_MS = 12 * 3600_000
const OPEN_PATH = '/__agent100/open'

function readCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
}

function page(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><meta name=viewport content="width=device-width"><title>Agent100</title>` +
      `<body style="font-family:system-ui;display:grid;place-items:center;height:90vh;color:#444">` +
      `<p>${message.replace(/</g, '&lt;')}</p></body>`,
  )
}

async function resolveAgent(req: IncomingMessage): Promise<{ agent: Agent; machineId: string; port: number } | string> {
  const grant = verifyGrant(readCookie(req, COOKIE), 'session')
  if (!grant) return 'This link has expired. Open the agent again from your Agent100 dashboard.'
  const agent = await getAgent(grant.userId, grant.agentId).catch(() => null)
  if (!agent) return 'This agent no longer exists.'
  const port = HARNESSES[agent.harness].webPort
  if (!port) return 'This agent has no web UI.'
  const machineId = await ensureRunning(agent)
  return { agent, machineId, port }
}

/** Headers for the upstream request: the agent's server only trusts loopback. */
function upstreamHeaders(req: IncomingMessage, port: number) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` }
  if (headers.origin) headers.origin = `http://127.0.0.1:${port}`
  delete headers.cookie
  return headers
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://proxy')

  if (url.pathname === OPEN_PATH) {
    const handoff = verifyGrant(url.searchParams.get('token') ?? undefined, 'handoff')
    if (!handoff) return page(res, 403, 'This link has expired. Open the agent again from your dashboard.')
    const session = signGrant({ ...handoff, purpose: 'session', exp: Date.now() + SESSION_MS })
    const agent = await getAgent(handoff.userId, handoff.agentId).catch(() => null)
    res.writeHead(302, {
      Location: (agent && HARNESSES[agent.harness].webEntryPath) || '/',
      'Set-Cookie': `${COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`,
    })
    return res.end()
  }

  const target = await resolveAgent(req)
  if (typeof target === 'string') return page(res, 403, target)

  const lease = await pool.acquire(target.machineId)
  const untrack = track(target.agent.id)
  let released = false
  const done = () => {
    if (released) return
    released = true
    lease.release()
    untrack()
  }
  let channel: Duplex
  try {
    channel = socketLike(await forward(lease.client, target.port))
  } catch (err) {
    done()
    throw err
  }
  const upstream = http.request(
    {
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req, target.port),
      createConnection: () => channel as never,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )
  upstream.on('error', (err) => {
    if (!res.headersSent) page(res, 502, `The agent did not answer: ${err.message}`)
    else res.destroy()
  })
  res.on('close', () => {
    upstream.destroy()
    channel.destroy()
    done()
  })
  req.pipe(upstream)
}

/** http.request treats its connection as a net.Socket; give the SSH channel the methods it pokes. */
function socketLike(channel: Duplex): Duplex {
  return Object.assign(channel, {
    setTimeout: () => channel,
    setNoDelay: () => channel,
    setKeepAlive: () => channel,
  })
}

async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const target = await resolveAgent(req).catch(() => null)
  if (!target || typeof target === 'string') return socket.destroy()
  const lease = await pool.acquire(target.machineId)
  const untrack = track(target.agent.id)
  let channel: Duplex
  try {
    channel = await forward(lease.client, target.port)
  } catch {
    lease.release()
    untrack()
    return socket.destroy()
  }
  // Replay the upgrade request upstream, then splice the two streams.
  const headers = upstreamHeaders(req, target.port)
  const lines = [`${req.method} ${req.url} HTTP/1.1`]
  for (const [k, v] of Object.entries(headers)) {
    for (const value of Array.isArray(v) ? v : [v]) if (value !== undefined) lines.push(`${k}: ${value}`)
  }
  channel.write(lines.join('\r\n') + '\r\n\r\n')
  if (head.length) channel.write(head)
  socket.pipe(channel).pipe(socket)
  const close = () => {
    socket.destroy()
    channel.destroy()
    lease.release()
    untrack()
  }
  socket.on('close', close).on('error', close)
  channel.on('close', close).on('error', close)
}

export function startProxy(port: number) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('proxy:', err)
      if (!res.headersSent) page(res, 502, err instanceof Error ? err.message : 'Proxy error')
    })
  })
  server.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head).catch((err) => {
      console.error('proxy upgrade:', err)
      socket.destroy()
    })
  })
  server.listen(port, '0.0.0.0', () => console.log(`web proxy listening on :${port}`))
}
