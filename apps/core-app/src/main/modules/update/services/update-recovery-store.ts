import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const UPDATE_HANDOFF_SCHEMA_VERSION = 1 as const

export interface UpdateHandoffCommand {
  command: string
  args: string[]
  waitForExit: boolean
}

export interface UpdateHandoffPlan {
  schemaVersion: typeof UPDATE_HANDOFF_SCHEMA_VERSION
  attemptId: string
  token: string
  platform: NodeJS.Platform
  parentPid: number
  currentVersion: string
  targetVersion: string
  taskId: string
  packagePath: string
  packageSha256: string
  createdAt: number
  healthTimeoutMs: number
  ackPath: string
  markerPath: string
  handoff: UpdateHandoffCommand
  recovery: UpdateHandoffCommand | null
  cleanupPaths: string[]
  previousVersion: string | null
  recoveryAvailable: boolean
}

export interface UpdateHealthAck {
  schemaVersion: typeof UPDATE_HANDOFF_SCHEMA_VERSION
  attemptId: string
  token: string
  status: 'healthy' | 'recovered'
  version: string
  acknowledgedAt: number
}

export interface UpdateRecoveryMarker {
  schemaVersion: typeof UPDATE_HANDOFF_SCHEMA_VERSION
  attemptId: string
  token: string
  status: 'recovery-started' | 'recovery-required' | 'handoff-failed'
  recoveryAttempted: boolean
  reason: string
  updatedAt: number
}

export interface PreviousUpdateAsset {
  schemaVersion: typeof UPDATE_HANDOFF_SCHEMA_VERSION
  version: string
  platform: NodeJS.Platform
  filename: string
  filePath: string
  sha256: string
  createdAt: number
}

const SAFE_ATTEMPT_ID = /^[a-zA-Z0-9._-]+$/

export class UpdateRecoveryStore {
  readonly recoveryRoot: string

  constructor(readonly storageRoot: string) {
    this.recoveryRoot = path.join(storageRoot, 'modules', 'update-recovery')
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.recoveryRoot, { recursive: true, mode: 0o700 })
    const previousRoot = path.join(this.recoveryRoot, 'previous')
    const oldRoot = path.join(this.recoveryRoot, '.previous-old')
    const entries = await fs.readdir(this.recoveryRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        entry.name.startsWith('.previous-') &&
        entry.name !== '.previous-old'
      ) {
        await fs.rm(path.join(this.recoveryRoot, entry.name), { recursive: true, force: true })
      }
    }
    try {
      await fs.access(previousRoot)
      await fs.rm(oldRoot, { recursive: true, force: true })
    } catch {
      try {
        await fs.rename(oldRoot, previousRoot)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  createAttemptPaths(attemptId: string): {
    attemptRoot: string
    planPath: string
    ackPath: string
    markerPath: string
  } {
    if (!SAFE_ATTEMPT_ID.test(attemptId)) {
      throw new Error('Update attempt id contains unsafe characters')
    }
    const attemptRoot = this.assertInternalPath(path.join(this.recoveryRoot, 'attempts', attemptId))
    return {
      attemptRoot,
      planPath: path.join(attemptRoot, 'plan.json'),
      ackPath: path.join(attemptRoot, 'health-ack.json'),
      markerPath: path.join(attemptRoot, 'recovery-marker.json')
    }
  }

  async writePlan(plan: UpdateHandoffPlan): Promise<string> {
    this.assertValidPlan(plan)
    const { planPath } = this.createAttemptPaths(plan.attemptId)
    await this.writeJsonAtomic(planPath, plan)
    return planPath
  }

  async readPlan(attemptId: string): Promise<UpdateHandoffPlan | null> {
    const { planPath } = this.createAttemptPaths(attemptId)
    const value = await this.readJson(planPath)
    if (!value) return null
    this.assertValidPlan(value)
    return value
  }

  async writeHealthAck(plan: UpdateHandoffPlan, version: string): Promise<void> {
    const ack: UpdateHealthAck = {
      schemaVersion: UPDATE_HANDOFF_SCHEMA_VERSION,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'healthy',
      version,
      acknowledgedAt: Date.now()
    }
    await this.writeJsonAtomic(this.assertInternalPath(plan.ackPath), ack)
  }

  async writeRecoveredAck(plan: UpdateHandoffPlan, version: string): Promise<void> {
    const ack: UpdateHealthAck = {
      schemaVersion: UPDATE_HANDOFF_SCHEMA_VERSION,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'recovered',
      version,
      acknowledgedAt: Date.now()
    }
    await this.writeJsonAtomic(this.assertInternalPath(plan.ackPath), ack)
  }

  async readRecoveryMarker(plan: UpdateHandoffPlan): Promise<UpdateRecoveryMarker | null> {
    const value = await this.readJson(this.assertInternalPath(plan.markerPath))
    if (!value) return null
    if (
      value.schemaVersion !== UPDATE_HANDOFF_SCHEMA_VERSION ||
      value.attemptId !== plan.attemptId ||
      value.token !== plan.token ||
      value.recoveryAttempted !== true ||
      typeof value.status !== 'string' ||
      !['recovery-started', 'recovery-required', 'handoff-failed'].includes(value.status)
    ) {
      throw new Error('Recovery marker does not match the active handoff plan')
    }
    return value as unknown as UpdateRecoveryMarker
  }

  async readPreviousAsset(): Promise<PreviousUpdateAsset | null> {
    const metadataPath = this.assertInternalPath(
      path.join(this.recoveryRoot, 'previous', 'metadata.json')
    )
    const value = await this.readJson(metadataPath)
    if (!value) return null
    if (
      value.schemaVersion !== UPDATE_HANDOFF_SCHEMA_VERSION ||
      typeof value.version !== 'string' ||
      typeof value.filename !== 'string' ||
      typeof value.filePath !== 'string' ||
      typeof value.sha256 !== 'string' ||
      typeof value.createdAt !== 'number' ||
      !['darwin', 'win32', 'linux'].includes(String(value.platform))
    ) {
      throw new Error('Previous update metadata is invalid')
    }
    this.assertInternalPath(value.filePath)
    try {
      await fs.access(value.filePath)
    } catch {
      return null
    }
    return value as unknown as PreviousUpdateAsset
  }

  async promotePreviousAsset(input: {
    version: string
    platform: NodeJS.Platform
    packagePath: string
    sha256: string
  }): Promise<PreviousUpdateAsset> {
    const previousRoot = this.assertInternalPath(path.join(this.recoveryRoot, 'previous'))
    const nextRoot = this.assertInternalPath(
      path.join(this.recoveryRoot, `.previous-${randomUUID()}`)
    )
    const filename = path.basename(input.packagePath)
    const nextFilePath = path.join(nextRoot, filename)
    const finalFilePath = path.join(previousRoot, filename)
    const metadata: PreviousUpdateAsset = {
      schemaVersion: UPDATE_HANDOFF_SCHEMA_VERSION,
      version: input.version,
      platform: input.platform,
      filename,
      filePath: finalFilePath,
      sha256: input.sha256,
      createdAt: Date.now()
    }

    const oldRoot = this.assertInternalPath(path.join(this.recoveryRoot, '.previous-old'))
    await fs.mkdir(nextRoot, { recursive: true, mode: 0o700 })
    let previousMoved = false
    try {
      await fs.copyFile(input.packagePath, nextFilePath)
      await this.writeJsonAtomic(path.join(nextRoot, 'metadata.json'), metadata)
      await fs.rm(oldRoot, { recursive: true, force: true })
      try {
        await fs.rename(previousRoot, oldRoot)
        previousMoved = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await fs.rename(nextRoot, previousRoot)
      await fs.rm(oldRoot, { recursive: true, force: true }).catch(() => undefined)
      return metadata
    } catch (error) {
      await fs.rm(nextRoot, { recursive: true, force: true })
      if (previousMoved) {
        await fs.rename(oldRoot, previousRoot).catch(() => undefined)
      }
      throw error
    }
  }

  assertInternalPath(candidate: string): string {
    const resolvedRoot = path.resolve(this.storageRoot)
    const resolvedCandidate = path.resolve(candidate)
    if (
      resolvedCandidate !== resolvedRoot &&
      !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
    ) {
      throw new Error('Update recovery path escapes the storage root')
    }
    return resolvedCandidate
  }

  private assertValidPlan(value: unknown): asserts value is UpdateHandoffPlan {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Update handoff plan must be an object')
    }
    const plan = value as Partial<UpdateHandoffPlan>
    if (
      plan.schemaVersion !== UPDATE_HANDOFF_SCHEMA_VERSION ||
      typeof plan.attemptId !== 'string' ||
      !SAFE_ATTEMPT_ID.test(plan.attemptId) ||
      typeof plan.token !== 'string' ||
      plan.token.length < 32 ||
      !plan.platform ||
      !['darwin', 'win32', 'linux'].includes(plan.platform) ||
      typeof plan.parentPid !== 'number' ||
      !Number.isSafeInteger(plan.parentPid) ||
      plan.parentPid <= 0 ||
      typeof plan.currentVersion !== 'string' ||
      typeof plan.targetVersion !== 'string' ||
      typeof plan.taskId !== 'string' ||
      typeof plan.packagePath !== 'string' ||
      typeof plan.packageSha256 !== 'string' ||
      typeof plan.createdAt !== 'number' ||
      typeof plan.healthTimeoutMs !== 'number' ||
      plan.healthTimeoutMs < 1_000 ||
      typeof plan.ackPath !== 'string' ||
      typeof plan.markerPath !== 'string' ||
      !Array.isArray(plan.cleanupPaths) ||
      typeof plan.recoveryAvailable !== 'boolean'
    ) {
      throw new Error('Update handoff plan has an invalid schema')
    }
    this.assertCommand(plan.handoff)
    if (plan.recovery !== null) this.assertCommand(plan.recovery)
    this.assertInternalPath(plan.packagePath)
    this.assertInternalPath(plan.ackPath)
    this.assertInternalPath(plan.markerPath)
    for (const cleanupPath of plan.cleanupPaths) this.assertInternalPath(cleanupPath)
  }

  private assertCommand(value: unknown): asserts value is UpdateHandoffCommand {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof (value as UpdateHandoffCommand).command !== 'string' ||
      !Array.isArray((value as UpdateHandoffCommand).args) ||
      !(value as UpdateHandoffCommand).args.every((arg) => typeof arg === 'string') ||
      typeof (value as UpdateHandoffCommand).waitForExit !== 'boolean'
    ) {
      throw new Error('Update handoff command is invalid')
    }
  }

  private async readJson(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  private async writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
    const safePath = this.assertInternalPath(filePath)
    await fs.mkdir(path.dirname(safePath), { recursive: true, mode: 0o700 })
    const tempPath = `${safePath}.${process.pid}.${randomUUID()}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
    await fs.rename(tempPath, safePath)
  }
}
