import { createPackage } from '@electron/asar'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { finished } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA,
  PackagedAiEvidenceVerificationError,
  runPackagedAiEvidenceVerification,
  verifyPackagedAiEvidence,
  writePackagedAiEvidenceOutputAtomic,
  type PackagedAiEvidenceVerificationErrorCode,
  type PackagedAiEvidenceVerificationInput
} from './coreapp-packaged-ai-evidence-verify'

const VERSION = '2.4.14-beta.14'
const DEFAULT_HASH = 'a'.repeat(64)
const ARTIFACT_HASH = 'b'.repeat(64)
const CHECKED_AT = '2026-08-26T12:00:00.000Z'
const AUXILIARY_CHECKED_AT = '2026-08-27T08:00:00.000Z'
const TOOL_SCREENSHOTS = [
  ['deny', 'deny-confirmation.png'],
  ['allow', 'allow-confirmation.png'],
  ['remember-replay', 'remember-confirmation.png'],
  ['reset', 'reset-confirmation.png'],
  ['timeout', 'timeout-confirmation.png'],
  ['cancel', 'cancel-confirmation.png']
] as const
const FAILURE_FEATURE_IDS = [
  'intelligence-rewrite',
  'intelligence-summarize',
  'intelligence-explain',
  'intelligence-command-registry',
  'intelligence-ask'
]
const LIVE_MCP_LAUNCHER_HASH_KEYS = ['nodeSha256', 'npxCliSha256'] as const
const LIVE_MCP_LAUNCHER_CHECK_KEYS = [
  'launcherIdentityBound',
  'nodeHashMatched',
  'npxHashMatched',
  'pathShimExcluded'
] as const
const PRIVACY_LIFECYCLE_CHECK_KEYS = [
  'typedDeletePreview',
  'authorityBoundOneShotDelete',
  'terminalRunDeletion',
  'activeRunProtected',
  'automaticRetention',
  'keysetPagination',
  'cancellationPartialCommit',
  'cascadeDelete',
  'journaledMigration',
  'utf8ByteAccounting',
  'productionSmoke'
] as const
const scriptPath = fileURLToPath(
  new URL('./coreapp-packaged-ai-evidence-verify.ts', import.meta.url)
)
const coreAppRoot = path.resolve(path.dirname(scriptPath), '..')
const temporaryRoots: string[] = []
let screenshotFixturesPromise: Promise<Buffer[]> | undefined

function createToolReport(hash = DEFAULT_HASH): Record<string, unknown> {
  return {
    schema: 'tuff.packaged-tool-confirmation-acceptance.v1',
    ok: true,
    checkedAt: '2026-08-26T07:26:59.170Z',
    scope: 'isolated-controlled',
    app: { version: VERSION, hash },
    runtime: {
      launches: 1,
      processTerminated: true,
      profileRemoved: true,
      confirmationTimeoutMode: 'controlled-override'
    },
    scenarios: [
      {
        name: 'deny',
        status: 'passed',
        toolId: 'tuff_read_file',
        risk: 'read',
        confirmationCount: 1,
        cardVisible: true,
        cardCleared: true,
        decision: 'denied',
        resultCode: 'TOOL_APPROVAL_DENIED',
        requestEnded: true,
        documentHidden: false,
        screenshot: 'deny-confirmation.png',
        audit: {
          ok: true,
          eventCount: 3,
          decision: 'denied',
          status: 'error',
          code: 'TOOL_APPROVAL_DENIED'
        }
      },
      {
        name: 'allow',
        status: 'passed',
        toolId: 'tuff_read_file',
        risk: 'read',
        confirmationCount: 1,
        cardVisible: true,
        cardCleared: true,
        decision: 'approved',
        resultCode: 'TOOL_OK',
        requestEnded: true,
        documentHidden: false,
        screenshot: 'allow-confirmation.png',
        audit: {
          ok: true,
          eventCount: 3,
          decision: 'approved',
          status: 'success',
          code: 'TOOL_OK'
        }
      },
      {
        name: 'remember-replay',
        status: 'passed',
        toolId: 'tuff_read_file',
        risk: 'read',
        confirmationCount: 1,
        cardVisible: true,
        cardCleared: true,
        decision: 'approved-remembered',
        resultCode: 'TOOL_OK',
        requestEnded: true,
        documentHidden: false,
        screenshot: 'remember-confirmation.png',
        rememberReplaySkipped: true,
        replayConfirmationCount: 0,
        audit: {
          ok: true,
          eventCount: 3,
          decision: 'approved',
          status: 'success',
          code: 'TOOL_OK'
        },
        replayAudit: {
          ok: true,
          eventCount: 3,
          decision: 'remembered',
          status: 'success',
          code: 'TOOL_OK'
        }
      },
      {
        name: 'reset',
        status: 'passed',
        toolId: 'tuff_read_file',
        risk: 'read',
        confirmationCount: 1,
        cardVisible: true,
        cardCleared: true,
        decision: 'approved-after-reset',
        resultCode: 'TOOL_OK',
        requestEnded: true,
        documentHidden: false,
        screenshot: 'reset-confirmation.png',
        audit: {
          ok: true,
          eventCount: 3,
          decision: 'approved',
          status: 'success',
          code: 'TOOL_OK'
        }
      },
      {
        name: 'timeout',
        status: 'passed',
        toolId: 'tuff_read_file',
        risk: 'read',
        confirmationCount: 1,
        cardVisible: true,
        cardCleared: true,
        decision: 'timeout',
        resultCode: 'TOOL_APPROVAL_DENIED',
        requestEnded: true,
        documentHidden: false,
        screenshot: 'timeout-confirmation.png',
        timeoutElapsedBucket: 'timeout-window',
        audit: {
          ok: true,
          eventCount: 3,
          decision: 'denied',
          status: 'error',
          code: 'TOOL_APPROVAL_DENIED'
        }
      },
      {
        name: 'cancel',
        status: 'passed',
        toolId: 'tuff_read_file',
        risk: 'read',
        confirmationCount: 1,
        cardVisible: true,
        cardCleared: true,
        decision: 'cancelled',
        resultCode: 'TOOL_EXECUTION_ABORTED',
        requestEnded: true,
        documentHidden: false,
        screenshot: 'cancel-confirmation.png',
        audit: {
          ok: true,
          eventCount: 3,
          decision: 'failed',
          status: 'error',
          code: 'TOOL_EXECUTION_ABORTED'
        },
        cancelAuditElapsedMs: 64,
        cancelAuditMaxElapsedMs: 1500
      }
    ],
    failures: []
  }
}

const failureContracts = [
  {
    name: 'no-provider',
    code: 'PROVIDER_UNAVAILABLE',
    requests: 0,
    responseHeadersSent: false,
    partialDeltaSent: false,
    bodyHeldOpen: false,
    auditDelta: 0,
    requestDelta: 0,
    intelligenceSettingsVisible: true,
    permissionSettingsVisible: false,
    intelligencePermissionRevoked: false,
    quotaDisabled: false
  },
  {
    name: 'quota-exhausted',
    code: 'QUOTA_EXHAUSTED',
    requests: 0,
    responseHeadersSent: false,
    partialDeltaSent: false,
    bodyHeldOpen: false,
    auditDelta: 0,
    requestDelta: 0,
    intelligenceSettingsVisible: false,
    permissionSettingsVisible: false,
    intelligencePermissionRevoked: false,
    quotaDisabled: true
  },
  {
    name: 'unsupported-model',
    code: 'MODEL_UNSUPPORTED',
    requests: 1,
    responseHeadersSent: true,
    partialDeltaSent: false,
    bodyHeldOpen: false,
    auditDelta: 1,
    requestDelta: 1,
    intelligenceSettingsVisible: false,
    permissionSettingsVisible: false,
    intelligencePermissionRevoked: false,
    quotaDisabled: false
  },
  {
    name: 'permission-denied',
    code: 'PERMISSION_DENIED',
    requests: 0,
    responseHeadersSent: false,
    partialDeltaSent: false,
    bodyHeldOpen: false,
    auditDelta: 0,
    requestDelta: 0,
    intelligenceSettingsVisible: false,
    permissionSettingsVisible: true,
    intelligencePermissionRevoked: true,
    quotaDisabled: false
  },
  {
    name: 'timeout',
    code: 'NETWORK_FAILURE',
    requests: 1,
    responseHeadersSent: true,
    partialDeltaSent: true,
    bodyHeldOpen: true,
    auditDelta: 1,
    requestDelta: 1,
    intelligenceSettingsVisible: true,
    permissionSettingsVisible: false,
    intelligencePermissionRevoked: false,
    quotaDisabled: false
  }
] as const

function createFailureMatrixReport(hash = DEFAULT_HASH): Record<string, unknown> {
  return {
    schema: 'tuff.packaged-ai-failure-matrix.v2',
    ok: true,
    checkedAt: '2026-08-27T04:59:07.437Z',
    app: { version: VERSION, hash },
    runtime: {
      appBundle: 'tuff.app',
      freshProfiles: 5,
      cleanupRequested: true,
      cleanupComplete: true
    },
    scenarios: failureContracts.map((contract) => ({
      name: contract.name,
      ok: true,
      profile: 'fresh-isolated',
      fixture: {
        requests: contract.requests,
        responseHeadersSent: contract.responseHeadersSent,
        partialDeltaSent: contract.partialDeltaSent,
        bodyHeldOpen: contract.bodyHeldOpen,
        boundToLoopback: true,
        closed: true
      },
      ui: {
        code: contract.code,
        reasonPresent: true,
        recoveryPresent: true,
        noticeVisible: true,
        busyCleared: true,
        retryVisible: true,
        intelligenceSettingsVisible: contract.intelligenceSettingsVisible,
        permissionSettingsVisible: contract.permissionSettingsVisible
      },
      ledger: {
        auditDelta: contract.auditDelta,
        auditSuccessDelta: 0,
        auditFailureDelta: contract.auditDelta,
        auditTokenDelta: 0,
        auditCostDelta: 0,
        day: {
          requestDelta: contract.requestDelta,
          successDelta: 0,
          failureDelta: contract.requestDelta,
          tokenDelta: 0,
          costDelta: 0
        },
        month: {
          requestDelta: contract.requestDelta,
          successDelta: 0,
          failureDelta: contract.requestDelta,
          tokenDelta: 0,
          costDelta: 0
        }
      },
      prerequisites: {
        requiredPermissionsGranted: true,
        searchProviderEnabled: true,
        pluginEnabled: true,
        intelligencePermissionRevoked: contract.intelligencePermissionRevoked,
        quotaDisabled: contract.quotaDisabled
      },
      interaction: {
        queryAccepted: true,
        candidateFeatureIds: [...FAILURE_FEATURE_IDS],
        selectedFeatureId: 'intelligence-ask',
        widgetFeatureId: 'intelligence-ask',
        promptAccepted: true,
        sendReady: true
      },
      processStopped: true,
      profileRemoved: true,
      failures: []
    })),
    failures: []
  }
}

function createProviderReport(hash = DEFAULT_HASH): Record<string, unknown> {
  return {
    schema: 'tuff.packaged-ai-provider-acceptance.v1',
    ok: true,
    checkedAt: '2026-08-26T07:31:17.041Z',
    app: { version: VERSION, hash },
    provider: {
      id: 'acceptance-ollama',
      type: 'custom',
      endpoint: 'loopback-ollama',
      model: 'smollm2:135m'
    },
    runtime: {
      appBundle: 'tuff.app',
      launches: 3,
      targetReacquired: true,
      profileRetained: false,
      cleanupRequested: true,
      cdpPort: 9681
    },
    checks: {
      ollamaReachable: true,
      modelAvailable: true,
      credentialSaved: true,
      credentialSavedExact: true,
      connectionTested: true,
      firstHomeStreamCompleted: true,
      firstHomeObservedBusyDelta: true,
      titleRequestStabilized: true,
      credentialRestoredAfterRelaunch: true,
      credentialRestoredExact: true,
      secondHomeStreamCompleted: true,
      secondHomeObservedBusyDelta: true,
      cancellationObservedBusyDelta: true,
      cancellationSettled: true,
      cancellationFlushWindowObserved: true,
      cancellationHomeAuditAbsent: true,
      cancellationBackgroundTitleRequests: 1,
      cancellationLedgerAccounted: true,
      providerDeletedThroughUi: true,
      secureStoreEnvelopeValid: true,
      secureStoreKeyDeleted: true,
      localSecretFilePresent: true,
      credentialCanaryAbsent: true,
      audit: {
        matched: 4,
        success: 4,
        failure: 0,
        promptTokens: 234,
        completionTokens: 64,
        totalTokens: 298,
        estimatedCost: 0.000362,
        invalidNumericRows: 0,
        invalidIdentityRows: 0,
        invalidOperationRows: 0,
        homeConversationRequests: 2,
        conversationTitleRequests: 2,
        uniqueTraceCount: 4,
        expectedSuccessfulRequests: 4,
        expectedHomeConversationRequests: 2,
        expectedConversationTitleRequests: 2,
        passed: true
      },
      usage: {
        dayRows: 1,
        monthRows: 1,
        requestCount: 4,
        successCount: 4,
        failureCount: 0,
        totalTokens: 298,
        promptTokens: 234,
        completionTokens: 64,
        totalCost: 0.000362,
        invalidRows: 0,
        passed: true
      }
    },
    failures: []
  }
}

function createLiveMcpReport(hash = DEFAULT_HASH): Record<string, unknown> {
  return {
    schema: 'tuff.live-mcp-acceptance.v2',
    ok: true,
    checkedAt: AUXILIARY_CHECKED_AT,
    app: { version: VERSION, hash },
    launcher: {
      nodeSha256: '1'.repeat(64),
      npxCliSha256: '2'.repeat(64)
    },
    checks: {
      explicitOptIn: true,
      realStdio: true,
      launcherIdentityBound: true,
      nodeHashMatched: true,
      npxHashMatched: true,
      pathShimExcluded: true,
      initializeHandshake: true,
      toolsListed: true,
      readTextFileCalled: true,
      roundTripCanaryMatched: true
    },
    failures: []
  }
}

function createPrivacyLifecycleReport(hash = DEFAULT_HASH): Record<string, unknown> {
  return {
    schema: 'tuff.orchestrator-privacy-lifecycle-acceptance.v2',
    ok: true,
    checkedAt: AUXILIARY_CHECKED_AT,
    app: { version: VERSION, hash },
    gateProvenance: 'packaged-app-asar',
    checks: {
      typedDeletePreview: true,
      authorityBoundOneShotDelete: true,
      terminalRunDeletion: true,
      activeRunProtected: true,
      automaticRetention: true,
      keysetPagination: true,
      cancellationPartialCommit: true,
      cascadeDelete: true,
      journaledMigration: true,
      utf8ByteAccounting: true,
      productionSmoke: true
    },
    failures: []
  }
}

function createVerificationInput(
  overrides: Partial<PackagedAiEvidenceVerificationInput> = {}
): PackagedAiEvidenceVerificationInput {
  return {
    toolReport: createToolReport(),
    failureMatrixReport: createFailureMatrixReport(),
    providerReport: createProviderReport(),
    liveMcpReport: createLiveMcpReport(),
    privacyLifecycleReport: createPrivacyLifecycleReport(),
    physicalApp: {
      version: VERSION,
      bundleBasename: 'tuff.app',
      hashBefore: DEFAULT_HASH,
      hashAfter: DEFAULT_HASH
    },
    reports: {
      'tool-confirmation': { sha256: ARTIFACT_HASH, bytes: 100 },
      'failure-matrix': { sha256: 'c'.repeat(64), bytes: 200 },
      'provider-lifecycle': { sha256: 'd'.repeat(64), bytes: 300 },
      'live-mcp': { sha256: 'e'.repeat(64), bytes: 400 },
      'privacy-lifecycle': { sha256: 'f'.repeat(64), bytes: 500 }
    },
    screenshots: TOOL_SCREENSHOTS.map(([scenario, basename], index) => ({
      scenario,
      basename,
      sha256: String(index + 1).repeat(64),
      bytes: 512 + index
    })),
    checkedAt: CHECKED_AT,
    ...overrides
  }
}

function expectCode(
  callback: () => unknown,
  expectedCode: PackagedAiEvidenceVerificationErrorCode
): void {
  let caught: unknown
  try {
    callback()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(PackagedAiEvidenceVerificationError)
  expect((caught as PackagedAiEvidenceVerificationError).code).toBe(expectedCode)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('test fixture')
  return value as Record<string, unknown>
}

function arrayField(value: unknown, key: string): unknown[] {
  const field = asRecord(value)[key]
  if (!Array.isArray(field)) throw new Error('test fixture')
  return field
}

function createTempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'tuff-packaged-ai-verifier-'))
  temporaryRoots.push(root)
  return root
}

interface PackagedAppFixtureOptions {
  asarVersion?: string
  omitAsarEntry?: string
  rawAsar?: Buffer
}

async function createPackagedApp(
  root: string,
  options: PackagedAppFixtureOptions = {}
): Promise<string> {
  const appBundle = path.join(root, 'tuff.app')
  const macOsDir = path.join(appBundle, 'Contents', 'MacOS')
  const resourcesDir = path.join(appBundle, 'Contents', 'Resources')
  mkdirSync(macOsDir, { recursive: true })
  mkdirSync(resourcesDir, { recursive: true })
  writeFileSync(
    path.join(appBundle, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleShortVersionString</key><string>${VERSION}</string>
<key>CFBundleExecutable</key><string>tuff</string>
</dict></plist>
`,
    'utf8'
  )
  const executable = path.join(macOsDir, 'tuff')
  writeFileSync(executable, '#!/bin/sh\nexit 0\n', 'utf8')
  chmodSync(executable, 0o755)
  const appAsar = path.join(resourcesDir, 'app.asar')
  if (options.rawAsar) {
    writeFileSync(appAsar, options.rawAsar)
    return appBundle
  }

  const asarSource = path.join(root, 'asar-source')
  const entries = [
    [
      'package.json',
      `${JSON.stringify({ name: 'tuff-fixture', version: options.asarVersion ?? VERSION })}\n`
    ],
    ['out/main/index.js', 'export const main = true\n'],
    ['out/main/privacy-lifecycle-smoke.js', 'export const privacySmoke = true\n'],
    ['out/main/live-mcp-smoke.js', 'export const liveMcpSmoke = true\n']
  ] as const
  for (const [entry, contents] of entries) {
    if (entry === options.omitAsarEntry) continue
    const entryPath = path.join(asarSource, entry)
    mkdirSync(path.dirname(entryPath), { recursive: true })
    writeFileSync(entryPath, contents, 'utf8')
  }
  const archiveStream = await createPackage(asarSource, appAsar)
  await finished(archiveStream)
  return appBundle
}

function hashPackagedApp(appBundle: string): string {
  return createHash('sha256')
    .update(readFileSync(path.join(appBundle, 'Contents', 'Resources', 'app.asar')))
    .digest('hex')
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function getScreenshotFixtures(): Promise<Buffer[]> {
  screenshotFixturesPromise ??= Promise.all(
    TOOL_SCREENSHOTS.map((_, index) =>
      sharp({
        create: {
          width: 64 + index,
          height: 64 + index,
          channels: 4,
          background: {
            r: 32 + index * 31,
            g: 208 - index * 23,
            b: 64 + index * 17,
            alpha: 1
          }
        }
      })
        .png()
        .toBuffer()
    )
  )
  return screenshotFixturesPromise
}

async function createFilesystemEvidence(
  root: string,
  hash: string
): Promise<{
  toolReport: string
  failureMatrixReport: string
  providerReport: string
  liveMcpReport: string
  privacyLifecycleReport: string
}> {
  const toolDir = path.join(root, 'tool')
  const toolReport = path.join(toolDir, 'tool-confirmation-acceptance.json')
  const failureMatrixReport = path.join(root, 'failure-matrix.json')
  const providerReport = path.join(root, 'provider.json')
  const liveMcpReport = path.join(root, 'live-mcp.json')
  const privacyLifecycleReport = path.join(root, 'privacy-lifecycle.json')
  writeJson(toolReport, createToolReport(hash))
  writeJson(failureMatrixReport, createFailureMatrixReport(hash))
  writeJson(providerReport, createProviderReport(hash))
  writeJson(liveMcpReport, createLiveMcpReport(hash))
  writeJson(privacyLifecycleReport, createPrivacyLifecycleReport(hash))
  const pngFixtures = await getScreenshotFixtures()
  for (const [[, basename], fixture] of TOOL_SCREENSHOTS.map(
    (item, index) => [item, pngFixtures[index]] as const
  )) {
    writeFileSync(path.join(toolDir, basename), fixture)
  }
  return {
    toolReport,
    failureMatrixReport,
    providerReport,
    liveMcpReport,
    privacyLifecycleReport
  }
}

function createCliArguments(
  appBundle: string,
  evidence: Awaited<ReturnType<typeof createFilesystemEvidence>>,
  output: string,
  entryPath = scriptPath
): string[] {
  return [
    '--no-deprecation',
    '--import',
    'tsx',
    entryPath,
    '--appBundle',
    appBundle,
    '--toolReport',
    evidence.toolReport,
    '--failureMatrixReport',
    evidence.failureMatrixReport,
    '--providerReport',
    evidence.providerReport,
    '--liveMcpReport',
    evidence.liveMcpReport,
    '--privacyLifecycleReport',
    evidence.privacyLifecycleReport,
    '--output',
    output,
    '--compact'
  ]
}

async function createAtomicWriteFixture(root: string): Promise<{
  appBundle: string
  output: string
  expectedOutputTarget: string
  manifest: ReturnType<typeof runPackagedAiEvidenceVerification>
}> {
  const appBundle = await createPackagedApp(root)
  const hash = hashPackagedApp(appBundle)
  const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
  const output = path.join(root, 'output', 'manifest.json')
  mkdirSync(path.dirname(output))
  const manifest = runPackagedAiEvidenceVerification({ appBundle, ...evidence, output }, CHECKED_AT)
  return {
    appBundle,
    output,
    expectedOutputTarget: path.join(realpathSync(path.dirname(output)), path.basename(output)),
    manifest
  }
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('packaged AI evidence verifier', () => {
  it('produces a sanitized passed manifest for a valid synchronized evidence set', () => {
    const result = verifyPackagedAiEvidence(createVerificationInput())

    expect(result).toMatchObject({
      schema: PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA,
      ok: true,
      checkedAt: CHECKED_AT,
      scope: {
        packagedEvidenceSet: 'passed',
        overallAcceptance: 'passed',
        notVerified: []
      },
      app: { version: VERSION, hash: DEFAULT_HASH }
    })
    expect(result.artifacts.reports).toHaveLength(5)
    expect(result.artifacts.screenshots).toHaveLength(6)
    expect(JSON.stringify(result)).not.toContain('/tmp/')
  })

  it('rejects live MCP and Privacy reports from different evidence runs', () => {
    const privacyLifecycle = createPrivacyLifecycleReport()
    privacyLifecycle.checkedAt = '2026-08-27T08:00:00.001Z'

    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
        ),
      'EVIDENCE_IDENTITY_MISMATCH'
    )
  })

  it('rejects extra fields at every report boundary', () => {
    const tool = createToolReport()
    const toolScenario = asRecord(arrayField(tool, 'scenarios')[0])
    asRecord(toolScenario.audit).credential = 'secret-canary'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ toolReport: tool })),
      'TOOL_REPORT_INVALID'
    )

    const failure = createFailureMatrixReport()
    const failureScenario = asRecord(arrayField(failure, 'scenarios')[0])
    asRecord(failureScenario.fixture).path = '/private/secret-canary'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ failureMatrixReport: failure })),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const provider = createProviderReport()
    const providerChecks = asRecord(provider.checks)
    asRecord(providerChecks.audit).prompt = 'secret-canary'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ providerReport: provider })),
      'PROVIDER_REPORT_INVALID'
    )

    const liveMcp = createLiveMcpReport()
    liveMcp.unexpectedPath = '/private/secret-canary'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'LIVE_MCP_REPORT_INVALID'
    )

    const privacyLifecycle = createPrivacyLifecycleReport()
    asRecord(privacyLifecycle.checks).unexpected = true
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
        ),
      'PRIVACY_LIFECYCLE_REPORT_INVALID'
    )
  })

  it('rejects a false non-launcher live MCP gate', () => {
    const liveMcp = createLiveMcpReport()
    asRecord(liveMcp.checks).initializeHandshake = false
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'LIVE_MCP_REPORT_INVALID'
    )
  })

  it.each(LIVE_MCP_LAUNCHER_HASH_KEYS)('rejects a non-SHA live MCP launcher %s', (hashKey) => {
    const liveMcp = createLiveMcpReport()
    asRecord(liveMcp.launcher)[hashKey] = 'not-a-sha256'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'LIVE_MCP_REPORT_INVALID'
    )
  })

  it.each(LIVE_MCP_LAUNCHER_HASH_KEYS)('rejects a missing live MCP launcher %s', (hashKey) => {
    const liveMcp = createLiveMcpReport()
    delete asRecord(liveMcp.launcher)[hashKey]
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'LIVE_MCP_REPORT_INVALID'
    )
  })

  it('rejects extra live MCP launcher fields', () => {
    const liveMcp = createLiveMcpReport()
    asRecord(liveMcp.launcher).path = '/private/secret-canary'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'LIVE_MCP_REPORT_INVALID'
    )
  })

  it.each(LIVE_MCP_LAUNCHER_CHECK_KEYS)('rejects a false live MCP launcher %s gate', (checkKey) => {
    const liveMcp = createLiveMcpReport()
    asRecord(liveMcp.checks)[checkKey] = false
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'LIVE_MCP_REPORT_INVALID'
    )
  })

  it('rejects incorrect Privacy lifecycle gate provenance', () => {
    const privacyLifecycle = createPrivacyLifecycleReport()
    privacyLifecycle.gateProvenance = 'source-test'
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
        ),
      'PRIVACY_LIFECYCLE_REPORT_INVALID'
    )
  })

  it('rejects missing Privacy lifecycle gate provenance', () => {
    const privacyLifecycle = createPrivacyLifecycleReport()
    delete privacyLifecycle.gateProvenance
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
        ),
      'PRIVACY_LIFECYCLE_REPORT_INVALID'
    )
  })

  it.each(PRIVACY_LIFECYCLE_CHECK_KEYS)('rejects a false Privacy lifecycle %s gate', (checkKey) => {
    const privacyLifecycle = createPrivacyLifecycleReport()
    asRecord(privacyLifecycle.checks)[checkKey] = false
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
        ),
      'PRIVACY_LIFECYCLE_REPORT_INVALID'
    )
  })

  it.each(PRIVACY_LIFECYCLE_CHECK_KEYS)(
    'rejects a missing Privacy lifecycle %s gate',
    (checkKey) => {
      const privacyLifecycle = createPrivacyLifecycleReport()
      delete asRecord(privacyLifecycle.checks)[checkKey]
      expectCode(
        () =>
          verifyPackagedAiEvidence(
            createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
          ),
        'PRIVACY_LIFECYCLE_REPORT_INVALID'
      )
    }
  )

  it('rejects tool fake-green cleanup, ordering, screenshot, and audit evidence', () => {
    const cleanup = createToolReport()
    asRecord(cleanup.runtime).profileRemoved = false
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ toolReport: cleanup })),
      'TOOL_REPORT_INVALID'
    )

    const ordering = createToolReport()
    const scenarios = arrayField(ordering, 'scenarios')
    ;[scenarios[0], scenarios[1]] = [scenarios[1], scenarios[0]]
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ toolReport: ordering })),
      'TOOL_REPORT_INVALID'
    )

    const screenshot = createToolReport()
    asRecord(arrayField(screenshot, 'scenarios')[0]).screenshot = '../deny-confirmation.png'
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ toolReport: screenshot })),
      'TOOL_REPORT_INVALID'
    )

    const audit = createToolReport()
    const firstAudit = asRecord(asRecord(arrayField(audit, 'scenarios')[0]).audit)
    firstAudit.eventCount = 2
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ toolReport: audit })),
      'TOOL_REPORT_INVALID'
    )

    const impossibleCancelBound = createToolReport()
    const cancelScenario = asRecord(arrayField(impossibleCancelBound, 'scenarios')[5])
    cancelScenario.cancelAuditElapsedMs = 0
    cancelScenario.cancelAuditMaxElapsedMs = 0
    expectCode(
      () =>
        verifyPackagedAiEvidence(createVerificationInput({ toolReport: impossibleCancelBound })),
      'TOOL_REPORT_INVALID'
    )
  })

  it('rejects failure-matrix cleanup, fixture, interaction, and ledger drift', () => {
    const cleanup = createFailureMatrixReport()
    asRecord(cleanup.runtime).cleanupComplete = false
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ failureMatrixReport: cleanup })),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const fixture = createFailureMatrixReport()
    const fixtureScenario = asRecord(arrayField(fixture, 'scenarios')[0])
    asRecord(fixtureScenario.fixture).boundToLoopback = false
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ failureMatrixReport: fixture })),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const interaction = createFailureMatrixReport()
    const interactionScenario = asRecord(arrayField(interaction, 'scenarios')[0])
    asRecord(interactionScenario.interaction).candidateFeatureIds = ['intelligence-rewrite']
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ failureMatrixReport: interaction })),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const incompleteCandidates = createFailureMatrixReport()
    const incompleteScenario = asRecord(arrayField(incompleteCandidates, 'scenarios')[0])
    asRecord(incompleteScenario.interaction).candidateFeatureIds = ['intelligence-ask']
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ failureMatrixReport: incompleteCandidates })
        ),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const duplicateBuiltin = createFailureMatrixReport()
    const duplicateScenario = asRecord(arrayField(duplicateBuiltin, 'scenarios')[0])
    asRecord(duplicateScenario.interaction).candidateFeatureIds = [
      ...FAILURE_FEATURE_IDS,
      'intelligence-ask'
    ]
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ failureMatrixReport: duplicateBuiltin })
        ),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const oversizedCandidates = createFailureMatrixReport()
    const oversizedScenario = asRecord(arrayField(oversizedCandidates, 'scenarios')[0])
    asRecord(oversizedScenario.interaction).candidateFeatureIds = [
      ...FAILURE_FEATURE_IDS,
      ...Array.from({ length: 12 }, (_, index) => `extra-${index}`)
    ]
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ failureMatrixReport: oversizedCandidates })
        ),
      'FAILURE_MATRIX_REPORT_INVALID'
    )

    const ledger = createFailureMatrixReport()
    const ledgerScenario = asRecord(arrayField(ledger, 'scenarios')[2])
    asRecord(ledgerScenario.ledger).auditFailureDelta = 0
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ failureMatrixReport: ledger })),
      'FAILURE_MATRIX_REPORT_INVALID'
    )
  })

  it('accepts Failure Matrix evidence permitted by the authoritative runner contract', () => {
    const failure = createFailureMatrixReport()
    const scenarios = arrayField(failure, 'scenarios')
    const noSettingsAction = asRecord(scenarios[1])
    const unrelatedSettings = asRecord(noSettingsAction.ui)
    unrelatedSettings.intelligenceSettingsVisible = true
    unrelatedSettings.permissionSettingsVisible = true
    const interaction = asRecord(noSettingsAction.interaction)
    interaction.candidateFeatureIds = [
      ...arrayField(interaction, 'candidateFeatureIds'),
      'intelligence-extra'
    ]

    expect(() =>
      verifyPackagedAiEvidence(createVerificationInput({ failureMatrixReport: failure }))
    ).not.toThrow()
  })

  it('rejects Provider lifecycle and ledger fake greens', () => {
    const lifecycle = createProviderReport()
    asRecord(lifecycle.checks).credentialCanaryAbsent = false
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ providerReport: lifecycle })),
      'PROVIDER_REPORT_INVALID'
    )

    const cancellation = createProviderReport()
    asRecord(cancellation.checks).cancellationBackgroundTitleRequests = 2
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ providerReport: cancellation })),
      'PROVIDER_REPORT_INVALID'
    )

    const audit = createProviderReport()
    const auditChecks = asRecord(audit.checks)
    asRecord(auditChecks.audit).uniqueTraceCount = 3
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ providerReport: audit })),
      'PROVIDER_REPORT_INVALID'
    )

    const usage = createProviderReport()
    const usageChecks = asRecord(usage.checks)
    asRecord(usageChecks.usage).totalCost = 0.5
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ providerReport: usage })),
      'PROVIDER_REPORT_INVALID'
    )
  })

  it('binds all reports to one stable physical version and hash', () => {
    const provider = createProviderReport('e'.repeat(64))
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ providerReport: provider })),
      'EVIDENCE_IDENTITY_MISMATCH'
    )
    const liveMcp = createLiveMcpReport('f'.repeat(64))
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ liveMcpReport: liveMcp })),
      'EVIDENCE_IDENTITY_MISMATCH'
    )
    const privacyLifecycle = createPrivacyLifecycleReport('1'.repeat(64))
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({ privacyLifecycleReport: privacyLifecycle })
        ),
      'EVIDENCE_IDENTITY_MISMATCH'
    )
    expectCode(
      () =>
        verifyPackagedAiEvidence(
          createVerificationInput({
            physicalApp: {
              version: VERSION,
              bundleBasename: 'tuff.app',
              hashBefore: DEFAULT_HASH,
              hashAfter: 'f'.repeat(64)
            }
          })
        ),
      'APP_ASAR_CHANGED'
    )
  })

  it('requires exact report and screenshot digests', () => {
    const badReportDigest = createVerificationInput()
    badReportDigest.reports['tool-confirmation'].sha256 = 'not-a-digest'
    expectCode(() => verifyPackagedAiEvidence(badReportDigest), 'VERIFICATION_FAILED')

    const extraReportField = createVerificationInput()
    ;(extraReportField.reports['tool-confirmation'] as unknown as Record<string, unknown>).path =
      '/private/secret-canary'
    expectCode(() => verifyPackagedAiEvidence(extraReportField), 'VERIFICATION_FAILED')

    const extraScreenshotField = createVerificationInput()
    ;(extraScreenshotField.screenshots[0] as Record<string, unknown>).path =
      '/private/secret-canary'
    expectCode(() => verifyPackagedAiEvidence(extraScreenshotField), 'SCREENSHOT_INVALID')

    const reversedScreenshots = [...createVerificationInput().screenshots].reverse()
    expectCode(
      () => verifyPackagedAiEvidence(createVerificationInput({ screenshots: reversedScreenshots })),
      'SCREENSHOT_INVALID'
    )

    const duplicateScreenshots = createVerificationInput().screenshots.map((screenshot) => ({
      ...screenshot
    }))
    duplicateScreenshots[1].sha256 = duplicateScreenshots[0].sha256
    expectCode(
      () =>
        verifyPackagedAiEvidence(createVerificationInput({ screenshots: duplicateScreenshots })),
      'SCREENSHOT_INVALID'
    )
  })

  it('validates a physical bundle and writes an atomic sanitized CLI manifest', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const output = path.join(root, 'output', 'manifest.json')

    const stdout = execFileSync(process.execPath, createCliArguments(appBundle, evidence, output), {
      cwd: coreAppRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const manifest = JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>
    expect(manifest).toMatchObject({ ok: true, app: { version: VERSION, hash } })
    expect(JSON.parse(stdout)).toEqual(manifest)
    expect(stdout).not.toContain(root)
    expect(readdirSync(path.dirname(output))).toEqual(['manifest.json'])
  })

  it('rejects an app.asar that is only arbitrary non-empty bytes', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root, {
      rawAsar: Buffer.from('not an asar archive')
    })
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(root, 'manifest.json')
        }),
      'APP_ASAR_INVALID'
    )
  })

  it('rejects a parseable app.asar whose packed data is truncated', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const appAsar = path.join(appBundle, 'Contents', 'Resources', 'app.asar')
    const truncatedAsar = readFileSync(appAsar).subarray(0, -1)
    writeFileSync(appAsar, truncatedAsar)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(root, 'manifest.json')
        }),
      'APP_ASAR_INVALID'
    )
  })

  it('rejects an app.asar missing any required main-process entry', async () => {
    const requiredEntries = [
      'package.json',
      'out/main/index.js',
      'out/main/privacy-lifecycle-smoke.js',
      'out/main/live-mcp-smoke.js'
    ]
    for (const missingEntry of requiredEntries) {
      const root = createTempRoot()
      const appBundle = await createPackagedApp(root, { omitAsarEntry: missingEntry })
      const hash = hashPackagedApp(appBundle)
      const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)

      expectCode(
        () =>
          runPackagedAiEvidenceVerification({
            appBundle,
            ...evidence,
            output: path.join(root, 'manifest.json')
          }),
        'APP_ASAR_INVALID'
      )
    }
  })

  it('rejects app.asar package version drift from Info.plist', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root, { asarVersion: '9.9.9' })
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(root, 'manifest.json')
        }),
      'APP_VERSION_INVALID'
    )
  })

  it('rejects symlinked bundle, Info.plist, executable, and app.asar leaves', async () => {
    const cases = [
      {
        name: 'bundle',
        code: 'APP_BUNDLE_INVALID' as const,
        leaf: (appBundle: string) => appBundle,
        type: 'dir' as const
      },
      {
        name: 'Info.plist',
        code: 'APP_VERSION_INVALID' as const,
        leaf: (appBundle: string) => path.join(appBundle, 'Contents', 'Info.plist'),
        type: 'file' as const
      },
      {
        name: 'executable',
        code: 'APP_EXECUTABLE_INVALID' as const,
        leaf: (appBundle: string) => path.join(appBundle, 'Contents', 'MacOS', 'tuff'),
        type: 'file' as const
      },
      {
        name: 'app.asar',
        code: 'APP_ASAR_INVALID' as const,
        leaf: (appBundle: string) => path.join(appBundle, 'Contents', 'Resources', 'app.asar'),
        type: 'file' as const
      }
    ]

    for (const fixture of cases) {
      const root = createTempRoot()
      const appBundle = await createPackagedApp(root)
      const hash = hashPackagedApp(appBundle)
      const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
      const leaf = fixture.leaf(appBundle)
      const target = path.join(root, `real-${fixture.name.replace('.', '-')}`)
      renameSync(leaf, target)
      symlinkSync(target, leaf, fixture.type)

      expectCode(
        () =>
          runPackagedAiEvidenceVerification({
            appBundle,
            ...evidence,
            output: path.join(root, 'manifest.json')
          }),
        fixture.code
      )
    }
  })

  it('rejects a PNG signature followed by undecodable junk', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    writeFileSync(
      path.join(path.dirname(evidence.toolReport), 'deny-confirmation.png'),
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(80, 0x61)
      ])
    )

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(root, 'manifest.json')
        }),
      'SCREENSHOT_INVALID'
    )
  })

  it('rejects reused screenshot bytes across scenarios', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const toolDirectory = path.dirname(evidence.toolReport)
    writeFileSync(
      path.join(toolDirectory, 'allow-confirmation.png'),
      readFileSync(path.join(toolDirectory, 'deny-confirmation.png'))
    )

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(root, 'manifest.json')
        }),
      'SCREENSHOT_INVALID'
    )
  })

  it('refuses output targets that can overwrite the bundle or verified evidence', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const appAsar = path.join(appBundle, 'Contents', 'Resources', 'app.asar')
    const asarBytes = readFileSync(appAsar)

    const cliResult = spawnSync(
      process.execPath,
      createCliArguments(appBundle, evidence, appAsar),
      {
        cwd: coreAppRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    expect(cliResult.status).toBe(1)
    expect(cliResult.stdout).toBe('')
    expect(JSON.parse(cliResult.stderr)).toMatchObject({
      ok: false,
      code: 'OUTPUT_WRITE_FAILED'
    })
    expect(readFileSync(appAsar)).toEqual(asarBytes)

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: evidence.providerReport
        }),
      'OUTPUT_WRITE_FAILED'
    )
    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(appBundle, 'Contents', 'Resources', 'new-manifest.json')
        }),
      'OUTPUT_WRITE_FAILED'
    )
  })

  it('runs the CLI through a symlinked script entry', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const scriptAlias = path.join(root, 'verifier-alias.ts')
    const output = path.join(root, 'manifest.json')
    symlinkSync(scriptPath, scriptAlias)

    const stdout = execFileSync(
      process.execPath,
      createCliArguments(appBundle, evidence, output, scriptAlias),
      { cwd: coreAppRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, app: { version: VERSION, hash } })
    expect(existsSync(output)).toBe(true)
  })

  it('stays inert when imported with a missing unrelated argv entry', () => {
    const root = createTempRoot()
    const missingEntry = path.join(root, 'missing-importer.ts')
    const source = `process.argv[1] = ${JSON.stringify(missingEntry)}; await import(${JSON.stringify(pathToFileURL(scriptPath).href)})`

    const result = spawnSync(
      process.execPath,
      ['--no-deprecation', '--import', 'tsx', '--input-type=module', '--eval', source],
      {
        cwd: coreAppRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe('')
  })

  it('rejects a screenshot symlink before reading its target', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const toolDir = path.dirname(evidence.toolReport)
    const original = path.join(toolDir, 'deny-confirmation.png')
    const target = path.join(root, 'outside.png')
    writeFileSync(target, readFileSync(original))
    rmSync(original)
    symlinkSync(target, original)

    expectCode(
      () =>
        runPackagedAiEvidenceVerification({
          appBundle,
          ...evidence,
          output: path.join(root, 'manifest.json')
        }),
      'SCREENSHOT_INVALID'
    )
  })

  it('rejects a screenshot replaced by a symlink after its path snapshot', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const outside = path.join(root, 'outside.png')
    writeFileSync(
      outside,
      readFileSync(path.join(path.dirname(evidence.toolReport), 'deny-confirmation.png'))
    )
    let replaced = false

    expectCode(
      () =>
        runPackagedAiEvidenceVerification(
          {
            appBundle,
            ...evidence,
            output: path.join(root, 'manifest.json')
          },
          CHECKED_AT,
          {
            afterScreenshotPathSnapshot(filePath, scenario) {
              if (scenario !== 'deny' || replaced) return
              replaced = true
              rmSync(filePath)
              symlinkSync(outside, filePath)
            }
          }
        ),
      'SCREENSHOT_INVALID'
    )
    expect(replaced).toBe(true)
  })

  it('rejects a report replaced by a symlink after its path snapshot', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const outside = path.join(root, 'outside-tool-report.json')
    writeJson(outside, createToolReport(hash))
    let replaced = false

    expectCode(
      () =>
        runPackagedAiEvidenceVerification(
          {
            appBundle,
            ...evidence,
            output: path.join(root, 'manifest.json')
          },
          CHECKED_AT,
          {
            afterReportPathSnapshot(filePath, kind) {
              if (kind !== 'tool-confirmation' || replaced) return
              replaced = true
              rmSync(filePath)
              symlinkSync(outside, filePath)
            }
          }
        ),
      'TOOL_REPORT_READ_FAILED'
    )
    expect(replaced).toBe(true)
  })

  it('rejects a live MCP report replaced by a symlink after its path snapshot', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const outside = path.join(root, 'outside-live-mcp-report.json')
    writeJson(outside, createLiveMcpReport(hash))
    let replaced = false

    expectCode(
      () =>
        runPackagedAiEvidenceVerification(
          {
            appBundle,
            ...evidence,
            output: path.join(root, 'manifest.json')
          },
          CHECKED_AT,
          {
            afterReportPathSnapshot(filePath, kind) {
              if (kind !== 'live-mcp' || replaced) return
              replaced = true
              rmSync(filePath)
              symlinkSync(outside, filePath)
            }
          }
        ),
      'LIVE_MCP_REPORT_READ_FAILED'
    )
    expect(replaced).toBe(true)
  })

  it('rejects a report directory replaced by a symlink before screenshot reads', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const toolDirectory = realpathSync(path.dirname(evidence.toolReport))
    const movedToolDirectory = path.join(path.dirname(toolDirectory), 'tool-original')
    const outsideDirectory = path.join(root, 'outside-screenshots')
    mkdirSync(outsideDirectory)
    for (const [, screenshotBasename] of TOOL_SCREENSHOTS) {
      writeFileSync(
        path.join(outsideDirectory, screenshotBasename),
        readFileSync(path.join(toolDirectory, screenshotBasename))
      )
    }
    let replaced = false

    expectCode(
      () =>
        runPackagedAiEvidenceVerification(
          {
            appBundle,
            ...evidence,
            output: path.join(root, 'manifest.json')
          },
          CHECKED_AT,
          {
            beforeScreenshotDirectoryValidation(directoryPath) {
              replaced = true
              renameSync(directoryPath, movedToolDirectory)
              symlinkSync(outsideDirectory, directoryPath, 'dir')
            }
          }
        ),
      'SCREENSHOT_INVALID'
    )
    expect(replaced).toBe(true)
  })

  it('rolls back a published manifest when app.asar bytes change', async () => {
    const { appBundle, output, expectedOutputTarget, manifest } =
      await createAtomicWriteFixture(createTempRoot())
    const appAsar = path.join(appBundle, 'Contents', 'Resources', 'app.asar')

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle),
          {
            afterOutputPublished() {
              writeFileSync(
                appAsar,
                Buffer.concat([readFileSync(appAsar), Buffer.from('post-publish mutation')])
              )
            }
          }
        ),
      'APP_ASAR_CHANGED'
    )
    expect(existsSync(output)).toBe(false)
    expect(readdirSync(path.dirname(output))).toEqual([])
  })

  it('rolls back a published manifest when Info.plist version changes', async () => {
    const { appBundle, output, expectedOutputTarget, manifest } =
      await createAtomicWriteFixture(createTempRoot())
    const infoPlist = path.join(appBundle, 'Contents', 'Info.plist')

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle),
          {
            afterOutputPublished() {
              writeFileSync(
                infoPlist,
                readFileSync(infoPlist, 'utf8').replace(VERSION, '9.9.9'),
                'utf8'
              )
            }
          }
        ),
      'APP_VERSION_INVALID'
    )
    expect(existsSync(output)).toBe(false)
    expect(readdirSync(path.dirname(output))).toEqual([])
  })

  it('rolls back a published manifest when app.asar is replaced by a symlink', async () => {
    const { appBundle, output, expectedOutputTarget, manifest } =
      await createAtomicWriteFixture(createTempRoot())
    const appAsar = path.join(appBundle, 'Contents', 'Resources', 'app.asar')
    const movedAsar = path.join(path.dirname(appAsar), 'app-original.asar')

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle),
          {
            afterOutputPublished() {
              renameSync(appAsar, movedAsar)
              symlinkSync(movedAsar, appAsar)
            }
          }
        ),
      'APP_ASAR_CHANGED'
    )
    expect(existsSync(output)).toBe(false)
    expect(readdirSync(path.dirname(output))).toEqual([])
  })

  it('rolls back the published manifest when a post-publish step fails', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const output = path.join(root, 'output', 'manifest.json')
    mkdirSync(path.dirname(output))
    const manifest = runPackagedAiEvidenceVerification(
      { appBundle, ...evidence, output },
      CHECKED_AT
    )
    const expectedOutputTarget = path.join(
      realpathSync(path.dirname(output)),
      path.basename(output)
    )
    let published = false

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle),
          {
            afterOutputPublished() {
              published = true
              throw new Error('injected post-publish failure')
            }
          }
        ),
      'OUTPUT_WRITE_FAILED'
    )
    expect(published).toBe(true)
    expect(existsSync(output)).toBe(false)
    expect(readdirSync(path.dirname(output))).toEqual([])
  })

  it('recovers a renamed output directory before rolling back a published manifest', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const outputDirectory = path.join(root, 'output')
    const movedOutputDirectory = path.join(root, 'output-published')
    const output = path.join(outputDirectory, 'manifest.json')
    mkdirSync(outputDirectory)
    const manifest = runPackagedAiEvidenceVerification(
      { appBundle, ...evidence, output },
      CHECKED_AT
    )
    const expectedOutputTarget = path.join(realpathSync(outputDirectory), path.basename(output))
    let replaced = false

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle),
          {
            afterOutputPublished(outputPath) {
              replaced = true
              renameSync(path.dirname(outputPath), movedOutputDirectory)
              symlinkSync(appBundle, path.dirname(outputPath), 'dir')
              throw new Error('injected renamed-directory failure')
            }
          }
        ),
      'OUTPUT_WRITE_FAILED'
    )
    expect(replaced).toBe(true)
    expect(existsSync(path.join(appBundle, 'manifest.json'))).toBe(false)
    expect(readdirSync(movedOutputDirectory)).toEqual([])
  })

  it('rejects a pre-mkdir output retarget without touching the app bundle', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const outputRoot = path.join(root, 'output')
    const nestedDirectoryName = 'must-not-be-created'
    const output = path.join(outputRoot, nestedDirectoryName, 'manifest.json')
    const expectedOutputTarget = path.join(
      realpathSync(root),
      'output',
      nestedDirectoryName,
      'manifest.json'
    )
    const manifest = runPackagedAiEvidenceVerification(
      { appBundle, ...evidence, output },
      CHECKED_AT
    )
    symlinkSync(appBundle, outputRoot, 'dir')

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle)
        ),
      'OUTPUT_WRITE_FAILED'
    )
    expect(existsSync(path.join(appBundle, nestedDirectoryName))).toBe(false)
  })

  it('rejects an output directory retargeted into the app bundle', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const outputDirectory = path.join(root, 'output')
    const movedOutputDirectory = path.join(root, 'output-original')
    const output = path.join(outputDirectory, 'manifest.json')
    mkdirSync(outputDirectory)
    const manifest = runPackagedAiEvidenceVerification(
      { appBundle, ...evidence, output },
      CHECKED_AT
    )
    const expectedOutputTarget = path.join(realpathSync(outputDirectory), path.basename(output))
    let replaced = false

    expectCode(
      () =>
        writePackagedAiEvidenceOutputAtomic(
          output,
          JSON.stringify(manifest),
          expectedOutputTarget,
          realpathSync(appBundle),
          {
            afterOutputDirectorySnapshot(directoryPath) {
              replaced = true
              renameSync(directoryPath, movedOutputDirectory)
              symlinkSync(appBundle, directoryPath, 'dir')
            }
          }
        ),
      'OUTPUT_WRITE_FAILED'
    )
    expect(replaced).toBe(true)
    expect(existsSync(path.join(appBundle, 'manifest.json'))).toBe(false)
    expect(readdirSync(movedOutputDirectory)).toEqual([])
  })

  it('returns only a stable code when CLI input contains a sensitive path', async () => {
    const root = createTempRoot()
    const appBundle = await createPackagedApp(root)
    const hash = hashPackagedApp(appBundle)
    const evidence = await createFilesystemEvidence(path.join(root, 'evidence'), hash)
    const canary = path.join(root, 'private-secret-canary')
    const invalidTool = createToolReport(hash)
    invalidTool.unexpectedPath = canary
    writeJson(evidence.toolReport, invalidTool)
    const output = path.join(root, 'manifest.json')

    const result = spawnSync(process.execPath, createCliArguments(appBundle, evidence, output), {
      cwd: coreAppRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toEqual({
      schema: PACKAGED_AI_EVIDENCE_VERIFICATION_SCHEMA,
      ok: false,
      code: 'TOOL_REPORT_INVALID'
    })
    expect(result.stderr).not.toContain(canary)
    expect(result.stderr).not.toContain(root)
    expect(existsSync(output)).toBe(false)
  })
})
