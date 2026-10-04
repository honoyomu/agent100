// First-boot setup of an agent machine over SSH: secrets, harness config and
// services. Everything lands under HOME (/data/home), which images never carry.
import type { Client } from 'ssh2'
import { run } from '../hangar/ssh.js'
import { HARNESSES, WORKSPACE } from './harnesses.js'
import type { Harness } from '../db/schema.js'

const ENV_FILE = '.agent100/env'
const SOURCE_LINE = `[ -f "$HOME/${ENV_FILE}" ] && . "$HOME/${ENV_FILE}"`

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

async function writeFile(client: Client, path: string, content: string, mode = '600') {
  await run(client, `mkdir -p "$(dirname ~/${path})" && cat > ~/${path} && chmod ${mode} ~/${path}`, { stdin: content })
}

export async function configureAgent(client: Client, harness: Harness, secrets: { openrouterApiKey: string }) {
  const def = HARNESSES[harness]
  await run(client, `mkdir -p ${WORKSPACE}`)

  const env = [`export OPENROUTER_API_KEY=${shq(secrets.openrouterApiKey)}`, ...def.env].join('\n') + '\n'
  await writeFile(client, ENV_FILE, env)
  // Source it from both: login shells read .profile, and .bashrc returns early
  // for non-interactive shells, so the line goes at its top.
  await run(
    client,
    `grep -qF '${ENV_FILE}' ~/.profile || echo ${shq(SOURCE_LINE)} >> ~/.profile; ` +
      `grep -qF '${ENV_FILE}' ~/.bashrc || sed -i ${shq(`1i ${SOURCE_LINE}`)} ~/.bashrc`,
  )

  for (const file of def.files) await writeFile(client, file.path, file.content, file.mode)

  if (def.services?.length) {
    const units = def.services.join(' ')
    // Restart so a re-run picks up changed config.
    await run(client, `systemctl --user daemon-reload && systemctl --user enable ${units} && systemctl --user restart ${units}`)
  }
}
