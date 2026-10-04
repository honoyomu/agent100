function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name}`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  isProduction: process.env.NODE_ENV === 'production',
  // Directory holding the built SPA; served in production only.
  webDist: process.env.WEB_DIST ?? '../web/dist',
  // "app" serves the dashboard and API; "proxy" serves agents' own web UIs.
  role: process.env.APP_ROLE === 'proxy' ? 'proxy' : 'app',
  // Public origin of the proxy role, used to build "open web UI" links.
  webProxyUrl: process.env.WEB_PROXY_URL?.replace(/\/$/, ''),
}
