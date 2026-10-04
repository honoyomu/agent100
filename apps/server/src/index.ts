import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { startHeartbeat, startIdleReaper } from './agents/activity.js'
import { reconcile } from './agents/service.js'
import { auth } from './auth.js'
import { env } from './env.js'
import { startProxy } from './proxy.js'
import { agentRoutes } from './routes/agents.js'
import { terminalHandler } from './routes/terminal.js'
import type { AppEnv } from './routes/types.js'

if (env.role === 'proxy') {
  startProxy(env.port)
  startHeartbeat()
} else {
  await startApp()
}

async function startApp() {
  const app = new Hono<AppEnv>()
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app })

  app.use('/api/*', logger())

  app.use('/api/*', async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers })
    c.set('user', result?.user ?? null)
    c.set('session', result?.session ?? null)
    await next()
  })

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  app.get('/api/me', (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'unauthenticated' }, 401)
    return c.json({ user })
  })

  app.get(
    '/api/agents/:id/terminal',
    async (c, next) => {
      if (!c.get('user')) return c.json({ error: 'unauthenticated' }, 401)
      await next()
    },
    terminalHandler(upgradeWebSocket),
  )

  app.route('/api', agentRoutes)

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  if (env.isProduction) {
    const root = path.resolve(env.webDist)
    const indexHtml = await readFile(path.join(root, 'index.html'), 'utf8')
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), root) }))
    // Client-side routes fall back to the SPA shell.
    app.get('*', (c) => c.html(indexHtml))
  }

  const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port: env.port }, (info) => {
    console.log(`server listening on :${info.port}`)
  })
  injectWebSocket(server)

  reconcile().catch((err) => console.error('reconcile:', err))
  startIdleReaper()
  startHeartbeat()
}
