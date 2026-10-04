// One-time bootstrap: sign the service account in to hangar with the device
// flow and store its tokens in the database.
import { pool } from '../src/db/index.js'
import { hangar, HangarError, pollDeviceToken, saveTokens, startDeviceLogin } from '../src/hangar/client.js'

const start = await startDeviceLogin()
console.log(`Open ${start.verificationUri} and enter code ${start.userCode}`)
console.log(`(expires in ${Math.round(start.expiresIn / 60)} min)`)

let interval = start.interval
const deadline = Date.now() + start.expiresIn * 1000
for (;;) {
  if (Date.now() > deadline) throw new Error('device code expired')
  await new Promise((r) => setTimeout(r, interval * 1000))
  try {
    const tokens = await pollDeviceToken(start.deviceCode)
    await saveTokens(tokens)
    break
  } catch (err) {
    if (err instanceof HangarError && err.code === 'authorization_pending') continue
    if (err instanceof HangarError && err.code === 'slow_down') {
      interval += 5
      continue
    }
    throw err
  }
}

const me = await hangar.me()
console.log(`Signed in to hangar as ${me.login} (${me.userId})`)
await pool.end()
