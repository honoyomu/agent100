import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.js'
import * as authSchema from './auth-schema.js'
import * as schema from './schema.js'

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  // InstaCloud Postgres scales to zero; drop idle sockets before it suspends.
  idleTimeoutMillis: 30_000,
})

export const db = drizzle(pool, { schema: { ...authSchema, ...schema } })
