// Small operator CLI over the app's hangar client: `pnpm hangar <command>`.
import { pool } from '../src/db/index.js'
import { hangar } from '../src/hangar/client.js'
import { connect, exec } from '../src/hangar/ssh.js'

const [cmd, ...args] = process.argv.slice(2)

async function waitFor(opPromise: ReturnType<typeof hangar.createMachine>) {
  const op = await opPromise
  return hangar.waitOperation(op.id, (o) => console.error(`  ${o.type}: ${o.state} ${o.phase ?? ''}`))
}

const commands: Record<string, () => Promise<unknown>> = {
  me: () => hangar.me(),
  usage: () => hangar.usage(),
  templates: () => hangar.templates(),
  machines: () => hangar.listMachines(),
  machine: () => hangar.getMachine(args[0]),
  images: () => hangar.listImages(),
  op: () => hangar.getOperation(args[0]),
  create: () =>
    waitFor(hangar.createMachine({ name: args[0], templateId: args[1] ?? 'herdr', vcpus: 2, memMiB: 4096 })),
  'create-from-image': () =>
    waitFor(hangar.createMachine({ name: args[0], imageId: args[1], vcpus: 2, memMiB: 4096 })),
  start: () => waitFor(hangar.startMachine(args[0])),
  stop: () => waitFor(hangar.stopMachine(args[0])),
  suspend: () => waitFor(hangar.suspendMachine(args[0])),
  delete: () => waitFor(hangar.deleteMachine(args[0])),
  ssh: async () => {
    const client = await connect(args[0])
    try {
      return await exec(client, args.slice(1).join(' '))
    } finally {
      client.end()
    }
  },
}

const run = commands[cmd]
if (!run) {
  console.error(`usage: pnpm hangar <${Object.keys(commands).join('|')}> [args]`)
  process.exit(2)
}
console.log(JSON.stringify(await run(), null, 2))
await pool.end()
