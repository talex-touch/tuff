import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type {
  PluginInstallConfirmRequest,
  PluginInstallConfirmResponse,
  PluginInstallProgressEvent
} from '@talex-touch/utils/plugin'
import type { PluginInstaller, PreparedPluginInstall } from './plugin-installer'
import type { ResolverInstallOptions } from './plugin-resolver'
import crypto from 'node:crypto'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import type { PluginInstallRequest } from '@talex-touch/utils/plugin/providers/types'
import { extractSignatureInfo, verifyPackageSignature } from './signature-verifier'
import { checkPluginActiveUI } from './plugin-ui-utils'

type PluginInstallQueueResult =
  | {
      status: 'success'
      manifest?: PreparedPluginInstall['manifest']
      provider: PreparedPluginInstall['providerResult']['provider']
      official: boolean
    }
  | {
      status: 'error'
      message: string
    }

interface InstallTask {
  id: string
  request: PluginInstallRequest
  clientMetadata?: Record<string, unknown>
  lastProgress: number
  prepared?: PreparedPluginInstall
  officialHint?: boolean
  officialActual?: boolean
  /** Whether the user already confirmed installation on the client side */
  trustedHint?: boolean
  /** Force update existing plugin */
  forceUpdate?: boolean
  /** Auto re-enable plugin after update */
  autoReEnable?: boolean
  resolve: (response: PluginInstallQueueResult) => void
}

interface PluginInstallQueueOptions {
  onInstallCompleted?: (payload: {
    request: PluginInstallRequest
    manifest?: PreparedPluginInstall['manifest']
    providerResult: PreparedPluginInstall['providerResult']
  }) => Promise<void> | void
}

function extractClientString(
  meta: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = meta?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export class PluginInstallQueue {
  private readonly installer: PluginInstaller
  private readonly queue: InstallTask[] = []
  private activeTask: InstallTask | null = null
  private readonly transport: ITuffTransportMain
  private readonly targetWindowId: number
  private readonly confirmResolvers = new Map<
    string,
    { resolve: (decision: 'accept' | 'reject') => void; reject: (reason: Error) => void }
  >()

  private readonly options?: PluginInstallQueueOptions

  constructor(
    installer: PluginInstaller,
    transport: ITuffTransportMain,
    targetWindowId: number,
    options?: PluginInstallQueueOptions
  ) {
    this.installer = installer
    this.transport = transport
    this.targetWindowId = targetWindowId
    this.options = options
  }

  /**
   * Enqueue a plugin install request.
   * Returns a Promise that resolves when the install completes (success or failure).
   */
  enqueue(request: PluginInstallRequest): Promise<PluginInstallQueueResult> {
    const id =
      request.metadata?.taskId && typeof request.metadata.taskId === 'string'
        ? request.metadata.taskId
        : crypto.randomUUID()

    return new Promise<PluginInstallQueueResult>((resolve) => {
      const task: InstallTask = {
        id,
        request,
        clientMetadata: request.clientMetadata,
        lastProgress: -1,
        officialHint:
          typeof request.metadata?.official === 'boolean' ? request.metadata.official : undefined,
        trustedHint:
          typeof request.metadata?.trusted === 'boolean' ? request.metadata.trusted : undefined,
        forceUpdate:
          typeof request.metadata?.forceUpdate === 'boolean'
            ? request.metadata.forceUpdate
            : undefined,
        autoReEnable:
          typeof request.metadata?.autoReEnable === 'boolean'
            ? request.metadata.autoReEnable
            : undefined,
        resolve
      }

      this.queue.push(task)
      this.emitProgress(task, 'queued')
      this.process()
    })
  }

  handleConfirmResponse(response: PluginInstallConfirmResponse): void {
    const resolver = this.confirmResolvers.get(response.taskId)
    if (!resolver) return

    this.confirmResolvers.delete(response.taskId)

    if (response.decision === 'accept') {
      resolver.resolve('accept')
    } else {
      const reasonMessage = response.reason || 'User rejected installation'
      resolver.reject(new Error(reasonMessage))
    }
  }

  hasActiveOrQueued(): boolean {
    return Boolean(this.activeTask) || this.queue.length > 0
  }

  private process(): void {
    if (this.activeTask || this.queue.length === 0) return

    const next = this.queue.shift()!
    this.activeTask = next
    void this.runTask(next)
  }

  private async runTask(task: InstallTask): Promise<void> {
    try {
      // Check for active UI views if this is an update
      if (task.forceUpdate) {
        const pluginName = extractClientString(task.clientMetadata, 'pluginName')
        if (pluginName) {
          const activeUIStatus = await checkPluginActiveUI(pluginName)
          if (activeUIStatus.hasActiveUI) {
            throw new Error(`PLUGIN_HAS_ACTIVE_UI:${activeUIStatus.description}`)
          }
        }
      }

      const prepared = await this.installer.prepareInstall(task.request, {
        autoResolve: false,
        onDownloadProgress: (progress) => {
          this.emitProgress(task, 'downloading', { progress })
        }
      })

      task.prepared = prepared
      task.officialActual = Boolean(prepared.providerResult.official)

      // Verify package signature if available
      if (prepared.providerResult.filePath) {
        this.emitProgress(task, 'verifying', { progress: 0 })

        const signatureInfo = extractSignatureInfo(prepared.providerResult.metadata)
        const verifyResult = await verifyPackageSignature(
          prepared.providerResult.filePath,
          signatureInfo?.signature,
          signatureInfo?.packageSize
        )

        if (!verifyResult.valid && signatureInfo?.signature) {
          // Only fail if signature was expected but invalid
          throw new Error(`Package verification failed: ${verifyResult.reason}`)
        }

        this.emitProgress(task, 'verifying', { progress: 100 })
      }

      // Skip confirmation if:
      // 1. Plugin is official (from provider result)
      // 2. User already confirmed on client side (trustedHint)
      const needsConfirmation = !task.officialActual && !task.trustedHint
      if (needsConfirmation) {
        await this.requestConfirmation(task)
      }

      this.emitProgress(task, 'installing', { progress: 0 })

      const summary = await this.installer.finalizeInstall(prepared, {
        installOptions: this.buildInstallOptions(task)
      })
      task.prepared = undefined

      this.emitProgress(task, 'completed', { progress: 100 })

      task.resolve({
        status: 'success',
        manifest: summary.manifest,
        provider: summary.providerResult.provider,
        official: summary.providerResult.official ?? false
      })

      const completionHandler = this.options?.onInstallCompleted
      if (completionHandler) {
        try {
          await completionHandler({
            request: task.request,
            manifest: summary.manifest,
            providerResult: summary.providerResult
          })
        } catch (error) {
          console.warn('[PluginInstallQueue] Failed to persist install metadata:', error)
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'INSTALL_FAILED'
      this.emitProgress(task, 'failed', { progress: 100, error: message })

      task.resolve({
        status: 'error',
        message
      })

      if (task.prepared) {
        await this.installer.discardPrepared(task.prepared).catch((cleanupError) => {
          console.warn('[PluginInstallQueue] Failed to cleanup after failed install:', cleanupError)
        })
      }
    } finally {
      this.activeTask = null
      this.process()
    }
  }

  private buildInstallOptions(task: InstallTask): ResolverInstallOptions | undefined {
    const options: ResolverInstallOptions = {}
    let hasOptions = false

    if (this.shouldEnforceProdMode(task)) {
      options.enforceProdMode = true
      hasOptions = true
    }

    if (task.forceUpdate) {
      options.forceUpdate = true
      hasOptions = true
    }

    if (task.autoReEnable) {
      options.autoReEnable = true
      hasOptions = true
    }

    return hasOptions ? options : undefined
  }

  private shouldEnforceProdMode(task: InstallTask): boolean {
    return Boolean(task.officialActual ?? task.officialHint)
  }

  private async requestConfirmation(task: InstallTask): Promise<void> {
    if (!task.prepared) return

    const payload: PluginInstallConfirmRequest = {
      taskId: task.id,
      official: Boolean(task.prepared.providerResult.official),
      pluginId: extractClientString(task.clientMetadata, 'pluginId'),
      pluginName:
        extractClientString(task.clientMetadata, 'pluginName') || task.prepared.manifest?.name,
      source: task.request.source
    }

    this.emitProgress(task, 'awaiting-confirmation', { progress: 100 })

    await this.transport
      .sendToWindow(this.targetWindowId, PluginEvents.install.confirm, payload)
      .catch((error) => {
        console.warn('[PluginInstallQueue] Failed to dispatch confirmation event:', error)
      })

    await new Promise<void>((resolve, reject) => {
      this.confirmResolvers.set(task.id, {
        resolve: () => resolve(),
        reject: async (reason) => {
          if (task.prepared) {
            await this.installer.discardPrepared(task.prepared).catch((cleanupError) => {
              console.warn('[PluginInstallQueue] Failed to cleanup after rejection:', cleanupError)
            })
            task.prepared = undefined
          }
          this.emitProgress(task, 'cancelled', { progress: 100, message: reason.message })
          reject(reason)
        }
      })
    })
  }

  private emitProgress(
    task: InstallTask,
    stage: PluginInstallProgressEvent['stage'],
    extra: Partial<PluginInstallProgressEvent> = {}
  ): void {
    const position =
      this.activeTask?.id === task.id ? 0 : this.queue.findIndex((item) => item.id === task.id) + 1
    const remaining = (this.activeTask ? 1 : 0) + this.queue.length
    const progress = typeof extra.progress === 'number' ? extra.progress : undefined

    if (stage === 'downloading' && typeof progress === 'number') {
      const rounded = Math.floor(progress)
      if (rounded === task.lastProgress) {
        return
      }
      task.lastProgress = rounded
    } else if (stage !== 'downloading') {
      task.lastProgress = -1
    }

    const payload: PluginInstallProgressEvent = {
      taskId: task.id,
      stage,
      progress,
      official: task.officialActual ?? task.officialHint,
      pluginId: extractClientString(task.clientMetadata, 'pluginId'),
      pluginName: extractClientString(task.clientMetadata, 'pluginName'),
      providerId: extractClientString(task.clientMetadata, 'providerId'),
      source: task.request.source,
      position,
      remaining,
      ...extra
    }

    void this.transport
      .sendToWindow(this.targetWindowId, PluginEvents.install.progress, payload)
      .catch((error) => {
        console.warn('[PluginInstallQueue] Failed to emit progress event:', error)
      })
  }
}
