import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { hangarCredential } from '../db/schema.js'
import type {
  Connection,
  CreateMachineRequest,
  DeviceStart,
  HangarErrorBody,
  Image,
  Machine,
  Me,
  Operation,
  Template,
  Tokens,
  Usage,
} from './types.js'

export const HANGAR_URL = (process.env.HANGAR_URL ?? 'https://152.236.1.51').replace(/\/$/, '')

const CREDENTIAL_ID = 'default'
// Refresh this long before the access token expires.
const REFRESH_MARGIN_MS = 2 * 60_000

export class HangarError extends Error {
  constructor(
    readonly status: number,
    readonly body: HangarErrorBody | null,
  ) {
    super(body ? `${body.code}: ${body.message}` : `hangar http ${status}`)
  }

  get code() {
    return this.body?.code
  }
}

async function call<T>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  const res = await fetch(HANGAR_URL + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const json = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new HangarError(res.status, json?.error ?? null)
  return json as T
}

// --- device login (bootstrap only) ---

export function startDeviceLogin() {
  return call<DeviceStart>('POST', '/v1/auth/device', { body: {} })
}

export function pollDeviceToken(deviceCode: string) {
  return call<Tokens>('POST', '/v1/auth/device/token', { body: { deviceCode } })
}

export async function saveTokens(tokens: Tokens) {
  const row = {
    id: CREDENTIAL_ID,
    accessToken: tokens.accessToken,
    accessExpiresAt: new Date(tokens.accessExpiresAt),
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: new Date(tokens.refreshExpiresAt),
  }
  await db.insert(hangarCredential).values(row).onConflictDoUpdate({ target: hangarCredential.id, set: row })
}

// --- access token with refresh rotation ---

let cached: { token: string; expiresAt: number } | null = null

function fresh(expiresAt: Date | number) {
  return new Date(expiresAt).getTime() - REFRESH_MARGIN_MS > Date.now()
}

async function accessToken(): Promise<string> {
  if (cached && fresh(cached.expiresAt)) return cached.token

  // The refresh token rotates and the old one dies, so refreshes are
  // serialised across processes with a row lock; re-read after locking in
  // case another process already rotated it.
  const token = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(hangarCredential)
      .where(eq(hangarCredential.id, CREDENTIAL_ID))
      .for('update')
    if (!row) throw new Error('Hangar is not signed in: run `pnpm hangar:login`')
    if (fresh(row.accessExpiresAt)) {
      cached = { token: row.accessToken, expiresAt: row.accessExpiresAt.getTime() }
      return row.accessToken
    }
    const tokens = await call<Tokens>('POST', '/v1/auth/refresh', { body: { refreshToken: row.refreshToken } })
    await tx
      .update(hangarCredential)
      .set({
        accessToken: tokens.accessToken,
        accessExpiresAt: new Date(tokens.accessExpiresAt),
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: new Date(tokens.refreshExpiresAt),
        updatedAt: sql`now()`,
      })
      .where(eq(hangarCredential.id, CREDENTIAL_ID))
    cached = { token: tokens.accessToken, expiresAt: new Date(tokens.accessExpiresAt).getTime() }
    return tokens.accessToken
  })
  return token
}

async function authed<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  try {
    return await call<T>(method, path, { token: await accessToken(), body, idempotencyKey })
  } catch (err) {
    // A token revoked server-side: drop the cache and retry once.
    if (err instanceof HangarError && err.status === 401 && cached) {
      cached = null
      return call<T>(method, path, { token: await accessToken(), body, idempotencyKey })
    }
    throw err
  }
}

const key = (): string => randomUUID()

// --- API ---

export const hangar = {
  me: () => authed<Me>('GET', '/v1/me'),
  usage: () => authed<Usage>('GET', '/v1/usage'),
  templates: async () => (await authed<{ templates: Template[] }>('GET', '/v1/templates')).templates,

  listMachines: async () => {
    const machines: Machine[] = []
    let cursor: string | null = null
    do {
      const q: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      const page: { machines: Machine[]; nextCursor: string | null } = await authed('GET', `/v1/machines${q}`)
      machines.push(...page.machines)
      cursor = page.nextCursor
    } while (cursor)
    return machines
  },
  getMachine: (id: string) => authed<Machine>('GET', `/v1/machines/${id}`),
  createMachine: (req: CreateMachineRequest, idempotencyKey = key()) =>
    authed<Operation>('POST', '/v1/machines', req, idempotencyKey),
  startMachine: (id: string, idempotencyKey = key()) =>
    authed<Operation>('POST', `/v1/machines/${id}/start`, {}, idempotencyKey),
  stopMachine: (id: string, idempotencyKey = key()) =>
    authed<Operation>('POST', `/v1/machines/${id}/stop`, {}, idempotencyKey),
  suspendMachine: (id: string, idempotencyKey = key()) =>
    authed<Operation>('POST', `/v1/machines/${id}/suspend`, undefined, idempotencyKey),
  deleteMachine: (id: string, idempotencyKey = key()) =>
    authed<Operation>('DELETE', `/v1/machines/${id}`, undefined, idempotencyKey),

  getOperation: (id: string) => authed<Operation>('GET', `/v1/operations/${id}`),
  async waitOperation(id: string, onUpdate?: (op: Operation) => void, timeoutMs = 10 * 60_000) {
    const deadline = Date.now() + timeoutMs
    let delay = 500
    for (;;) {
      const op = await hangar.getOperation(id)
      onUpdate?.(op)
      if (op.state === 'succeeded' || op.state === 'failed') return op
      if (Date.now() > deadline) throw new Error(`operation ${id} timed out (${op.state}/${op.phase})`)
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 1.5, 5000)
    }
  },

  createConnection: (machineId: string, publicKey: string, ttlSeconds = 3600) =>
    authed<Connection>('POST', `/v1/machines/${machineId}/connections`, { publicKey, ttlSeconds }, key()),

  listImages: async () => (await authed<{ images: Image[] }>('GET', '/v1/images')).images,
  createImage: (machineId: string, name: string, description?: string) =>
    authed<Image>('POST', `/v1/machines/${machineId}/images`, { name, description }, key()),
  deleteImage: (id: string) => authed<void>('DELETE', `/v1/images/${id}`, undefined, key()),
}
