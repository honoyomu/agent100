// Build a hangar image for a harness: boot the base template, install the
// harness, stop, save the root disk as an image and record it.
//   pnpm tsx scripts/build-image.ts <harness> [--no-record]
// --no-record skips the harness_image row, so the image is not offered to
// users until it is recorded (e.g. before the code that supports it ships).
import { readFile } from 'node:fs/promises'
import { db, pool } from '../src/db/index.js'
import { HARNESSES as HARNESS_IDS, harnessImage, type Harness } from '../src/db/schema.js'
import { hangar } from '../src/hangar/client.js'
import { connect, run } from '../src/hangar/ssh.js'

const BASE_TEMPLATE = 'herdr'

const harness = process.argv[2] as Harness
const record = !process.argv.includes('--no-record')
if (!HARNESS_IDS.includes(harness)) throw new Error(`usage: build-image.ts <${HARNESS_IDS.join('|')}>`)

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
const name = `agent100-${harness}-${stamp}`
const log = (msg: string) => console.log(`[${harness}] ${msg}`)

async function waitOp(op: { id: string }) {
  const done = await hangar.waitOperation(op.id, (o) => log(`${o.type}: ${o.state} ${o.phase ?? ''}`))
  if (done.state !== 'succeeded') throw new Error(`${done.type} failed: ${done.error?.message}`)
  return done
}

log(`creating builder machine ${name}`)
const created = await waitOp(await hangar.createMachine({ name, templateId: BASE_TEMPLATE, vcpus: 2, memMiB: 4096 }))
const machineId = created.machineId

try {
  const script = ['base', 'devtools', harness, 'cleanup']
    .map((part) => readFile(new URL(`../images/${part}.sh`, import.meta.url), 'utf8'))
  const client = await connect(machineId)
  log('installing')
  const out = await run(client, 'bash -s', { stdin: (await Promise.all(script)).join('\n') })
  client.end()
  const versions = out.match(/versions: (.*)/)?.[1] ?? null
  log(versions ?? 'installed')

  await waitOp(await hangar.stopMachine(machineId))
  const machine = await hangar.getMachine(machineId)
  if (!machine.storage.synced) throw new Error('machine stopped but its snapshot is not synced; retry later')

  const image = await hangar.createImage(machineId, name, `Agent100 ${harness} (${versions})`)
  if (record) await db.insert(harnessImage).values({ imageId: image.id, harness, name, versions })
  log(`image ${image.id} saved${record ? '' : ' (not recorded)'}: ${JSON.stringify({ imageId: image.id, harness, name, versions })}`)
} finally {
  await waitOp(await hangar.deleteMachine(machineId)).catch((err) => log(`cleanup failed: ${err.message}`))
  await pool.end()
}
