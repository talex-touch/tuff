import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ACCEPTANCE_PROVIDER_BASE_URL,
  ACCEPTANCE_PROVIDER_ID,
  ACCEPTANCE_PROVIDER_TYPE,
  buildPackagedProviderLaunchEnv,
  buildSeedIntelligenceConfig,
  CANCELLATION_LEDGER_OBSERVATION_MS,
  credentialCanaryAbsent,
  hashFile,
  inspectSecureStoreDocument,
  INTELLIGENCE_AUDIT_FLUSH_INTERVAL_MS,
  isVisibleConversationTitle,
  isLoopbackOllamaBaseUrl,
  isProtectedInstalledAppPath,
  isRunnerCreatedProfileCleanupTarget,
  ledgerSnapshotsEqual,
  projectAcceptanceFailure,
  PROVIDER_ACCEPTANCE_SCHEMA,
  readAppBundleVersion,
  summarizeAuditRows,
  summarizeCancellationLedger,
  summarizeUsageDelta,
  waitForLedgerQuietSnapshot,
  type AuditRowLike,
  type UsageRowLike
} from './coreapp-packaged-ai-provider-acceptance'

describe('packaged AI provider acceptance contracts', () => {
  it('binds reports to a versioned schema and SHA-256 artifact identity', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-provider-report-test-'))
    try {
      await mkdir(path.join(root, 'Contents'), { recursive: true })
      const appAsar = path.join(root, 'app.asar')
      await writeFile(appAsar, 'packaged-artifact')
      await writeFile(
        path.join(root, 'Contents', 'Info.plist'),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>9.8.7</string></dict></plist>`
      )

      expect(PROVIDER_ACCEPTANCE_SCHEMA).toBe('tuff.packaged-ai-provider-acceptance.v1')
      await expect(readAppBundleVersion(root)).resolves.toBe('9.8.7')
      await expect(hashFile(appAsar)).resolves.toBe(
        '73d938071f26af7610c1b9f045c7522c3c0c489d2a09adaec98173d347154d9b'
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('accepts only the fixed loopback Ollama endpoint', () => {
    expect(isLoopbackOllamaBaseUrl(ACCEPTANCE_PROVIDER_BASE_URL)).toBe(true)
    expect(isLoopbackOllamaBaseUrl('http://localhost:11434/v1')).toBe(false)
    expect(isLoopbackOllamaBaseUrl('https://127.0.0.1:11434/v1')).toBe(false)
    expect(isLoopbackOllamaBaseUrl('http://127.0.0.1:11435/v1')).toBe(false)
    expect(isLoopbackOllamaBaseUrl('http://127.0.0.1:11434/v1?token=secret')).toBe(false)
    expect(isLoopbackOllamaBaseUrl('http://192.168.2.1:11434/v1')).toBe(false)
  })

  it('seeds one metadata-only provider with an explicit text.chat binding', () => {
    const config = buildSeedIntelligenceConfig() as {
      providers: Array<Record<string, unknown>>
      globalConfig: Record<string, unknown>
      capabilities: Record<string, { providers: Array<Record<string, unknown>> }>
    }
    const provider = config.providers[0]

    expect(config.providers).toHaveLength(1)
    expect(provider).toMatchObject({
      id: ACCEPTANCE_PROVIDER_ID,
      type: 'custom',
      enabled: true,
      baseUrl: ACCEPTANCE_PROVIDER_BASE_URL,
      capabilities: ['text.chat']
    })
    expect(provider).not.toHaveProperty('apiKey')
    expect(provider).not.toHaveProperty('authRef')
    expect(provider).not.toHaveProperty('hasCredential')
    expect(config.globalConfig).toMatchObject({
      enableAudit: true,
      enableCache: false,
      enableQuota: true
    })
    expect(config.capabilities['text.chat']?.providers).toEqual([
      { providerId: ACCEPTANCE_PROVIDER_ID, priority: 1, enabled: true }
    ])
  })

  it('recognizes only the expected local-secret envelope metadata', () => {
    const key = 'provider.acceptance.api-key'
    const valid = JSON.stringify({
      [key]: JSON.stringify({
        v: 1,
        backend: 'local-secret',
        alg: 'A256GCM',
        kid: 'redacted',
        n: 'redacted',
        c: 'redacted',
        t: 'redacted'
      })
    })

    expect(inspectSecureStoreDocument(valid, key)).toEqual({
      keyPresent: true,
      envelopeValid: true
    })
    expect(
      inspectSecureStoreDocument(
        JSON.stringify({
          [key]: JSON.stringify({ v: 1, backend: 'safe-storage', alg: 'A256GCM' })
        }),
        key
      )
    ).toEqual({ keyPresent: true, envelopeValid: false })
    expect(inspectSecureStoreDocument('{}', key)).toEqual({
      keyPresent: false,
      envelopeValid: false
    })
  })

  it('projects unknown failures without retaining raw secrets or paths', () => {
    const projection = projectAcceptanceFailure(
      new Error('credential=top-secret at /Users/example/private/profile'),
      'credential-save'
    )

    expect(projection).toEqual({
      stage: 'credential-save',
      code: 'ACCEPTANCE_STEP_FAILED'
    })
    expect(JSON.stringify(projection)).not.toContain('top-secret')
    expect(JSON.stringify(projection)).not.toContain('/Users/example')
  })

  it('requires an exact successful audit window with unique traces and valid cost', () => {
    const startedAt = 1_000
    const row = (id: number, overrides: Partial<AuditRowLike> = {}): AuditRowLike => ({
      id,
      trace_id: `trace-${id}`,
      timestamp: startedAt + id,
      capability_id: 'text.chat',
      provider: ACCEPTANCE_PROVIDER_ID,
      model: 'smollm2:135m',
      caller: null,
      prompt_tokens: 3,
      completion_tokens: 2,
      total_tokens: 5,
      estimated_cost: 0,
      latency: 10,
      success: 1,
      metadata: JSON.stringify({ operation: 'home-conversation' }),
      ...overrides
    })
    const passing = summarizeAuditRows(
      [
        row(1, { id: 5, timestamp: 999, estimated_cost: 1 }),
        row(11),
        row(12, {
          prompt_tokens: 4,
          completion_tokens: 3,
          total_tokens: 7,
          success: true,
          metadata: JSON.stringify({ operation: 'conversation-title' })
        }),
        row(13, { capability_id: 'image.caption', provider: 'another-provider', prompt_tokens: -1 })
      ],
      {
        minIdExclusive: 10,
        startedAt,
        expectedHomeConversationRequests: 1,
        expectedConversationTitleRequests: 1
      }
    )

    expect(passing).toMatchObject({
      matched: 2,
      success: 2,
      failure: 0,
      promptTokens: 7,
      completionTokens: 5,
      totalTokens: 12,
      estimatedCost: 0,
      uniqueTraceCount: 2,
      invalidIdentityRows: 0,
      invalidNumericRows: 0,
      invalidOperationRows: 0,
      homeConversationRequests: 1,
      conversationTitleRequests: 1,
      passed: true
    })

    const expectation = {
      minIdExclusive: 10,
      startedAt,
      expectedHomeConversationRequests: 1,
      expectedConversationTitleRequests: 1
    }
    const titleRow = (id: number, overrides: Partial<AuditRowLike> = {}): AuditRowLike =>
      row(id, {
        metadata: JSON.stringify({ operation: 'conversation-title' }),
        ...overrides
      })
    expect(
      summarizeAuditRows([row(11), titleRow(12, { estimated_cost: 0.001 })], expectation)
    ).toMatchObject({ estimatedCost: 0.001, passed: true })
    expect(
      summarizeAuditRows(
        [
          row(11),
          titleRow(12, { estimated_cost: 0.001 }),
          row(13),
          titleRow(14, { estimated_cost: 0.001 })
        ],
        {
          ...expectation,
          expectedHomeConversationRequests: 2,
          expectedConversationTitleRequests: 2
        }
      )
    ).toMatchObject({
      matched: 4,
      homeConversationRequests: 2,
      conversationTitleRequests: 2,
      estimatedCost: 0.002,
      passed: true
    })
    expect(summarizeAuditRows([row(11), titleRow(12, { success: 0 })], expectation)).toMatchObject({
      failure: 1,
      passed: false
    })
    expect(
      summarizeAuditRows([row(11), titleRow(12, { trace_id: 'trace-11' })], expectation)
    ).toMatchObject({ invalidIdentityRows: 1, passed: false })
    expect(
      summarizeAuditRows(
        [row(11, { provider: ACCEPTANCE_PROVIDER_TYPE }), titleRow(12)],
        expectation
      )
    ).toMatchObject({ invalidIdentityRows: 1, passed: false })
    expect(
      summarizeAuditRows(
        [row(11), titleRow(12, { provider: ACCEPTANCE_PROVIDER_TYPE })],
        expectation
      )
    ).toMatchObject({ invalidIdentityRows: 1, passed: false })
    expect(summarizeAuditRows([row(11), titleRow(12), row(13)], expectation)).toMatchObject({
      matched: 3,
      passed: false
    })
    expect(
      summarizeAuditRows([row(11, { total_tokens: 99 }), titleRow(12)], expectation)
    ).toMatchObject({ invalidNumericRows: 1, passed: false })
    expect(summarizeAuditRows([row(11), row(12)], expectation)).toMatchObject({
      homeConversationRequests: 2,
      conversationTitleRequests: 0,
      passed: false
    })
    expect(
      summarizeAuditRows([row(11), titleRow(12, { metadata: '{}' })], expectation)
    ).toMatchObject({ invalidOperationRows: 1, passed: false })

    for (const invalid of [null, undefined, '', '0', false, true, -0.001, Number.NaN]) {
      expect(
        summarizeAuditRows([row(11), titleRow(12, { estimated_cost: invalid })], expectation)
      ).toMatchObject({ invalidNumericRows: 1, passed: false })
    }
  })

  it('isolates HOME and removes inherited AI credentials from the packaged runtime', () => {
    const env = buildPackagedProviderLaunchEnv(
      {
        HOME: '/Users/example',
        PATH: '/usr/bin',
        ELECTRON_RUN_AS_NODE: '1',
        OPENAI_API_KEY: 'secret',
        CODEX_HOME: '/Users/example/.codex',
        HTTP_PROXY: 'http://credential-bearing-proxy'
      },
      {
        userDataDir: '/tmp/tuff-ai-provider-profile',
        homeDir: '/tmp/tuff-ai-provider-profile/home',
        codexHome: '/tmp/tuff-ai-provider-profile/codex-home',
        tempDir: '/tmp/tuff-ai-provider-profile/tmp',
        fileProviderRoot: '/tmp/tuff-ai-provider-profile/files',
        missingPiPath: '/tmp/tuff-ai-provider-profile/missing-pi',
        piAgentDir: '/tmp/tuff-ai-provider-profile/pi-agent'
      }
    )

    expect(env.HOME).toBe('/tmp/tuff-ai-provider-profile/home')
    expect(env.CODEX_HOME).toBe('/tmp/tuff-ai-provider-profile/codex-home')
    expect(env.TMPDIR).toBe('/tmp/tuff-ai-provider-profile/tmp')
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.HTTP_PROXY).toBeUndefined()
    expect(env.TUFF_STARTUP_BENCHMARK_ONCE).toBeUndefined()
    expect(env.TUFF_PACKAGED_ACCEPTANCE_ISOLATED).toBe('1')
    expect(env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR).toBe('/tmp/tuff-ai-provider-profile')
    expect(env.TUFF_FILE_PROVIDER_BASE_WATCH_PATHS).toBe('/tmp/tuff-ai-provider-profile/files')
    expect(env.TUFF_PI_CLI_PATH).toBe('/tmp/tuff-ai-provider-profile/missing-pi')
    expect(env.PI_CODING_AGENT_DIR).toBe('/tmp/tuff-ai-provider-profile/pi-agent')
    expect(env.TUFF_DISABLE_NATIVE_OCR).toBe('1')
  })

  it('matches day and month usage deltas exactly to the accepted audit window', () => {
    const audit = summarizeAuditRows(
      [
        {
          id: 2,
          trace_id: 'trace-2',
          timestamp: 2_000,
          capability_id: 'text.chat',
          provider: ACCEPTANCE_PROVIDER_ID,
          model: 'smollm2:135m',
          caller: null,
          prompt_tokens: 7,
          completion_tokens: 5,
          total_tokens: 12,
          estimated_cost: 0.004,
          latency: 10,
          success: 1,
          metadata: JSON.stringify({ operation: 'home-conversation' })
        }
      ],
      {
        minIdExclusive: 1,
        startedAt: 1_000,
        expectedHomeConversationRequests: 1,
        expectedConversationTitleRequests: 0
      }
    )
    const usage = (
      periodType: 'day' | 'month',
      values: Partial<UsageRowLike> = {}
    ): UsageRowLike => ({
      caller_id: 'system',
      caller_type: 'system',
      period: `${periodType}:2026-08${periodType === 'day' ? '-25' : ''}`,
      period_type: periodType,
      request_count: 1,
      success_count: 1,
      failure_count: 0,
      total_tokens: 12,
      prompt_tokens: 7,
      completion_tokens: 5,
      total_cost: 0.004,
      ...values
    })

    expect(summarizeUsageDelta([], [usage('day'), usage('month')], audit)).toMatchObject({
      dayRows: 1,
      monthRows: 1,
      requestCount: 1,
      totalCost: 0.004,
      passed: true
    })
    expect(
      summarizeUsageDelta([], [usage('day'), usage('month', { total_cost: 0.1 })], audit).passed
    ).toBe(false)
    expect(
      summarizeUsageDelta([], [usage('day', { total_cost: 0.1 }), usage('month')], audit).passed
    ).toBe(false)
    expect(
      summarizeUsageDelta([], [usage('day'), usage('month', { request_count: 2 })], audit).passed
    ).toBe(false)
    expect(
      summarizeUsageDelta([], [usage('day'), usage('month', { caller_type: 'plugin' })], audit)
    ).toMatchObject({ invalidRows: 1, passed: false })
    for (const invalid of [
      null,
      undefined,
      '',
      '0',
      false,
      true,
      -0.001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY
    ]) {
      expect(
        summarizeUsageDelta([], [usage('day'), usage('month', { total_cost: invalid })], audit)
      ).toMatchObject({ invalidRows: 1, passed: false })
    }
  })

  it('keeps cancelled Home calls out of the ledger while accounting for one title retry', () => {
    const startedAt = 1_000
    const titleCost = 0.00018
    const auditRow = (
      id: number,
      operation: 'home-conversation' | 'conversation-title'
    ): AuditRowLike => {
      const isTitle = operation === 'conversation-title'
      return {
        id,
        trace_id: `trace-${id}`,
        timestamp: startedAt + id,
        capability_id: 'text.chat',
        provider: ACCEPTANCE_PROVIDER_ID,
        model: 'smollm2:135m',
        caller: null,
        prompt_tokens: isTitle ? 4 : 0,
        completion_tokens: isTitle ? 2 : 0,
        total_tokens: isTitle ? 6 : 0,
        estimated_cost: isTitle ? titleCost : 0,
        latency: 10,
        success: 1,
        metadata: JSON.stringify({ operation })
      }
    }
    const usage = (
      periodType: 'day' | 'month',
      requestCount: number,
      titleRequests: number,
      overrides: Partial<UsageRowLike> = {}
    ): UsageRowLike => ({
      caller_id: 'system',
      caller_type: 'system',
      period: `${periodType}:2026-08${periodType === 'day' ? '-25' : ''}`,
      period_type: periodType,
      request_count: requestCount,
      success_count: requestCount,
      failure_count: 0,
      total_tokens: titleRequests * 6,
      prompt_tokens: titleRequests * 4,
      completion_tokens: titleRequests * 2,
      total_cost: titleRequests * titleCost,
      ...overrides
    })
    const completed = {
      auditRowCount: 4,
      auditMaxId: 14,
      usageRows: [usage('day', 4, 2), usage('month', 4, 2)]
    }
    const afterTitleRetry = {
      auditRowCount: 5,
      auditMaxId: 15,
      usageRows: [usage('day', 5, 3), usage('month', 5, 3)]
    }
    const expectation = {
      minIdExclusive: completed.auditMaxId,
      startedAt,
      expectedBackgroundTitleRequests: 1
    }

    expect(
      summarizeCancellationLedger(
        [auditRow(15, 'conversation-title')],
        completed,
        afterTitleRetry,
        expectation
      )
    ).toMatchObject({
      homeAuditUnchanged: true,
      backgroundTitleRequests: 1,
      passed: true
    })
    expect(
      summarizeCancellationLedger([], completed, completed, {
        ...expectation,
        expectedBackgroundTitleRequests: 0
      })
    ).toMatchObject({ homeAuditUnchanged: true, backgroundTitleRequests: 0, passed: true })
    expect(
      summarizeCancellationLedger(
        [auditRow(15, 'conversation-title'), auditRow(16, 'home-conversation')],
        completed,
        {
          auditRowCount: 6,
          auditMaxId: 16,
          usageRows: [usage('day', 6, 3), usage('month', 6, 3)]
        },
        expectation
      )
    ).toMatchObject({ homeAuditUnchanged: false, passed: false })
    expect(
      summarizeCancellationLedger(
        [auditRow(15, 'conversation-title'), auditRow(16, 'conversation-title')],
        completed,
        {
          auditRowCount: 6,
          auditMaxId: 16,
          usageRows: [usage('day', 6, 4), usage('month', 6, 4)]
        },
        expectation
      ).passed
    ).toBe(false)
    expect(
      summarizeCancellationLedger(
        [auditRow(15, 'conversation-title')],
        completed,
        {
          ...afterTitleRetry,
          usageRows: [usage('day', 5, 3), usage('month', 5, 3, { total_cost: 0.5 })]
        },
        expectation
      ).passed
    ).toBe(false)
  })

  it('compares cancellation ledger snapshots without depending on row order', () => {
    const day = {
      caller_id: 'system',
      caller_type: 'system',
      period: 'day:2026-08-25',
      period_type: 'day',
      request_count: 1,
      success_count: 1,
      failure_count: 0,
      total_tokens: 3,
      prompt_tokens: 2,
      completion_tokens: 1,
      total_cost: 0
    }
    const month = { ...day, period: 'month:2026-08', period_type: 'month' }

    expect(
      ledgerSnapshotsEqual(
        { auditRowCount: 1, auditMaxId: 7, usageRows: [day, month] },
        { auditRowCount: 1, auditMaxId: 7, usageRows: [month, day] }
      )
    ).toBe(true)
    expect(
      ledgerSnapshotsEqual(
        { auditRowCount: 1, auditMaxId: 7, usageRows: [day, month] },
        {
          auditRowCount: 2,
          auditMaxId: 8,
          usageRows: [{ ...day, request_count: 2, success_count: 2 }, month]
        }
      )
    ).toBe(false)
  })

  it('rejects installed application bundles but accepts workspace bundles', () => {
    expect(isProtectedInstalledAppPath('/Applications/Tuff.app', '/Users/example')).toBe(true)
    expect(
      isProtectedInstalledAppPath('/Users/example/Applications/Tuff.app', '/Users/example')
    ).toBe(true)
    expect(
      isProtectedInstalledAppPath(
        '/Users/example/Workspace/talex-touch/dist/tuff.app',
        '/Users/example'
      )
    ).toBe(false)
  })

  it('accepts the working title as the visible fail-soft title state', () => {
    const workingTitle = 'Explain why isolated software tests are useful.'

    expect(isVisibleConversationTitle(workingTitle)).toBe(true)
    expect(isVisibleConversationTitle(`  ${workingTitle}  `)).toBe(true)
    expect(isVisibleConversationTitle('Why isolated tests matter')).toBe(true)
    expect(isVisibleConversationTitle('')).toBe(false)
    expect(isVisibleConversationTitle(null)).toBe(false)
  })

  it('keeps caller-supplied profiles even when their path resembles a runner profile', () => {
    const generatedPath = path.join(tmpdir(), 'tuff-ai-provider-generated-id')

    expect(isRunnerCreatedProfileCleanupTarget(generatedPath, true)).toBe(true)
    expect(isRunnerCreatedProfileCleanupTarget(generatedPath, false)).toBe(false)
    expect(
      isRunnerCreatedProfileCleanupTarget(
        path.join(tmpdir(), 'nested', 'tuff-ai-provider-generated-id'),
        true
      )
    ).toBe(false)
    expect(
      isRunnerCreatedProfileCleanupTarget(path.join(tmpdir(), 'tuff-ai-provider-'), true)
    ).toBe(false)
    expect(
      isRunnerCreatedProfileCleanupTarget('/Users/example/tuff-ai-provider-generated-id', true)
    ).toBe(false)
  })

  it('observes cancellation for longer than a complete audit flush interval', () => {
    expect(CANCELLATION_LEDGER_OBSERVATION_MS).toBeGreaterThan(INTELLIGENCE_AUDIT_FLUSH_INTERVAL_MS)
  })

  it('rejects a ledger that never reaches the required quiet window', async () => {
    const snapshot = { auditRowCount: 1, auditMaxId: 1, usageRows: [] }

    await expect(
      waitForLedgerQuietSnapshot(async () => snapshot, {
        timeoutMs: 20,
        quietWindowMs: 100,
        pollIntervalMs: 1
      })
    ).rejects.toThrow('LEDGER_NOT_QUIET')
  })

  it('scans Chromium stores, logs and crash dumps for the credential canary with bounds', async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'tuff-provider-canary-test-'))
    try {
      const localStorage = path.join(profile, 'Local Storage', 'leveldb')
      const indexedDb = path.join(profile, 'IndexedDB', 'app.indexeddb.leveldb')
      const crashes = path.join(profile, 'tuff', 'logs', 'crashes')
      await mkdir(localStorage, { recursive: true })
      await mkdir(indexedDb, { recursive: true })
      await mkdir(crashes, { recursive: true })
      await writeFile(path.join(localStorage, '000003.log'), 'metadata-only', 'utf8')
      await writeFile(path.join(indexedDb, '000004.ldb'), 'metadata-only', 'utf8')
      await writeFile(path.join(crashes, 'crash.log'), 'metadata-only', 'utf8')

      await expect(credentialCanaryAbsent(profile, 'acceptance-canary')).resolves.toBe(true)
      await writeFile(path.join(indexedDb, '000004.ldb'), 'prefix acceptance-canary suffix', 'utf8')
      await expect(credentialCanaryAbsent(profile, 'acceptance-canary')).resolves.toBe(false)
      await expect(
        credentialCanaryAbsent(profile, 'missing-canary', { maxFiles: 1, maxBytes: 1024 })
      ).rejects.toThrow('CREDENTIAL_SCAN_BOUNDS_EXCEEDED')
    } finally {
      await rm(profile, { recursive: true, force: true })
    }
  })
})
