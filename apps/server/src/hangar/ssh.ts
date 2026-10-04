// SSH to hangar machines through the hangar gateway. Authenticates with a
// short-lived user certificate from POST /v1/machines/{id}/connections and
// trusts the gateway's host certificate via the CA in `hostTrust`.
// ssh2 is patched (patches/ssh2@*.patch) to speak ed25519 certificates.
import { createPublicKey, verify } from 'node:crypto'
import ssh2, { type Client, type ClientChannel, type ParsedKey, type PseudoTtyOptions } from 'ssh2'

const { utils } = ssh2
import { hangar } from './client.js'
import type { Connection } from './types.js'

const CERT_TTL_SECONDS = 4 * 3600
const CERT_RENEW_MARGIN_MS = 15 * 60_000

// One key pair per process; certificates bind it to a machine for a while.
const keyPair = utils.generateKeyPairSync('ed25519')

const certs = new Map<string, Connection>()

async function certificateFor(machineId: string): Promise<Connection> {
  const cached = certs.get(machineId)
  if (cached && new Date(cached.expiresAt).getTime() - CERT_RENEW_MARGIN_MS > Date.now()) return cached
  const conn = await hangar.createConnection(machineId, keyPair.public, CERT_TTL_SECONDS)
  certs.set(machineId, conn)
  return conn
}

/** The process private key presenting `certLine` as its public half. */
function certifiedKey(certLine: string): ParsedKey {
  const key = utils.parseKey(keyPair.private)
  if (key instanceof Error) throw key
  const [type, b64] = certLine.trim().split(/\s+/)
  const blob = Buffer.from(b64, 'base64')
  return Object.assign(key, { type, getPublicSSH: () => blob })
}

// --- host certificate verification ---

class Reader {
  pos = 0
  constructor(private buf: Buffer) {}
  u32() {
    const v = this.buf.readUInt32BE(this.pos)
    this.pos += 4
    return v
  }
  u64() {
    const v = this.buf.readBigUInt64BE(this.pos)
    this.pos += 8
    return v
  }
  bytes() {
    const len = this.u32()
    const v = this.buf.subarray(this.pos, this.pos + len)
    this.pos += len
    return v
  }
  string() {
    return this.bytes().toString('utf8')
  }
}

function ed25519PublicKey(raw: Buffer) {
  // SPKI DER prefix for an Ed25519 public key.
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw])
  return createPublicKey({ key: der, format: 'der', type: 'spki' })
}

/** Checks an ssh-ed25519 host certificate against the hangar host CA. */
export function verifyHostCertificate(blob: Buffer, hostTrust: Connection['hostTrust'], host: string): boolean {
  try {
    const r = new Reader(blob)
    if (r.string() !== 'ssh-ed25519-cert-v01@openssh.com') return false
    r.bytes() // nonce
    r.bytes() // public key
    r.u64() // serial
    if (r.u32() !== 2) return false // host certificate
    r.bytes() // key id
    const principals: string[] = []
    const pr = new Reader(r.bytes())
    while (pr.pos < pr['buf'].length) principals.push(pr.string())
    const now = BigInt(Math.floor(Date.now() / 1000))
    const validAfter = r.u64()
    const validBefore = r.u64()
    if (now < validAfter || now >= validBefore) return false
    r.bytes() // critical options
    r.bytes() // extensions
    r.bytes() // reserved
    const signatureKey = r.bytes()
    const signedLength = r.pos
    const sig = new Reader(r.bytes())

    const caBlob = Buffer.from(hostTrust.publicKey.trim().split(/\s+/)[1], 'base64')
    if (!signatureKey.equals(caBlob)) return false
    if (principals.length && !principals.includes(host)) return false

    const caKey = new Reader(caBlob)
    if (caKey.string() !== 'ssh-ed25519') return false
    if (sig.string() !== 'ssh-ed25519') return false
    return verify(null, blob.subarray(0, signedLength), ed25519PublicKey(caKey.bytes()), sig.bytes())
  } catch {
    return false
  }
}

// --- connections ---

export async function connect(machineId: string): Promise<Client> {
  const conn = await certificateFor(machineId)
  const client = new ssh2.Client()
  await new Promise<void>((resolve, reject) => {
    client
      .once('ready', () => resolve())
      .once('error', reject)
      .connect({
        host: conn.host,
        port: conn.port,
        username: conn.username,
        // The types predate the certificate patch; the runtime accepts both.
        authHandler: [{ type: 'publickey', username: conn.username, key: certifiedKey(conn.certificate) } as never],
        algorithms: { serverHostKey: ['ssh-ed25519-cert-v01@openssh.com' as never] },
        hostVerifier: (key: Buffer) => verifyHostCertificate(key, conn.hostTrust, conn.host),
        keepaliveInterval: 15_000,
        readyTimeout: 30_000,
      })
  })
  return client
}

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
}

/** Runs one command (through the guest's login shell) and collects its output. */
export function exec(client: Client, command: string, opts: { stdin?: string } = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) return reject(err)
      let stdout = ''
      let stderr = ''
      stream.on('data', (d: Buffer) => (stdout += d.toString()))
      stream.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
      stream.on('close', (code: number | null) => resolve({ code, stdout, stderr }))
      if (opts.stdin !== undefined) stream.end(opts.stdin)
      else stream.end()
    })
  })
}

/** Like exec, but throws when the command exits non-zero. */
export async function run(client: Client, command: string, opts: { stdin?: string } = {}) {
  const result = await exec(client, command, opts)
  if (result.code !== 0) {
    throw new Error(`\`${command.slice(0, 80)}\` exited ${result.code}: ${(result.stderr || result.stdout).trim().slice(-2000)}`)
  }
  return result.stdout
}

export function shell(client: Client, command: string, pty: PseudoTtyOptions): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.exec(command, { pty }, (err, stream) => (err ? reject(err) : resolve(stream)))
  })
}

/** Opens a TCP stream to `port` on the machine's loopback (direct-tcpip). */
export function forward(client: Client, port: number): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, '127.0.0.1', port, (err, stream) => (err ? reject(err) : resolve(stream)))
  })
}
