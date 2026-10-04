// One SSH connection per machine, shared by every terminal and proxied
// request to it, closed after a while without channels.
import type { Client } from 'ssh2'
import { connect } from './ssh.js'

const IDLE_CLOSE_MS = 5 * 60_000

interface Entry {
  client: Promise<Client>
  channels: number
  idleTimer?: NodeJS.Timeout
}

const entries = new Map<string, Entry>()

function drop(machineId: string, entry: Entry) {
  if (entries.get(machineId) === entry) entries.delete(machineId)
  clearTimeout(entry.idleTimer)
}

function get(machineId: string): Entry {
  let entry = entries.get(machineId)
  if (entry) return entry
  const created: Entry = { channels: 0, client: connect(machineId) }
  entry = created
  created.client.then(
    (client) => client.on('close', () => drop(machineId, created)).on('error', () => drop(machineId, created)),
    () => drop(machineId, created),
  )
  entries.set(machineId, created)
  return created
}

/**
 * Borrow the machine's connection for one channel. Call the returned release
 * function when the channel closes.
 */
export async function acquire(machineId: string): Promise<{ client: Client; release: () => void }> {
  const entry = get(machineId)
  clearTimeout(entry.idleTimer)
  entry.channels++
  let client: Client
  try {
    client = await entry.client
  } catch (err) {
    entry.channels--
    throw err
  }
  let released = false
  return {
    client,
    release: () => {
      if (released) return
      released = true
      entry.channels--
      if (entry.channels === 0) {
        entry.idleTimer = setTimeout(() => {
          drop(machineId, entry)
          client.end()
        }, IDLE_CLOSE_MS)
      }
    },
  }
}

/** Closes the machine's connection, e.g. before it is suspended or deleted. */
export async function close(machineId: string) {
  const entry = entries.get(machineId)
  if (!entry) return
  drop(machineId, entry)
  try {
    ;(await entry.client).end()
  } catch {
    // never connected
  }
}
