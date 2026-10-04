// Apply an agent configuration to an existing machine: `pnpm tsx scripts/configure.ts <machineId> <harness>`.
import { configureAgent } from '../src/agents/configure.js'
import { pool } from '../src/db/index.js'
import type { Harness } from '../src/db/schema.js'
import { connect } from '../src/hangar/ssh.js'

const [machineId, harness] = process.argv.slice(2)
const client = await connect(machineId)
await configureAgent(client, harness as Harness, { openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '' })
client.end()
await pool.end()
console.log('configured')
