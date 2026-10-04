# Agent100

Deploy coding agents (Claude Code, Codex, OpenCode, Hermes) into their own
[Hangar](https://github.com/InsForge/hangar) machines and use them from the browser:
Claude Code and Codex through a web terminal, OpenCode and Hermes through their own
web UIs (every agent also has a terminal).

```
browser ──► compute/web (Hono + Vite SPA) ── ssh2 ──► Hangar SSH gateway ──► machine
        └─► compute/webproxy (same image, APP_ROLE=proxy) ──┘   (pty / direct-tcpip)
```

- `apps/web`: Vite + React + shadcn dashboard and xterm.js terminal.
- `apps/server`: Hono API, better-auth, Drizzle (Postgres), Hangar client
  (`src/hangar`), agent lifecycle (`src/agents`), web UI proxy (`src/proxy.ts`).
- `patches/ssh2@*.patch`: ed25519 certificate support for Hangar's gateway.
- `apps/server/images/*.sh`: what each harness image installs on top of the
  `herdr` template.

## Operations (from `apps/server`, with InstaCloud secrets injected)

```bash
insta run -- pnpm exec drizzle-kit migrate          # apply migrations
insta run -- pnpm hangar:login                      # sign the service account in to Hangar (device flow)
insta run -- pnpm hangar <me|usage|machines|images|ssh <id> <cmd>|…>
insta run -- pnpm exec tsx scripts/build-image.ts <harness>   # build + record a harness image
```

Deploy both services from the repo root:

```bash
insta deploy . --group web --port 3000 --websocket
insta deploy . --group webproxy --port 3000 --websocket
```
