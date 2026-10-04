// WebSocket bridge between the browser's xterm.js and a pty on the agent's
// machine. Client → server: JSON {type: "input", data} | {type: "resize", cols, rows}.
// Server → client: binary terminal output, or JSON {type: "status" | "error" | "exit", message?}.
import type { Context } from 'hono'
import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import type { ClientChannel } from 'ssh2'
import { touch, track } from '../agents/activity.js'
import { HARNESSES, terminalCommand } from '../agents/harnesses.js'
import { ensureRunning, getAgent } from '../agents/service.js'
import * as pool from '../hangar/pool.js'
import { shell } from '../hangar/ssh.js'
import type { AppEnv } from './types.js'

const clampSize = (n: unknown, fallback: number) => {
  const v = Number(n)
  return Number.isInteger(v) && v > 0 && v < 1000 ? v : fallback
}

export function terminalHandler(upgradeWebSocket: UpgradeWebSocket<unknown>) {
  return upgradeWebSocket((c) => {
    const user = (c as Context<AppEnv>).get('user')
    const agentId = c.req.param('id') ?? ''
    let cols = clampSize(c.req.query('cols'), 120)
    let rows = clampSize(c.req.query('rows'), 32)
    let stream: ClientChannel | null = null
    let release: (() => void) | null = null
    let untrack: (() => void) | null = null
    let closed = false

    const sendJson = (ws: WSContext, msg: object) => ws.readyState === 1 && ws.send(JSON.stringify(msg))

    const cleanup = () => {
      closed = true
      stream?.close()
      release?.()
      untrack?.()
    }

    return {
      async onOpen(_evt, ws) {
        try {
          if (!user) throw new Error('unauthenticated')
          const row = await getAgent(user.id, agentId)
          untrack = track(agentId)
          if (row.status === 'suspended') sendJson(ws, { type: 'status', message: 'Waking up the machine…' })
          const machineId = await ensureRunning(row)
          sendJson(ws, { type: 'status', message: 'Connecting…' })
          const lease = await pool.acquire(machineId)
          release = lease.release
          if (closed) return cleanup()
          stream = await shell(lease.client, terminalCommand(HARNESSES[row.harness]), {
            term: 'xterm-256color',
            cols,
            rows,
          })
          if (closed) return cleanup()
          sendJson(ws, { type: 'status', message: '' })
          stream.on('data', (data: Buffer) => {
            touch(agentId)
            if (ws.readyState === 1) ws.send(new Uint8Array(data))
          })
          stream.stderr.on('data', (data: Buffer) => ws.readyState === 1 && ws.send(new Uint8Array(data)))
          stream.on('close', () => {
            sendJson(ws, { type: 'exit' })
            ws.close(1000, 'session ended')
            cleanup()
          })
        } catch (err) {
          sendJson(ws, { type: 'error', message: err instanceof Error ? err.message : String(err) })
          ws.close(1011, 'failed')
          cleanup()
        }
      },
      onMessage(evt) {
        if (typeof evt.data !== 'string') return
        let msg: { type?: string; data?: string; cols?: number; rows?: number }
        try {
          msg = JSON.parse(evt.data)
        } catch {
          return
        }
        if (msg.type === 'input' && typeof msg.data === 'string') {
          touch(agentId)
          stream?.write(msg.data)
        } else if (msg.type === 'resize') {
          cols = clampSize(msg.cols, cols)
          rows = clampSize(msg.rows, rows)
          stream?.setWindow(rows, cols, 0, 0)
        }
      },
      onClose: cleanup,
      onError: cleanup,
    }
  })
}
