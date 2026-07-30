import type { Client } from '@libsql/client'
import type { ModuleDestroyContext, ModuleInitContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { TempFileService } from '../../service/temp-file.service'
import type { ClipboardImagePersistenceAdapter } from './owners/clipboard-retention-owner'
import type { DiagnosticsTelemetryRetentionLifecycle } from './owners/diagnostics-retention-owner'
import type {
  IntelligenceAuditRetentionLifecycle,
  IntelligenceContextRetentionLifecycle
} from './owners/intelligence-retention-owner'
import type { PrivacyLifecycleService } from './privacy-lifecycle-service'
import type { PrivacyTransportAdapter } from './privacy-transport-handlers'
import type { PrivacyRetentionCoordinator } from './retention-coordinator'
import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import { createPrivacyDataOwnerRegistry } from './data-owner'
import {
  createClipboardImageRetentionAdapter,
  createClipboardRetentionOwner
} from './owners/clipboard-retention-owner'
import { createDiagnosticsRetentionOwner } from './owners/diagnostics-retention-owner'
import { createIntelligenceRetentionOwner } from './owners/intelligence-retention-owner'
import { createOcrScreenshotRetentionOwner } from './owners/ocr-screenshot-retention-owner'
import { createSearchRetentionOwner } from './owners/search-retention-owner'
import { createPrivacyCategoryExporter } from './privacy-export'
import { createPrivacyLifecycleService } from './privacy-lifecycle-service'
import {
  createMainPrivacySecretFileAdapter,
  createPrivacySecretService
} from './privacy-secret-service'
import { registerPrivacyTransportHandlers } from './privacy-transport-handlers'
import { createPrivacyProviderDisclosureService } from './provider-disclosure'
import { createPrivacyRetentionCoordinator } from './retention-coordinator'
import { createMainPrivacyRetentionPolicyStore } from './retention-policy-store'

export interface PrivacyLifecycleModuleDependencies {
  readonly resolveTransport: (context: ModuleInitContext<TalexEvents>) => PrivacyTransportAdapter
  readonly createService: (
    context: ModuleInitContext<TalexEvents>
  ) => PrivacyLifecycleService | Promise<PrivacyLifecycleService>
  readonly registerHandlers: (
    transport: PrivacyTransportAdapter,
    service: PrivacyLifecycleService
  ) => () => void
  readonly createCoordinator: (service: PrivacyLifecycleService) => PrivacyRetentionCoordinator
}

export interface PrivacyProductionOwnerDependencies {
  readonly coreClient: Pick<Client, 'execute' | 'batch'>
  readonly auxiliaryClient: Pick<Client, 'execute' | 'batch'>
  readonly tempFileService: TempFileService
  readonly clipboardImagePersistence: ClipboardImagePersistenceAdapter
  readonly onClipboardDeleted: (ids: readonly number[]) => void
  readonly beforeSearchDelete: () => void | Promise<void>
  readonly onSearchCompleted: () => void | Promise<void>
  readonly auditLifecycle: IntelligenceAuditRetentionLifecycle
  readonly contextLifecycle: IntelligenceContextRetentionLifecycle
  readonly telemetryLifecycle: DiagnosticsTelemetryRetentionLifecycle
  readonly logDirectory: string
}

export function resolvePrivacyCoreLogDirectory(innerRootPath: string): string {
  return path.join(innerRootPath, 'logs')
}

export function createPrivacyProductionOwnerRegistry(
  dependencies: PrivacyProductionOwnerDependencies
) {
  return createPrivacyDataOwnerRegistry([
    createClipboardRetentionOwner({
      client: dependencies.auxiliaryClient,
      imageOwner: createClipboardImageRetentionAdapter(dependencies.clipboardImagePersistence),
      onDeleted: dependencies.onClipboardDeleted
    }),
    createOcrScreenshotRetentionOwner({
      client: dependencies.auxiliaryClient,
      tempFileService: dependencies.tempFileService
    }),
    createSearchRetentionOwner({
      coreClient: dependencies.coreClient,
      auxiliaryClient: dependencies.auxiliaryClient,
      beforeDelete: dependencies.beforeSearchDelete,
      onCompleted: dependencies.onSearchCompleted
    }),
    createIntelligenceRetentionOwner({
      client: dependencies.coreClient,
      auditLifecycle: dependencies.auditLifecycle,
      contextLifecycle: dependencies.contextLifecycle
    }),
    createDiagnosticsRetentionOwner({
      client: dependencies.auxiliaryClient,
      telemetryLifecycle: dependencies.telemetryLifecycle,
      logDirectory: dependencies.logDirectory
    })
  ])
}

function requireDatabaseClients(databaseModule: typeof import('../database').databaseModule) {
  const coreClient = databaseModule.getClient()
  const auxiliaryClient = databaseModule.getAuxClient()
  if (!coreClient || !auxiliaryClient) throw new Error('PRIVACY_DATABASE_UNAVAILABLE')
  return { coreClient, auxiliaryClient }
}

async function createProductionService(): Promise<PrivacyLifecycleService> {
  const [
    { dialog },
    { innerRootPath },
    { tempFileService },
    { contextHygieneService },
    { intelligenceAuditLogger },
    { clipboardModule },
    { databaseModule },
    { operationalErrorService },
    { getMainConfig },
    { default: searchEngineCore },
    { getSentryService }
  ] = await Promise.all([
    import('electron'),
    import('../../core/precore'),
    import('../../service/temp-file.service'),
    import('../ai/intelligence-context-hygiene'),
    import('../ai/intelligence-audit-logger'),
    import('../clipboard'),
    import('../database'),
    import('../observability'),
    import('../storage'),
    import('../box-tool/search-engine/search-core'),
    import('../sentry')
  ])
  const { coreClient, auxiliaryClient } = requireDatabaseClients(databaseModule)
  const sentryService = getSentryService()
  const ownerRegistry = createPrivacyProductionOwnerRegistry({
    coreClient,
    auxiliaryClient,
    tempFileService,
    clipboardImagePersistence: clipboardModule.getImagePersistenceForPrivacy(),
    onClipboardDeleted: (ids) => clipboardModule.evictCommittedRetentionIdsForPrivacy(ids),
    beforeSearchDelete: () => searchEngineCore.preparePrivacyRetentionCleanup(),
    onSearchCompleted: () => searchEngineCore.completePrivacyRetentionCleanup(),
    auditLifecycle: intelligenceAuditLogger,
    contextLifecycle: contextHygieneService,
    telemetryLifecycle: Object.freeze({
      clearFailureBefore: sentryService.clearTelemetryFailureBeforeForPrivacy.bind(sentryService)
    }),
    logDirectory: resolvePrivacyCoreLogDirectory(innerRootPath)
  })
  const policyStore = createMainPrivacyRetentionPolicyStore()
  const exporter = createPrivacyCategoryExporter({
    showSaveDialog: async () => {
      const result = await dialog.showSaveDialog({
        title: 'Export privacy data',
        defaultPath: 'talex-touch-privacy-export.json',
        properties: ['createDirectory', 'showOverwriteConfirmation']
      })
      return Object.freeze({
        canceled: result.canceled,
        ...(result.filePath ? { filePath: result.filePath } : {})
      })
    }
  })
  const disclosure = createPrivacyProviderDisclosureService({
    getConfig: () => getMainConfig(StorageList.IntelligenceConfig)
  })
  const secretFiles = createMainPrivacySecretFileAdapter({
    showSaveDialog: async () => {
      const result = await dialog.showSaveDialog({
        title: 'Export encrypted credentials',
        defaultPath: 'talex-touch-secret-backup.json',
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        filters: [{ name: 'Talex Touch Secret Backup', extensions: ['json'] }]
      })
      return Object.freeze({
        canceled: result.canceled,
        ...(result.filePath ? { filePath: result.filePath } : {})
      })
    },
    showOpenDialog: async () => {
      const result = await dialog.showOpenDialog({
        title: 'Restore encrypted credentials',
        properties: ['openFile'],
        filters: [{ name: 'Talex Touch Secret Backup', extensions: ['json'] }]
      })
      return Object.freeze({
        canceled: result.canceled,
        filePaths: Object.freeze([...result.filePaths])
      })
    }
  })
  const secrets = createPrivacySecretService({ rootPath: innerRootPath, files: secretFiles })

  return createPrivacyLifecycleService({
    ownerRegistry,
    policyStore,
    exporter,
    disclosure,
    secrets,
    reportError: (report) =>
      operationalErrorService.report({
        domain: 'privacy',
        operation: report.operation,
        code: report.code,
        error: new Error(report.code),
        severity: 'warning',
        retryable: report.ownerCodes?.some((code) => code.includes('DATABASE')) ?? false,
        userImpact: 'degraded'
      })
  })
}

function defaultDependencies(): PrivacyLifecycleModuleDependencies {
  return Object.freeze({
    resolveTransport: (context) =>
      resolveMainRuntime(context, 'PrivacyLifecycleModule.onInit')
        .transport as unknown as PrivacyTransportAdapter,
    createService: async () => await createProductionService(),
    registerHandlers: (transport, service) =>
      registerPrivacyTransportHandlers(
        transport,
        Object.freeze({
          getPolicy: service.getPolicy,
          updatePolicy: service.updatePolicy,
          getSummary: service.getSummary,
          previewCleanup: service.previewCleanup,
          runCleanup: service.runCleanup,
          previewCategoryDelete: service.previewCategoryDelete,
          exportCategories: service.exportCategories,
          deleteCategories: service.deleteCategories,
          getProviderDisclosure: service.getProviderDisclosure,
          backupSecretsPreview: service.backupSecretsPreview,
          backupSecretsWrite: service.backupSecretsWrite,
          restoreSecretsPreview: service.restoreSecretsPreview,
          restoreSecretsApply: service.restoreSecretsApply
        })
      ),
    createCoordinator: (service) =>
      createPrivacyRetentionCoordinator({
        polling: Object.freeze({
          register: PollingService.getInstance().register.bind(PollingService.getInstance()),
          unregister: PollingService.getInstance().unregister.bind(PollingService.getInstance())
        }),
        service: Object.freeze({
          runScheduledCleanup: service.runScheduledCleanup,
          runCleanup: service.runCleanup,
          updatePolicy: service.updatePolicy,
          destroy: service.destroy
        })
      })
  })
}

async function collectTeardownErrors(
  steps: ReadonlyArray<() => void | Promise<void>>
): Promise<unknown[]> {
  const errors: unknown[] = []
  for (const step of steps) {
    try {
      await step()
    } catch (error) {
      errors.push(error)
    }
  }
  return errors
}

export class PrivacyLifecycleModule extends BaseModule<TalexEvents> {
  static readonly key = Symbol.for('PrivacyLifecycle')

  private readonly dependencies: PrivacyLifecycleModuleDependencies
  private service: PrivacyLifecycleService | null = null
  private coordinator: PrivacyRetentionCoordinator | null = null
  private disposeHandlers: (() => void) | null = null

  constructor(dependencies: PrivacyLifecycleModuleDependencies = defaultDependencies()) {
    super(PrivacyLifecycleModule.key)
    this.dependencies = dependencies
  }

  async onInit(context: ModuleInitContext<TalexEvents>): Promise<void> {
    if (this.service || this.coordinator || this.disposeHandlers) return
    const service = await this.dependencies.createService(context)
    this.service = service
    let coordinator: PrivacyRetentionCoordinator | null = null
    try {
      coordinator = this.dependencies.createCoordinator(service)
      this.coordinator = coordinator
      await coordinator.initializeAfterStorageReady()
      const transport = this.dependencies.resolveTransport(context)
      this.disposeHandlers = this.dependencies.registerHandlers(transport, service)
    } catch (error) {
      const disposeHandlers = this.disposeHandlers
      this.disposeHandlers = null
      this.coordinator = null
      this.service = null
      const teardownSteps: Array<() => void | Promise<void>> = []
      if (disposeHandlers) teardownSteps.push(() => disposeHandlers())
      if (coordinator) {
        const initializedCoordinator = coordinator
        teardownSteps.push(() => initializedCoordinator.shutdown())
      } else {
        teardownSteps.push(() => service.destroy())
      }
      const teardownErrors = await collectTeardownErrors(teardownSteps)
      if (teardownErrors.length > 0) {
        throw new AggregateError(
          [error, ...teardownErrors],
          'PRIVACY_LIFECYCLE_MODULE_INITIALIZATION_FAILED'
        )
      }
      throw error
    }
  }

  async onDestroy(_context: ModuleDestroyContext<TalexEvents>): Promise<void> {
    const disposeHandlers = this.disposeHandlers
    const coordinator = this.coordinator
    const service = this.service
    this.disposeHandlers = null
    this.coordinator = null
    this.service = null
    const teardownSteps: Array<() => void | Promise<void>> = []
    if (disposeHandlers) teardownSteps.push(() => disposeHandlers())
    if (coordinator) teardownSteps.push(() => coordinator.shutdown())
    else if (service) teardownSteps.push(() => service.destroy())
    const teardownErrors = await collectTeardownErrors(teardownSteps)
    if (teardownErrors.length > 0) {
      throw new AggregateError(teardownErrors, 'PRIVACY_LIFECYCLE_MODULE_SHUTDOWN_FAILED')
    }
  }
}

export const privacyLifecycleModule = new PrivacyLifecycleModule()
