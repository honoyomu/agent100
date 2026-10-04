// Signed, expiring tokens that carry an agent from the dashboard to the web
// proxy host: a one-minute handoff token in the URL, then a session cookie.
import { createHmac, timingSafeEqual } from 'node:crypto'

const secret = () => {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s) throw new Error('BETTER_AUTH_SECRET is not set')
  return s
}

export interface WebGrant {
  agentId: string
  userId: string
  purpose: 'handoff' | 'session'
  exp: number // unix ms
}

const mac = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

export function signGrant(grant: WebGrant) {
  const payload = Buffer.from(JSON.stringify(grant)).toString('base64url')
  return `${payload}.${mac(payload)}`
}

export function verifyGrant(token: string | undefined, purpose: WebGrant['purpose']): WebGrant | null {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = Buffer.from(mac(payload))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const grant = JSON.parse(Buffer.from(payload, 'base64url').toString()) as WebGrant
    if (grant.purpose !== purpose || grant.exp < Date.now()) return null
    return grant
  } catch {
    return null
  }
}
