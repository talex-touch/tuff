import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PrivacyEvents } from '@talex-touch/utils/transport/events'
import { createPrivacySdk } from '@talex-touch/utils/transport/sdk/domains/privacy'
import { app } from 'electron'
import {
  createPrivacyDataOwnerRegistry,
  privacyOwnerCompletedDelete,
  privacyOwnerCompletedExport
} from './modules/privacy/data-owner'
import { PORTABLE_SECRET_CATALOG_V1 } from './modules/privacy/portable-secret-catalog'
import { createPrivacyCategoryExporter } from './modules/privacy/privacy-export'
import { createPrivacyLifecycleService } from './modules/privacy/privacy-lifecycle-service'
import {
  runOrchestratorPrivacyAcceptance,
  withOrchestratorPrivacyTransportFixture,
  type OrchestratorPrivacyTransportFixture
} from './modules/privacy/orchestrator-run-privacy-acceptance'
import {
  createMainPrivacySecretFileAdapter,
  createPrivacySecretService
} from './modules/privacy/privacy-secret-service'
import { registerPrivacyTransportHandlers } from './modules/privacy/privacy-transport-handlers'
import { createPrivacyProviderDisclosureService } from './modules/privacy/provider-disclosure'
import { createPrivacyRetentionPolicyStore } from './modules/privacy/retention-policy-store'
import { getSecureStoreValueStrict, setSecureStoreValue } from './utils/secure-store'

const PASSWORD = 'synthetic-smoke-password'
const SECRET_CANARY = 'synthetic-smoke-provider-secret'
const ENDPOINT_CANARY = 'https://user:password@example.invalid/v1?token=synthetic'
const TIMEOUT_MS = 50_000
const ISOLATED_PROFILE_PATH = fsSync.mkdtempSync(
  path.join(os.tmpdir(), 'tuff-privacy-electron-profile-')
)
app.setPath('userData', ISOLATED_PROFILE_PATH)

function collectPrivacyEventNames(value: unknown, result = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return result
  if (
    Object.hasOwn(value, 'toEventName') &&
    typeof (value as { toEventName?: unknown }).toEventName === 'function'
  ) {
    result.add((value as { toEventName: () => string }).toEventName())
    return result
  }
  for (const child of Object.values(value)) collectPrivacyEventNames(child, result)
  return result
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('SMOKE_TIMEOUT')
}

async function verifyBuiltEntrypoint(): Promise<boolean> {
  const expected = path.resolve(
    process.env.TUFF_PRIVACY_SMOKE_EXPECTED_ENTRYPOINT ||
      path.join(process.cwd(), 'out/main/privacy-lifecycle-smoke.js')
  )
  const launched = path.resolve(process.argv[1] ?? '')
  const [expectedReal, launchedReal, stats] = await Promise.all([
    fs.realpath(expected),
    fs.realpath(launched),
    fs.stat(expected)
  ])
  return expectedReal === launchedReal && stats.isFile() && stats.size > 0
}

async function resolvePackagedMigrationsFolder(): Promise<string> {
  const launched = await fs.realpath(path.resolve(process.argv[1] ?? ''))
  const appAsarRoot = path.resolve(path.dirname(launched), '..', '..')
  const migrationsFolder = path.join(appAsarRoot, 'resources', 'db', 'migrations')
  const journal = await fs.stat(path.join(migrationsFolder, 'meta', '_journal.json'))
  if (!journal.isFile() || journal.size <= 0) throw new Error('SMOKE_MIGRATIONS_MISSING')
  return migrationsFolder
}

async function runSmokeWithOrchestratorFixture(
  signal: AbortSignal,
  rootPath: string,
  packagedPrivacyChecks: Awaited<ReturnType<typeof runOrchestratorPrivacyAcceptance>>,
  orchestratorFixture: OrchestratorPrivacyTransportFixture
): Promise<Record<string, unknown>> {
  const exportPath = path.join(rootPath, 'privacy-export.json')
  const secretBackupPath = path.join(rootPath, 'secret-backup.json')
  const expectedEventNames = collectPrivacyEventNames(PrivacyEvents)
  const catalogEntry = PORTABLE_SECRET_CATALOG_V1.find(
    (entry) => entry.ownerKind === 'provider' && entry.ownerId === 'openai-default'
  )
  if (!catalogEntry) throw new Error('SMOKE_PROVIDER_CATALOG_ENTRY_MISSING')

  let policySnapshot: unknown
  let deletedCount = 0
  let dialogSaveCount = 0
  let dialogOpenCount = 0
  const owner = {
    categories: Object.freeze(['clipboard-history'] as const),
    async inspect() {
      assertNotAborted(signal)
      return Object.freeze({
        ok: true,
        code: 'PRIVACY_OWNER_COMPLETED' as const,
        retryable: false,
        category: 'clipboard-history' as const,
        itemCount: 1,
        byteCount: 64,
        retentionMs: 30 * 24 * 60 * 60_000
      })
    },
    async previewDelete() {
      assertNotAborted(signal)
      return Object.freeze({
        ok: true,
        code: 'PRIVACY_OWNER_COMPLETED' as const,
        retryable: false,
        category: 'clipboard-history' as const,
        eligibleItemCount: 1,
        eligibleByteCount: 64,
        protectedItemCount: 0,
        bounded: true
      })
    },
    async delete() {
      assertNotAborted(signal)
      deletedCount += 1
      return privacyOwnerCompletedDelete('clipboard-history', {
        deletedItemCount: 1,
        deletedByteCount: 64,
        batches: 1
      })
    },
    async export(
      _request: unknown,
      writer: {
        write: (record: Record<string, unknown>) => Promise<{ byteCount: number }>
      }
    ) {
      assertNotAborted(signal)
      const written = await writer.write(
        Object.freeze({
          kind: 'clipboard-record',
          id: 'synthetic-record-1',
          type: 'text',
          createdAt: 1_700_000_000_000,
          favorite: false,
          important: false
        })
      )
      return privacyOwnerCompletedExport('clipboard-history', {
        exportedItemCount: 1,
        exportedByteCount: written.byteCount
      })
    },
    async applyRetention() {
      assertNotAborted(signal)
      return Object.freeze([])
    }
  }

  const ownerRegistry = createPrivacyDataOwnerRegistry([owner])
  const policyStore = createPrivacyRetentionPolicyStore({
    async read() {
      assertNotAborted(signal)
      return policySnapshot
    },
    async write(policy) {
      assertNotAborted(signal)
      policySnapshot = structuredClone(policy)
    }
  })
  const exporter = createPrivacyCategoryExporter({
    showSaveDialog: async () => {
      assertNotAborted(signal)
      dialogSaveCount += 1
      return { canceled: false, filePath: exportPath }
    },
    now: () => 1_700_000_000_000,
    createReportId: () => 'report_privacy_smoke_001'
  })
  const disclosure = createPrivacyProviderDisclosureService({
    getConfig: () => ({
      providers: [
        {
          id: 'synthetic-remote',
          type: 'custom',
          name: 'Synthetic Remote',
          enabled: true,
          apiKey: SECRET_CANARY,
          baseUrl: ENDPOINT_CANARY,
          capabilities: ['text.translate']
        }
      ],
      capabilities: {}
    })
  })
  const files = createMainPrivacySecretFileAdapter({
    showSaveDialog: async () => {
      assertNotAborted(signal)
      dialogSaveCount += 1
      return { canceled: false, filePath: secretBackupPath }
    },
    showOpenDialog: async () => {
      assertNotAborted(signal)
      dialogOpenCount += 1
      return { canceled: false, filePaths: [secretBackupPath] }
    }
  })
  const secrets = createPrivacySecretService({ rootPath, files })
  const reports: string[] = []
  const service = createPrivacyLifecycleService({
    ownerRegistry,
    policyStore,
    exporter,
    disclosure,
    secrets,
    orchestratorRuns: orchestratorFixture.lifecycle,
    reportError: (report) => {
      reports.push(report.code)
    },
    now: () => 1_700_000_000_000,
    operationTimeoutMs: 5_000
  })

  const handlers = new Map<string, (payload: unknown, context: unknown) => Promise<unknown>>()
  const invokedHandlers = new Set<string>()
  const disposeHandlers = registerPrivacyTransportHandlers(
    {
      on(event, handler) {
        const name = event.toEventName()
        if (handlers.has(name)) throw new Error('SMOKE_DUPLICATE_TYPED_HANDLER')
        handlers.set(name, handler)
        return () => handlers.delete(name)
      }
    },
    service
  )
  const createTransport = (sender: { id: number }) => ({
    send: async (event: { toEventName: () => string }, payload: unknown) => {
      assertNotAborted(signal)
      const name = event.toEventName()
      const handler = handlers.get(name)
      if (!handler) throw new Error('SMOKE_TYPED_HANDLER_MISSING')
      invokedHandlers.add(name)
      return await handler(payload, {
        sender,
        eventName: name,
        plugin: undefined
      })
    }
  })
  const sdk = createPrivacySdk(createTransport({ id: 301 }) as never)
  const crossAuthoritySdk = createPrivacySdk(createTransport({ id: 301 }) as never)
  let evidence: Record<string, unknown> | undefined

  try {
    const profileReal = await fs.realpath(ISOLATED_PROFILE_PATH)
    const rootReal = await fs.realpath(rootPath)
    const builtEntrypoint = await verifyBuiltEntrypoint()
    await setSecureStoreValue(
      rootPath,
      catalogEntry.secureStoreKey,
      SECRET_CANARY,
      catalogEntry.secureStorePurpose
    )

    const policy = await sdk.policy.get()
    const policyUpdate = await sdk.policy.update({
      version: 1,
      selections: {
        'clipboard-history': '90-days',
        'ocr-screenshot-temp': '1-day',
        'search-history': '30-days',
        'intelligence-audit': '30-days',
        'intelligence-context': '30-days',
        diagnostics: '30-days'
      }
    })
    const summary = await sdk.summary.get(['clipboard-history'])
    const cleanupPreview = await sdk.cleanup.preview(['clipboard-history'])
    const cleanup = await sdk.cleanup.run(['clipboard-history'])
    const deletePreview = await sdk.category.previewDelete(['clipboard-history'])
    if (!deletePreview.ok) throw new Error('SMOKE_DELETE_PREVIEW_FAILED')
    const deletion = await sdk.category.delete(
      ['clipboard-history'],
      'delete-selected-data',
      deletePreview.data.previewId
    )
    const firstOrchestratorPreview = await sdk.orchestratorRun.previewDelete(
      orchestratorFixture.runId
    )
    if (
      !firstOrchestratorPreview.ok ||
      firstOrchestratorPreview.data.disposition !== 'eligible' ||
      !firstOrchestratorPreview.data.previewId
    ) {
      throw new Error('SMOKE_ORCHESTRATOR_RUN_DELETE_PREVIEW_FAILED')
    }
    const crossAuthorityDelete = await crossAuthoritySdk.orchestratorRun.delete(
      'delete-orchestrator-run',
      firstOrchestratorPreview.data.previewId
    )
    const authorizedOrchestratorPreview = await sdk.orchestratorRun.previewDelete(
      orchestratorFixture.runId
    )
    if (
      !authorizedOrchestratorPreview.ok ||
      authorizedOrchestratorPreview.data.disposition !== 'eligible' ||
      !authorizedOrchestratorPreview.data.previewId
    ) {
      throw new Error('SMOKE_ORCHESTRATOR_RUN_DELETE_PREVIEW_FAILED')
    }
    const orchestratorRunDeletion = await sdk.orchestratorRun.delete(
      'delete-orchestrator-run',
      authorizedOrchestratorPreview.data.previewId
    )
    const replayedOrchestratorDelete = await sdk.orchestratorRun.delete(
      'delete-orchestrator-run',
      authorizedOrchestratorPreview.data.previewId
    )
    const exported = await sdk.category.export(['clipboard-history'])
    const providers = await sdk.provider.getDisclosure()
    const backupPreview = await sdk.secret.backupPreview()
    const backup = await sdk.secret.backupWrite(PASSWORD)

    await setSecureStoreValue(
      rootPath,
      catalogEntry.secureStoreKey,
      null,
      catalogEntry.secureStorePurpose
    )
    const restorePreview = await sdk.secret.restorePreview(PASSWORD)
    if (!restorePreview.ok) throw new Error('SMOKE_RESTORE_PREVIEW_FAILED')
    const restore = await sdk.secret.restoreApply(
      restorePreview.data.restoreId,
      PASSWORD,
      'overwrite'
    )
    const restoredSecret = await getSecureStoreValueStrict(
      rootPath,
      catalogEntry.secureStoreKey,
      catalogEntry.secureStorePurpose
    )
    const exportText = await fs.readFile(exportPath, 'utf8')
    const disclosureText = JSON.stringify(providers)
    const deletePreviewProven =
      deletePreview.ok &&
      deletePreview.data.bounded &&
      deletePreview.data.categories.length === 1 &&
      deletePreview.data.categories[0]?.category === 'clipboard-history' &&
      deletePreview.data.categories[0].eligibleItemCount === 1 &&
      deletePreview.data.categories[0].protectedItemCount === 0
    const deleteRunProven =
      deletion.ok &&
      !deletion.data.partial &&
      deletion.data.categories.length === 1 &&
      deletion.data.categories[0]?.category === 'clipboard-history' &&
      deletion.data.categories[0].deletedItemCount === 1 &&
      deletedCount === 2
    const handlerRegistrationExact =
      handlers.size === expectedEventNames.size &&
      [...expectedEventNames].every((name) => handlers.has(name))
    const handlerInvocationExact =
      invokedHandlers.size === expectedEventNames.size &&
      [...expectedEventNames].every((name) => invokedHandlers.has(name))
    const typedDeletePreview =
      firstOrchestratorPreview.ok &&
      firstOrchestratorPreview.data.disposition === 'eligible' &&
      firstOrchestratorPreview.data.eventCount === 2 &&
      authorizedOrchestratorPreview.ok &&
      authorizedOrchestratorPreview.data.disposition === 'eligible' &&
      authorizedOrchestratorPreview.data.eventCount === 2
    const authorityBoundOneShotDelete =
      !crossAuthorityDelete.ok &&
      crossAuthorityDelete.code === 'PRIVACY_REQUEST_INVALID' &&
      orchestratorRunDeletion.ok &&
      orchestratorRunDeletion.data.deletedEventCount === 2 &&
      !replayedOrchestratorDelete.ok &&
      replayedOrchestratorDelete.code === 'PRIVACY_REQUEST_INVALID' &&
      (await orchestratorFixture.verifyDeleted())
    const orchestratorRunDeleteProven = typedDeletePreview && authorityBoundOneShotDelete
    const packagedPrivacyGates = Object.freeze({
      ...packagedPrivacyChecks,
      typedDeletePreview,
      authorityBoundOneShotDelete
    })

    evidence = {
      builtEntrypoint,
      isolatedUserData: (await fs.realpath(app.getPath('userData'))) === profileReal,
      artifactsUnderIsolatedProfile: rootReal.startsWith(`${profileReal}${path.sep}`),
      handlerRegistrationExact,
      handlerInvocationExact,
      handlerCount: handlers.size,
      policy: policy.ok,
      policyUpdate: policyUpdate.ok,
      summary: summary.ok,
      cleanupPreview: cleanupPreview.ok,
      cleanup: cleanup.ok,
      deletePreviewProven,
      deleteRunProven,
      orchestratorRunDeleteProven,
      packagedPrivacyGates,
      ownerDeleteCalls: deletedCount,
      exported: exported.ok,
      exportFormat: exported.ok && exported.data.format === 'talex.touch.privacy-export/v1',
      exportDialogOwned: dialogSaveCount === 2,
      providerDisclosure: providers.ok,
      disclosureRedacted:
        !disclosureText.includes(SECRET_CANARY) && !disclosureText.includes(ENDPOINT_CANARY),
      backupPreview: backupPreview.ok,
      backup: backup.ok,
      restore: restore.ok,
      restored: restoredSecret === SECRET_CANARY,
      restoreDialogOwned: dialogOpenCount === 1,
      noReports: reports.length === 0,
      syntheticOnly:
        !exportText.includes(SECRET_CANARY) &&
        !JSON.stringify({
          policy,
          summary,
          providers,
          backup,
          restore,
          firstOrchestratorPreview,
          crossAuthorityDelete,
          authorizedOrchestratorPreview,
          orchestratorRunDeletion,
          replayedOrchestratorDelete,
          reports
        }).includes(SECRET_CANARY),
      reports
    }
    const failed = Object.entries(evidence).filter(
      ([key, value]) =>
        key !== 'handlerCount' &&
        key !== 'ownerDeleteCalls' &&
        key !== 'reports' &&
        key !== 'packagedPrivacyGates' &&
        value !== true
    )
    if (Object.values(packagedPrivacyGates).some((value) => value !== true)) {
      failed.push(['packagedPrivacyGates', packagedPrivacyGates])
    }
    if (failed.length > 0) {
      throw new Error(
        `SMOKE_ASSERTION_FAILED:${JSON.stringify({ failed: failed.map(([key]) => key) })}`
      )
    }
  } finally {
    disposeHandlers()
    await service.destroy()
  }

  if (handlers.size !== 0) throw new Error('SMOKE_TYPED_HANDLER_TEARDOWN_FAILED')
  if (!evidence) throw new Error('SMOKE_EVIDENCE_MISSING')
  return { ...evidence, handlerTeardown: true }
}

async function runSmoke(signal: AbortSignal): Promise<Record<string, unknown>> {
  const rootPath = await fs.mkdtemp(path.join(ISOLATED_PROFILE_PATH, 'lifecycle-'))
  let result: Record<string, unknown> | undefined
  try {
    const migrationsFolder = await resolvePackagedMigrationsFolder()
    const packagedPrivacyChecks = await runOrchestratorPrivacyAcceptance({
      migrationsFolder,
      temporaryRoot: rootPath
    })
    result = await withOrchestratorPrivacyTransportFixture(
      { migrationsFolder, temporaryRoot: rootPath },
      async (fixture) =>
        await runSmokeWithOrchestratorFixture(signal, rootPath, packagedPrivacyChecks, fixture)
    )
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true })
  }
  if (!result) throw new Error('SMOKE_EVIDENCE_MISSING')
  if (fsSync.existsSync(rootPath)) throw new Error('SMOKE_RUN_ARTIFACT_CLEANUP_FAILED')
  return { ...result, runArtifactsRemoved: true }
}

async function main(): Promise<void> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  let result: Record<string, unknown> | undefined
  try {
    await app.whenReady()
    const smoke = runSmoke(controller.signal)
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('SMOKE_TIMEOUT'))
      }, TIMEOUT_MS)
      timer.unref()
    })
    result = await Promise.race([smoke, timeout])
  } finally {
    controller.abort()
    if (timer) clearTimeout(timer)
    await fs.rm(ISOLATED_PROFILE_PATH, { recursive: true, force: true })
  }
  if (fsSync.existsSync(ISOLATED_PROFILE_PATH)) {
    throw new Error('SMOKE_PROFILE_ARTIFACT_CLEANUP_FAILED')
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, evidence: { ...result, isolatedProfileRemoved: true } })}\n`
  )
  app.quit()
}

void main().catch(async () => {
  await fs.rm(ISOLATED_PROFILE_PATH, { recursive: true, force: true }).catch(() => undefined)
  process.stderr.write('PRIVACY_LIFECYCLE_SMOKE_FAILED\n')
  app.exit(1)
})
