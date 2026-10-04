// Mirrors the subset of hangar's pkg/hangarapi types this app uses.

export interface HangarErrorBody {
  code: string
  message: string
  requestId: string
  retryable: boolean
  operationId: string | null
}

export interface Tokens {
  accessToken: string
  accessExpiresAt: string
  refreshToken: string
  refreshExpiresAt: string
}

export interface DeviceStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
  expiresIn: number
}

export interface Me {
  userId: number
  login: string
  name?: string
  admin?: boolean
}

export interface MachineSpec {
  vcpus: number
  memMiB: number
  persistentDiskGiB: number
  rootDiskGiB?: number
}

export interface Template {
  id: string
  version: string
  digest: string
  description?: string
  runtime?: Record<string, string>
  defaultSpec: MachineSpec
  capabilities?: string[]
}

export type MachineState =
  | 'creating'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'suspending'
  | 'suspended'
  | 'resuming'
  | 'deleting'
  | 'deleted'
  | 'error'

export interface Machine {
  id: string
  name: string
  desiredState: MachineState
  state: MachineState
  revision: number
  operationId: string | null
  template: { id: string; version: string; digest: string }
  image?: { id: string }
  spec: MachineSpec
  storage: { sizeGiB: number; mountPath: string; persistent: boolean; synced: boolean }
  runtime: { ready: boolean; processesPreserved?: boolean }
  lastError?: HangarErrorBody
  createdAt: string
  updatedAt: string
}

export interface CreateMachineRequest {
  name: string
  templateId?: string
  templateVersion?: string
  imageId?: string
  vcpus?: number
  memMiB?: number
  persistentDiskGiB?: number
  rootDiskGiB?: number
  desiredState?: 'running' | 'stopped'
}

export type OperationType = 'create' | 'start' | 'stop' | 'suspend' | 'resume' | 'delete'

export interface Operation {
  id: string
  machineId: string
  type: OperationType
  state: 'queued' | 'running' | 'succeeded' | 'failed'
  phase?: string
  error: HangarErrorBody | null
  createdAt: string
  updatedAt: string
}

export interface HostTrust {
  type: 'ca'
  publicKey: string
  principals: string[]
}

export interface Connection {
  id: string
  machineId: string
  transport: 'ssh'
  host: string
  port: number
  username: string
  certificate: string
  expiresAt: string
  hostTrust: HostTrust
}

export interface Image {
  id: string
  name: string
  description?: string
  sourceMachineId: string
  sourceSnapshotSeq: number
  template: { id: string; version: string; digest: string }
  rootSizeBytes: number
  createdAt: string
}

export interface Usage {
  machines: number
  images: number
  limits: { maxMachines: number; maxImages: number; maxStoredGiB: number }
}
