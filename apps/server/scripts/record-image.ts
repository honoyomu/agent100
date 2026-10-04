// Offer an image built with `build-image.ts --no-record` to users:
//   pnpm tsx scripts/record-image.ts <harness> <imageId> <name> [versions]
import { db, pool } from '../src/db/index.js'
import { HARNESSES, harnessImage, type Harness } from '../src/db/schema.js'

const [harness, imageId, name, versions] = process.argv.slice(2)
if (!HARNESSES.includes(harness as Harness) || !imageId || !name) {
  throw new Error('usage: record-image.ts <harness> <imageId> <name> [versions]')
}
await db.insert(harnessImage).values({ imageId, harness: harness as Harness, name, versions: versions ?? null })
console.log(`recorded ${imageId} for ${harness}`)
await pool.end()
