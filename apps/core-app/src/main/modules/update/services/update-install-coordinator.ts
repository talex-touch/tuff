import type { UpdateLifecycleSnapshot } from '@talex-touch/utils'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { QuitIntent } from '../../../core/quit-intent'
import type { LogOptions } from '../../../utils/logger'
import type { UpdateAttemptRepository } from '../update-attempt-repository'
import type { VerifiedUpdatePackage } from '../update-system'
import type { UpdateHandoffPlan, UpdateRecoveryMarker } from './update-recovery-store'
import type { PreparedMacUpdate } from './macos-update-preparation'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { setQuitIntent } from '../../../core/quit-intent'
import { UpdateLifecycleConflictError } from '../update-lifecycle'
import {
  prepareMacUpdate,
  resolveMacSwapHelper,
  validatePreparedMacUpdate
} from './macos-update-preparation'
import {
  assertPlatformInstallPreflight,
  buildPlatformInstallSpec,
  preparePlatformPackage,
  resolveBundledScript,
  resolveCurrentMacAppBundlePath
} from './update-platform-adapter'
import { UPDATE_HANDOFF_SCHEMA_VERSION, UpdateRecoveryStore } from './update-recovery-store'

const HEALTH_TIMEOUT_MS = 120_000

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess

export interface UpdateInstallCoordinatorDeps {
  repository: UpdateAttemptRepository
  storageRoot: string
  currentVersion: string
  platform: NodeJS.Platform
  resourcesPath: string
  appPath: string
  executablePath: string
  getInstallOnNormalQuit: () => boolean
  getBuildVerificationStatus: () => {
    isVerified: boolean
    isOfficialBuild: boolean
    verificationFailed: boolean
    hasOfficialKey: boolean
  }
  prepareInstallPackage: (taskId: string) => Promise<VerifiedUpdatePackage>
  requestQuit: () => void
  spawnProcess?: SpawnProcess
  log: {
    info: (message: string, details?: LogOptions) => void
    warn: (message: string, details?: LogOptions) => void
    error: (message: string, details?: LogOptions) => void
  }
}

interface PreparedHelper {
  attemptId: string
  planPath: string
  helperPath: string
}

export class UpdateInstallCoordinator {
  private readonly store: UpdateRecoveryStore
  private readonly spawnProcess: SpawnProcess
  private preparedHelper: PreparedHelper | null = null
  private helperStartedForAttempt: string | null = null
  private healthConfirmedForAttempt: string | null = null
  private readonly preparationAbort = new AbortController()

  constructor(private readonly deps: UpdateInstallCoordinatorDeps) {
    this.store = new UpdateRecoveryStore(deps.storageRoot)
    this.spawnProcess = deps.spawnProcess ?? spawn
  }

  async initialize(): Promise<void> {
    await this.store.initialize()
    await this.reconcileStartupLifecycle()
  }

  async prepareDownloadedUpdate(
    lifecycle: UpdateLifecycleSnapshot,
    verifiedPackage: VerifiedUpdatePackage
  ): Promise<void> {
    if (this.deps.platform !== 'darwin') return
    if (
      !lifecycle.attemptId ||
      !lifecycle.targetVersion ||
      lifecycle.taskId !== verifiedPackage.taskId
    ) {
      throw new Error('macOS preparation does not match the active update')
    }
    const appBundlePath = resolveCurrentMacAppBundlePath(this.deps.executablePath)
    if (!appBundlePath) throw new Error('Unable to resolve the installed macOS app')
    const { attemptRoot } = this.store.createAttemptPaths(lifecycle.attemptId)
    const startedAt = Date.now()
    await prepareMacUpdate({
      attemptId: lifecycle.attemptId,
      attemptRoot,
      appBundlePath,
      packagePath: verifiedPackage.filePath,
      packageSha256: verifiedPackage.sha256,
      targetVersion: normalizeUpdateVersion(lifecycle.targetVersion),
      resourcesPath: this.deps.resourcesPath,
      appPath: this.deps.appPath,
      signal: this.preparationAbort.signal
    })
    this.deps.log.info('macOS update prepared while application remains running', {
      meta: {
        attemptId: lifecycle.attemptId,
        phase: 'preparation',
        durationMs: Date.now() - startedAt
      }
    })
  }

  cancelPreparation(): void {
    this.preparationAbort.abort()
  }

  async scheduleInstallNow(taskId: string): Promise<UpdateLifecycleSnapshot> {
    const ready = await this.deps.repository.getActive()
    if (!ready?.attemptId || ready.phase !== 'ready') {
      throw new UpdateLifecycleConflictError('No verified update is ready to install')
    }
    if (ready.taskId !== taskId) {
      throw new UpdateLifecycleConflictError('Update task does not match the ready lifecycle')
    }

    assertPlatformInstallPreflight({
      platform: this.deps.platform,
      executablePath: this.deps.executablePath,
      buildVerificationStatus: this.deps.getBuildVerificationStatus()
    })

    const scheduled = await this.deps.repository.transition({
      attemptId: ready.attemptId,
      expectedRevision: ready.revision,
      expectedPhase: 'ready',
      to: 'install-scheduled',
      patch: { installMode: 'install-now' }
    })
    try {
      const handedOff = await this.prepareHandoff(scheduled)
      setQuitIntent('update-now', `update-install:${ready.attemptId}`)
      this.deps.requestQuit()
      return handedOff
    } catch (error) {
      await this.failLifecycle(scheduled, 'UPDATE_INSTALL_PREFLIGHT_FAILED', error)
      throw error
    }
  }

  async handleBeforeQuit(intent: QuitIntent): Promise<void> {
    let lifecycle = await this.deps.repository.getActive()
    if (!lifecycle?.attemptId) return

    if (lifecycle.phase === 'ready') {
      if (
        intent.kind !== 'user-normal' ||
        !lifecycle.rollbackCompatible ||
        !this.deps.getInstallOnNormalQuit()
      ) {
        return
      }
      try {
        assertPlatformInstallPreflight({
          platform: this.deps.platform,
          executablePath: this.deps.executablePath,
          buildVerificationStatus: this.deps.getBuildVerificationStatus()
        })
      } catch (error) {
        this.deps.log.warn('Skipped normal-quit update because silent install preflight failed', {
          error,
          meta: { attemptId: lifecycle.attemptId }
        })
        return
      }
      lifecycle = await this.deps.repository.transition({
        attemptId: lifecycle.attemptId,
        expectedRevision: lifecycle.revision,
        expectedPhase: 'ready',
        to: 'install-scheduled',
        patch: { installMode: 'normal-quit' }
      })
    }

    if (lifecycle.phase !== 'install-scheduled') return
    if (!isInstallIntentAllowed(intent, lifecycle, this.deps.getInstallOnNormalQuit())) return
    if (this.preparedHelper?.attemptId === lifecycle.attemptId) return

    try {
      await this.prepareHandoff(lifecycle)
    } catch (error) {
      await this.failLifecycle(lifecycle, 'UPDATE_INSTALL_PREFLIGHT_FAILED', error)
      throw error
    }
  }

  handleWillQuit(intent: QuitIntent): void {
    const prepared = this.preparedHelper
    if (!prepared || this.helperStartedForAttempt === prepared.attemptId) return
    if (intent.kind !== 'update-now' && intent.kind !== 'user-normal') return

    this.helperStartedForAttempt = prepared.attemptId
    const child = this.spawnProcess(
      process.execPath,
      [prepared.helperPath, '--plan', prepared.planPath, '--root', this.deps.storageRoot],
      {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      }
    )
    child.once('error', (error) => {
      this.deps.log.error('Update handoff helper failed to start', {
        error,
        meta: { attemptId: prepared.attemptId }
      })
    })
    child.unref()
    this.preparedHelper = null
    this.deps.log.info('Update handoff helper started', {
      meta: { attemptId: prepared.attemptId }
    })
  }

  async confirmStartupHealth(): Promise<void> {
    const lifecycle = await this.deps.repository.getActive()
    if (!lifecycle?.attemptId || lifecycle.phase !== 'awaiting-health') return
    if (this.healthConfirmedForAttempt === lifecycle.attemptId) return

    const plan = await this.store.readPlan(lifecycle.attemptId)
    if (!plan) throw new Error('Active update health check is missing its handoff plan')
    const currentVersion = normalizeUpdateVersion(this.deps.currentVersion)
    if (currentVersion !== plan.targetVersion) {
      throw new Error('Running version does not match the update health target')
    }

    await this.store.promotePreviousAsset({
      version: currentVersion,
      platform: this.deps.platform,
      packagePath: plan.packagePath,
      sha256: plan.packageSha256
    })
    await this.deps.repository.transition({
      attemptId: lifecycle.attemptId,
      expectedRevision: lifecycle.revision,
      expectedPhase: 'awaiting-health',
      to: 'healthy'
    })
    await this.store.writeHealthAck(plan, currentVersion)
    this.healthConfirmedForAttempt = lifecycle.attemptId
    this.deps.log.info('Update startup health acknowledged', {
      meta: { attemptId: lifecycle.attemptId, version: currentVersion }
    })
  }

  private async prepareHandoff(
    lifecycle: UpdateLifecycleSnapshot
  ): Promise<UpdateLifecycleSnapshot> {
    if (!lifecycle.attemptId || !lifecycle.taskId || !lifecycle.targetVersion) {
      throw new Error('Install lifecycle is missing task or target version')
    }

    const verifiedPackage = await this.deps.prepareInstallPackage(lifecycle.taskId)
    const currentVersion = normalizeUpdateVersion(this.deps.currentVersion)
    const allowRecovery =
      lifecycle.rollbackCompatible && lifecycle.rollbackFromVersion === currentVersion
    const cachedPreviousAsset = await this.store.readPreviousAsset()
    const previousAsset =
      allowRecovery &&
      cachedPreviousAsset &&
      normalizeUpdateVersion(cachedPreviousAsset.version) === lifecycle.rollbackFromVersion
        ? cachedPreviousAsset
        : null
    await preparePlatformPackage(this.deps.platform, verifiedPackage.filePath)
    if (previousAsset) await preparePlatformPackage(this.deps.platform, previousAsset.filePath)

    const paths = this.store.createAttemptPaths(lifecycle.attemptId)
    let preparedMacUpdate: PreparedMacUpdate | undefined
    if (this.deps.platform === 'darwin') {
      const appBundlePath = resolveCurrentMacAppBundlePath(this.deps.executablePath)
      if (!appBundlePath) throw new Error('Unable to resolve the installed macOS app')
      preparedMacUpdate = await validatePreparedMacUpdate(
        {
          attemptId: lifecycle.attemptId,
          attemptRoot: paths.attemptRoot,
          appBundlePath,
          packagePath: verifiedPackage.filePath,
          packageSha256: verifiedPackage.sha256,
          targetVersion: normalizeUpdateVersion(lifecycle.targetVersion),
          resourcesPath: this.deps.resourcesPath,
          appPath: this.deps.appPath
        },
        { fast: true }
      )
      const swapHelper = await resolveMacSwapHelper(this.deps.resourcesPath, this.deps.appPath)
      for (const name of ['macos-apply-update.sh', 'macos-restore-update.sh']) {
        await fs.promises.copyFile(
          resolveBundledScript(name, this.deps.resourcesPath, this.deps.appPath),
          path.join(paths.attemptRoot, name)
        )
      }
      await fs.promises.copyFile(swapHelper, path.join(paths.attemptRoot, 'tuff-native-update'))
      await fs.promises.chmod(path.join(paths.attemptRoot, 'tuff-native-update'), 0o700)
    }
    const platformSpec = buildPlatformInstallSpec({
      platform: this.deps.platform,
      packagePath: verifiedPackage.filePath,
      currentVersion,
      rollbackFromVersion: lifecycle.rollbackFromVersion,
      previousAsset,
      attemptRoot: paths.attemptRoot,
      resourcesPath: this.deps.resourcesPath,
      appPath: this.deps.appPath,
      appBundlePath: preparedMacUpdate?.appBundlePath ?? null,
      preparedMacUpdate,
      allowRecovery
    })
    const plan: UpdateHandoffPlan = {
      schemaVersion: UPDATE_HANDOFF_SCHEMA_VERSION,
      attemptId: lifecycle.attemptId,
      token: randomBytes(32).toString('hex'),
      platform: this.deps.platform,
      parentPid: process.pid,
      currentVersion,
      targetVersion: normalizeUpdateVersion(lifecycle.targetVersion),
      taskId: lifecycle.taskId,
      packagePath: verifiedPackage.filePath,
      packageSha256: verifiedPackage.sha256,
      createdAt: Date.now(),
      healthTimeoutMs: HEALTH_TIMEOUT_MS,
      ackPath: paths.ackPath,
      markerPath: paths.markerPath,
      lockPath: paths.lockPath,
      handoff: platformSpec.handoff,
      recovery: platformSpec.recovery,
      cleanupPaths: platformSpec.cleanupPaths,
      previousVersion: platformSpec.previousVersion,
      recoveryAvailable: platformSpec.recoveryAvailable,
      macosTransaction: platformSpec.macosTransaction
    }
    const planPath = await this.store.writePlan(plan)
    const helperPath = path.join(paths.attemptRoot, 'update-handoff-helper.cjs')
    await fs.promises.copyFile(
      resolveBundledHelperPath(this.deps.resourcesPath, this.deps.appPath),
      helperPath
    )

    const handedOff = await this.deps.repository.transition({
      attemptId: lifecycle.attemptId,
      expectedRevision: lifecycle.revision,
      expectedPhase: 'install-scheduled',
      to: 'handoff-started',
      patch: {
        previousVersion: platformSpec.previousVersion,
        recoveryAvailable: platformSpec.recoveryAvailable
      }
    })
    this.preparedHelper = { attemptId: handedOff.attemptId!, planPath, helperPath }
    return handedOff
  }

  private async reconcileStartupLifecycle(): Promise<void> {
    let lifecycle = await this.deps.repository.getActive()
    if (!lifecycle?.attemptId) return

    if (lifecycle.phase === 'install-scheduled') {
      await this.failLifecycle(
        lifecycle,
        'UPDATE_INSTALL_INTERRUPTED',
        'Application restarted before update handoff started'
      )
      return
    }
    if (lifecycle.phase !== 'handoff-started' && lifecycle.phase !== 'awaiting-health') return

    let plan: UpdateHandoffPlan | null
    try {
      plan = await this.store.readPlan(lifecycle.attemptId)
    } catch (error) {
      await this.failLifecycle(lifecycle, 'UPDATE_HANDOFF_PLAN_INVALID', error)
      return
    }
    if (!plan) {
      await this.failLifecycle(
        lifecycle,
        'UPDATE_HANDOFF_PLAN_MISSING',
        'Update handoff plan is missing on startup'
      )
      return
    }

    let marker: UpdateRecoveryMarker | null
    try {
      marker = await this.store.readRecoveryMarker(plan)
    } catch (error) {
      await this.failLifecycle(lifecycle, 'UPDATE_RECOVERY_MARKER_INVALID', error)
      return
    }
    const currentVersion = normalizeUpdateVersion(this.deps.currentVersion)
    if (marker) {
      lifecycle = await this.transitionToRecoveryRequired(lifecycle, marker.reason)
      if (
        currentVersion === plan.currentVersion ||
        (plan.previousVersion && currentVersion === normalizeUpdateVersion(plan.previousVersion))
      ) {
        const recovering = await this.deps.repository.transition({
          attemptId: lifecycle.attemptId!,
          expectedRevision: lifecycle.revision,
          expectedPhase: 'recovery-required',
          to: 'recovering'
        })
        await this.deps.repository.transition({
          attemptId: recovering.attemptId!,
          expectedRevision: recovering.revision,
          expectedPhase: 'recovering',
          to: 'recovered'
        })
        await this.store.writeRecoveredAck(plan, currentVersion)
      }
      return
    }

    if (currentVersion === plan.targetVersion) {
      if (lifecycle.phase === 'handoff-started') {
        await this.deps.repository.transition({
          attemptId: lifecycle.attemptId,
          expectedRevision: lifecycle.revision,
          expectedPhase: 'handoff-started',
          to: 'awaiting-health'
        })
      }
      return
    }

    if (currentVersion === plan.currentVersion) {
      const isHandoffActive = await this.isHandoffInProgress(plan)
      if (isHandoffActive) {
        this.deps.log.warn(
          'Update handoff is still in progress by external helper; deferring reconciliation and yielding to updater',
          {
            meta: {
              attemptId: lifecycle.attemptId,
              currentVersion,
              targetVersion: plan.targetVersion
            }
          }
        )
        this.deps.requestQuit()
        return
      }

      const recoveryRequired = await this.transitionToRecoveryRequired(
        lifecycle,
        'The current version remained intact after update handoff'
      )
      const recovering = await this.deps.repository.transition({
        attemptId: recoveryRequired.attemptId!,
        expectedRevision: recoveryRequired.revision,
        expectedPhase: 'recovery-required',
        to: 'recovering'
      })
      await this.deps.repository.transition({
        attemptId: recovering.attemptId!,
        expectedRevision: recovering.revision,
        expectedPhase: 'recovering',
        to: 'recovered'
      })
      await this.store.writeRecoveredAck(plan, currentVersion)
      return
    }

    await this.transitionToRecoveryRequired(
      lifecycle,
      'Application restarted without target version or a matching recovery marker'
    )
  }
  private async isHandoffInProgress(plan: UpdateHandoffPlan): Promise<boolean> {
    try {
      const lock = await this.store.readLock(plan.attemptId)
      if (!lock || lock.attemptId !== plan.attemptId || lock.token !== plan.token) {
        return false
      }
      if (Date.now() - lock.startedAt > plan.healthTimeoutMs) {
        return false
      }
      return this.isProcessAlive(lock.helperPid)
    } catch {
      return false
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
  }

  private async transitionToRecoveryRequired(
    lifecycle: UpdateLifecycleSnapshot,
    reason: string
  ): Promise<UpdateLifecycleSnapshot> {
    if (lifecycle.phase === 'recovery-required') return lifecycle
    if (lifecycle.phase !== 'handoff-started' && lifecycle.phase !== 'awaiting-health') {
      throw new UpdateLifecycleConflictError(
        'Lifecycle cannot enter recovery from its current phase'
      )
    }
    this.deps.log.warn('Update recovery is required', {
      meta: { attemptId: lifecycle.attemptId, reason }
    })
    return await this.deps.repository.transition({
      attemptId: lifecycle.attemptId!,
      expectedRevision: lifecycle.revision,
      expectedPhase: lifecycle.phase,
      to: 'recovery-required'
    })
  }

  private async failLifecycle(
    lifecycle: UpdateLifecycleSnapshot,
    code: string,
    error: unknown
  ): Promise<void> {
    if (!lifecycle.attemptId) return
    const latest = await this.deps.repository.getById(lifecycle.attemptId)
    if (!latest || ['healthy', 'recovered', 'failed', 'idle'].includes(latest.phase)) return
    try {
      await this.deps.repository.transition({
        attemptId: latest.attemptId!,
        expectedRevision: latest.revision,
        expectedPhase: latest.phase,
        to: 'failed',
        patch: {
          error: {
            code,
            message: error instanceof Error ? error.message : String(error),
            retryable: false
          }
        }
      })
    } catch (transitionError) {
      if (!(transitionError instanceof UpdateLifecycleConflictError)) throw transitionError
    }
  }
}

export function normalizeUpdateVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function isInstallIntentAllowed(
  intent: QuitIntent,
  lifecycle: UpdateLifecycleSnapshot,
  installOnNormalQuit: boolean
): boolean {
  if (intent.kind === 'update-now') return lifecycle.installMode === 'install-now'
  if (intent.kind === 'user-normal') {
    return (
      lifecycle.installMode === 'normal-quit' && lifecycle.rollbackCompatible && installOnNormalQuit
    )
  }
  return false
}

function resolveBundledHelperPath(resourcesPath: string, appPath: string): string {
  const candidates = [
    path.join(resourcesPath, 'resources', 'scripts', 'update-handoff-helper.cjs'),
    path.join(resourcesPath, 'scripts', 'update-handoff-helper.cjs'),
    path.join(appPath, 'resources', 'scripts', 'update-handoff-helper.cjs'),
    path.resolve(process.cwd(), 'resources', 'scripts', 'update-handoff-helper.cjs')
  ]
  const helperPath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!helperPath) throw new Error('Bundled update handoff helper is missing')
  return helperPath
}
