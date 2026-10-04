import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth-schema.js'

export const HARNESSES = ['claude-code', 'codex', 'opencode', 'hermes'] as const
export type Harness = (typeof HARNESSES)[number]

export const AGENT_STATUSES = [
  'provisioning',
  'running',
  'suspending',
  'suspended',
  'starting',
  'deleting',
  'error',
] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]

export const DEFAULT_IDLE_TIMEOUT_SECONDS = 300
export const MIN_IDLE_TIMEOUT_SECONDS = 60
export const MAX_IDLE_TIMEOUT_SECONDS = 7 * 24 * 3600

export const agent = pgTable(
  'agent',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    harness: text('harness', { enum: HARNESSES }).notNull(),
    status: text('status', { enum: AGENT_STATUSES }).notNull().default('provisioning'),
    // Hangar machine backing this agent, and the operation currently in flight.
    machineId: text('machine_id'),
    operationId: text('operation_id'),
    lastError: text('last_error'),
    lastActiveAt: timestamp('last_active_at'),
    // Suspend the machine after this long without connections or activity.
    autoPause: boolean('auto_pause').notNull().default(true),
    idleTimeoutSeconds: integer('idle_timeout_seconds').notNull().default(300),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('agent_userId_idx').on(table.userId)],
)

// Hangar tokens for the service account. The refresh token rotates on every
// refresh, so it lives here (one row) rather than in a static secret.
export const hangarCredential = pgTable('hangar_credential', {
  id: text('id').primaryKey(),
  accessToken: text('access_token').notNull(),
  accessExpiresAt: timestamp('access_expires_at').notNull(),
  refreshToken: text('refresh_token').notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at').notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

// Hangar images built per harness (scripts/build-image.ts); provisioning uses
// the newest one for the agent's harness.
export const harnessImage = pgTable('harness_image', {
  imageId: text('image_id').primaryKey(),
  harness: text('harness', { enum: HARNESSES }).notNull(),
  name: text('name').notNull(),
  versions: text('versions'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
