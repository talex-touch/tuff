import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import type { IndexedSourceDiagnosticsSnapshot } from '@talex-touch/utils/search'
import {
  buildArtifactPaths,
  buildLaunchFailure,
  buildPackagedAppLaunchEnv,
  buildProbeFailures,
  resolveIndexedSourceDetailTargetText,
  resolveProbeEvidencePolicy,
  seedRecentTaskEvidence,
  selectSettingsTarget,
  validateSeedRecentTaskEvidenceMode,
  validateRemoteDebuggingUrl,
  verifyFixtureRootBundlePreflight,
  type DevToolsTarget,
  type IndexingDiagnosticsMaintenanceAction,
  type IndexingDiagnosticsDomSnapshot
} from './coreapp-packaged-indexing-diagnostics-probe'
import { verifySettingsIndexingDiagnosticsEvidence } from './settings-indexing-diagnostics-verify'

function makeTarget(id: string, url: string, title = 'Tuff'): DevToolsTarget {
  return {
    id,
    title,
    type: 'page',
    url,
    webSocketDebuggerUrl: `ws://127.0.0.1/${id}`
  }
}

function makeDiagnostics(): IndexedSourceDiagnosticsSnapshot {
  return {
    generatedAt: 1700000001000,
    summary: {
      total: 1,
      byStatus: {
        ready: 1
      },
      ready: 1,
      degraded: 0,
      unavailable: 0
    },
    sources: [
      {
        descriptor: {
          id: 'file-provider',
          kind: 'file',
          displayName: 'File Index',
          platforms: ['darwin', 'win32', 'linux'],
          priority: 'deferred',
          storage: 'sqlite-index',
          privacy: 'medium',
          capabilities: {
            scan: true,
            watch: true,
            reconcile: true,
            reset: true,
            clear: true,
            open: true
          },
          admission: {
            owner: 'core',
            permissionScopes: ['file-system'],
            defaultState: 'enabled',
            clearable: true,
            rebuildable: true
          }
        },
        health: {
          status: 'ready',
          permissionState: 'granted',
          itemCount: 12,
          watchState: 'active',
          reconcileState: 'idle',
          lastIndexedAt: 1700000000000
        },
        roots: [{ sourceId: 'file-provider', path: '/tmp/a', permissionState: 'granted' }],
        recentTasks: [
          {
            kind: 'scan',
            status: 'failed',
            completedAt: 1700000000400,
            jobId: 'file-provider:scan:3',
            durationMs: 1234,
            trigger: 'manual',
            reason: 'manual-rebuild',
            attempt: 2,
            errorCode: 'SQLITE_BUSY',
            error: 'sqlite busy',
            summary: {
              batches: 2,
              records: 18,
              indexedRecords: 8,
              phase: 'store'
            }
          }
        ]
      }
    ]
  }
}

function makeResetDiagnostics(): IndexedSourceDiagnosticsSnapshot {
  const diagnostics = makeDiagnostics()
  diagnostics.sources[0].recentTasks = [
    {
      kind: 'reset',
      status: 'succeeded',
      completedAt: 1700000000400,
      jobId: 'file-provider:reset:1',
      durationMs: 0,
      trigger: 'user-clear',
      reason: 'user-clear',
      summary: {
        durationMs: 0,
        reason: 'user-clear',
        trigger: 'user-clear',
        clearedSearchIndex: false,
        clearedSearchIndexRows: 0,
        clearedScanProgress: false,
        scanProgressRows: 0
      }
    }
  ]
  return diagnostics
}

function makeDom(
  overrides: Partial<IndexingDiagnosticsDomSnapshot> = {}
): IndexingDiagnosticsDomSnapshot {
  return {
    href: 'app://tuff/#/setting?section=file-index',
    title: 'Tuff',
    readyState: 'complete',
    text: 'Search Source Diagnostics File Index Details Recent Scan failed',
    hasSettingsShell: true,
    hasSourceDiagnosticsGroup: true,
    sourceRows: [
      {
        title: 'File Index',
        description: 'File Index ready Details',
        hasDetailAction: true
      }
    ],
    dialog: {
      visible: true,
      title: 'File Index',
      text: 'Recent Scan failed indexed 8/18 duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:3',
      sections: ['Overview', 'Recent'],
      recentTaskText:
        'Recent Scan failed indexed 8/18 duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:3',
      hasRecentTasks: true
    },
    ...overrides
  }
}

describe('packaged indexing diagnostics probe helpers', () => {
  it('selects an interactive Settings target', () => {
    const selected = selectSettingsTarget([
      {
        target: makeTarget('overlay', 'app://tuff/renderer/index.html#/meta-overlay', 'CoreBox'),
        snapshot: {
          hasRouter: true,
          hasIpcInvoke: true,
          hasSettingsShell: false,
          text: 'CoreBox'
        }
      },
      {
        target: makeTarget('settings', 'app://tuff/renderer/index.html#/setting', 'Settings'),
        snapshot: {
          hasRouter: true,
          hasIpcInvoke: true,
          hasSettingsShell: true,
          text: 'App Settings'
        }
      }
    ])

    expect(selected?.id).toBe('settings')
  })

  it('builds stable artifact names for packaged evidence', () => {
    const paths = buildArtifactPaths({
      outputDir: '/tmp/r3-evidence',
      dateStamp: '2026-06-25'
    })

    expect(paths).toMatchObject({
      output: '/tmp/r3-evidence/indexing-diagnostics-probe-2026-06-25.json',
      diagnostics: '/tmp/r3-evidence/indexing-diagnostics-2026-06-25.json',
      verification: '/tmp/r3-evidence/indexing-diagnostics-verification-2026-06-25.json',
      settingsScreenshot: '/tmp/r3-evidence/indexing-diagnostics-settings-2026-06-25.png',
      detailScreenshot: '/tmp/r3-evidence/indexing-diagnostics-source-detail-2026-06-25.png'
    })
  })

  it('marks attach-only evidence as read-only and isolated launches as controlled', () => {
    expect(
      resolveProbeEvidencePolicy({
        attachOnly: true,
        remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list'
      })
    ).toEqual({
      mode: 'attach-only',
      profileMutationPolicy: 'read-only'
    })
    expect(
      resolveProbeEvidencePolicy({
        remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list'
      })
    ).toEqual({
      mode: 'attach-only',
      profileMutationPolicy: 'read-only'
    })
    expect(resolveProbeEvidencePolicy({})).toEqual({
      mode: 'isolated-launch',
      profileMutationPolicy: 'isolated-controlled'
    })
  })

  it('builds low-sensitive launch failure envelopes for cold-start blockers', () => {
    const failure = buildLaunchFailure({
      phase: 'wait-for-cdp',
      message: 'Timed out waiting for CDP endpoint http://127.0.0.1:9581/json/list: fetch failed',
      remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list',
      attachOnly: false,
      childSnapshot: {
        childPid: 123,
        exitCode: null,
        signalCode: 'SIGABRT'
      }
    })

    expect(failure).toEqual({
      phase: 'wait-for-cdp',
      message: 'Timed out waiting for CDP endpoint http://127.0.0.1:9581/json/list: fetch failed',
      remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list',
      attachOnly: false,
      childPid: 123,
      exitCode: null,
      signalCode: 'SIGABRT'
    })
    expect(JSON.stringify(failure)).not.toContain('stderrTail')
    expect(JSON.stringify(failure)).not.toContain('stdoutTail')
  })

  it('selects the requested source row instead of the first details action', () => {
    expect(
      resolveIndexedSourceDetailTargetText('file-provider', [
        {
          text: 'Browser Bookmarks 官方运行时 已关闭 详情',
          hasDetailAction: true
        },
        {
          text: 'Applications 合同问题：open-capability-missing-handler 详情',
          hasDetailAction: true
        },
        {
          text: 'File Index 合同问题：open-capability-missing-handler 详情',
          hasDetailAction: true
        }
      ])
    ).toBe('File Index 合同问题：open-capability-missing-handler 详情')
  })

  it('rejects seeded evidence in attach-only mode', () => {
    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        attachOnly: true,
        seedRecentTaskEvidence: false
      })
    ).toThrow('--attachOnly requires --remoteDebuggingUrl')

    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        attachOnly: true,
        remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list',
        seedRecentTaskEvidence: true
      })
    ).toThrow('--seedRecentTaskEvidence is only allowed with isolated launch mode')
  })

  it('requires attach-only CDP endpoints to be loopback URLs', () => {
    expect(() => validateRemoteDebuggingUrl('http://127.0.0.1:9581/json/list')).not.toThrow()
    expect(() => validateRemoteDebuggingUrl('http://localhost:9581/json/list')).not.toThrow()
    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        remoteDebuggingUrl: 'http://192.168.2.1:9581/json/list',
        seedRecentTaskEvidence: false
      })
    ).toThrow('--remoteDebuggingUrl must point at a loopback CDP endpoint')
  })

  it('rejects maintenance actions in attach-only or seeded mode', () => {
    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list',
        seedRecentTaskEvidence: false,
        runMaintenanceAction: 'reset'
      })
    ).toThrow('--runMaintenanceAction is only allowed with isolated launch mode')

    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        seedRecentTaskEvidence: true,
        runMaintenanceAction: 'reset'
      })
    ).toThrow('--seedRecentTaskEvidence cannot be combined with --runMaintenanceAction')
  })

  it('rejects fixture roots outside isolated maintenance evidence mode', () => {
    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        remoteDebuggingUrl: 'http://127.0.0.1:9581/json/list',
        seedRecentTaskEvidence: false,
        fixtureRoot: '/tmp/tuff-r3-fixture',
        runMaintenanceAction: 'scan'
      })
    ).toThrow('--fixtureRoot is only allowed with isolated launch mode')

    expect(() =>
      validateSeedRecentTaskEvidenceMode({
        seedRecentTaskEvidence: false,
        fixtureRoot: '/tmp/tuff-r3-fixture'
      })
    ).toThrow('--fixtureRoot requires --runMaintenanceAction')
  })

  it('types supported isolated maintenance action values', () => {
    const action: IndexingDiagnosticsMaintenanceAction = 'reset'
    expect(['scan', 'reconcile', 'reset']).toContain(action)
  })

  it('preflights fixture-root capable packaged bundles before maintenance evidence', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'indexing-diagnostics-bundle-'))
    try {
      const appBundle = path.join(dir, 'tuff.app')
      const resourcesDir = path.join(appBundle, 'Contents', 'Resources')
      mkdirSync(resourcesDir, { recursive: true })
      writeFileSync(
        path.join(resourcesDir, 'app.asar'),
        'const env = "TUFF_FILE_PROVIDER_BASE_WATCH_PATHS"'
      )

      await expect(verifyFixtureRootBundlePreflight(appBundle)).resolves.toMatchObject({
        marker: 'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS',
        passed: true
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails fixture-root preflight for stale packaged bundles', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'indexing-diagnostics-stale-bundle-'))
    try {
      const appBundle = path.join(dir, 'tuff.app')
      const resourcesDir = path.join(appBundle, 'Contents', 'Resources')
      mkdirSync(resourcesDir, { recursive: true })
      writeFileSync(path.join(resourcesDir, 'app.asar'), 'const env = "HOME"')

      await expect(verifyFixtureRootBundlePreflight(appBundle)).resolves.toMatchObject({
        marker: 'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS',
        passed: false,
        reason: expect.stringContaining('rebuild the bundle')
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('seeds low-sensitive recent task evidence into isolated userData', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'indexing-diagnostics-seed-'))
    try {
      const dbPath = await seedRecentTaskEvidence(dir, 'file-provider', 1_700_000_005_000)
      const client = createClient({ url: `file:${dbPath}` })
      try {
        const rows = await client.execute({
          sql: 'SELECT state_json AS stateJson FROM indexed_source_task_state WHERE source_id = ?',
          args: ['file-provider']
        })
        const state = JSON.parse(String(rows.rows[0].stateJson))
        const diagnostics = makeDiagnostics()
        diagnostics.sources[0].recentTasks = state.recentTasks

        const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
          sourceId: 'file-provider'
        })
        expect(verification.gate).toMatchObject({
          passed: true,
          failures: []
        })
        expect(verification.sources[0].visibleAuditFields).toMatchObject({
          duration: true,
          trigger: true,
          reason: true,
          attempt: true,
          errorCode: true
        })
      } finally {
        client.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('builds isolated launch env with single-instance bypass and fixture roots', () => {
    const fixtureRoot = path.resolve('/tmp/tuff-r3-fixture')
    const previousEnv = {
      ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
      NODE_PATH: process.env.NODE_PATH,
      PATH: process.env.PATH,
      npm_command: process.env.npm_command,
      PNPM_PACKAGE_NAME: process.env.PNPM_PACKAGE_NAME,
      TSX_TSCONFIG_PATH: process.env.TSX_TSCONFIG_PATH
    }
    process.env.NODE_PATH = '/tmp/tsx-node-path'
    process.env.NODE_OPTIONS = '--import tsx'
    process.env.ELECTRON_RUN_AS_NODE = '1'
    process.env.PATH = [
      './node_modules/.bin',
      '/workspace/node_modules/.bin',
      '/opt/homebrew/bin',
      '/usr/bin'
    ].join(path.delimiter)
    process.env.npm_command = 'exec'
    process.env.PNPM_PACKAGE_NAME = '@talex-touch/core-app'
    process.env.TSX_TSCONFIG_PATH = '/tmp/tsconfig.json'
    try {
      const env = buildPackagedAppLaunchEnv({
        userDataDir: '/tmp/tuff-r3-user-data',
        fixtureRoot
      })

      expect(env.FORCE_COLOR).toBe('0')
      expect(env.TUFF_STARTUP_BENCHMARK_ONCE).toBe('1')
      expect(env.TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS).toBe('120000')
      expect(env.TUFF_STARTUP_BENCHMARK_USER_DATA_DIR).toBe('/tmp/tuff-r3-user-data')
      expect(env.HOME).toBe(fixtureRoot)
      expect(env.TUFF_FILE_PROVIDER_BASE_WATCH_PATHS).toBe(fixtureRoot)
      expect(env.PATH).toBe(['/opt/homebrew/bin', '/usr/bin'].join(path.delimiter))
      expect(env.NODE_PATH).toBeUndefined()
      expect(env.NODE_OPTIONS).toBeUndefined()
      expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
      expect(env.npm_command).toBeUndefined()
      expect(env.PNPM_PACKAGE_NAME).toBeUndefined()
      expect(env.TSX_TSCONFIG_PATH).toBeUndefined()
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it('passes when diagnostics, verifier, DOM, and screenshots are present', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom: makeDom(),
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([])
  })

  it('fails fixture evidence when source roots escape the fixture root', () => {
    const fixtureRoot = path.resolve('/tmp/tuff-r3-fixture')
    const diagnostics = makeDiagnostics()
    diagnostics.sources[0].roots = [
      { sourceId: 'file-provider', path: '/Users/boss/Documents', permissionState: 'granted' }
    ]
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom: makeDom(),
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png',
        fixtureRoot
      })
    ).toEqual([`Fixture root did not constrain file-provider roots to ${fixtureRoot}.`])
  })

  it('passes natural maintenance reset evidence with action-appropriate audit fields', () => {
    const diagnostics = makeResetDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider',
      requiredAuditFields: ['duration', 'trigger', 'reason']
    })

    expect(verification.gate).toMatchObject({
      passed: true,
      failures: []
    })
    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom: makeDom(),
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([])
  })

  it('reports missing durable task and visual evidence signals', () => {
    const diagnostics = {
      ...makeDiagnostics(),
      sources: makeDiagnostics().sources.map((source) => ({ ...source, recentTasks: [] }))
    }
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })

    const failures = buildProbeFailures({
      sourceId: 'file-provider',
      diagnostics,
      verification,
      settingsDom: makeDom({ hasSourceDiagnosticsGroup: false }),
      detailDom: makeDom({ dialog: { ...makeDom().dialog, visible: false, hasRecentTasks: false } })
    })

    expect(failures).toEqual([
      'Diagnostics did not include recent task history.',
      expect.stringContaining('Settings diagnostics verifier failed:'),
      'Settings source diagnostics group is not visible.',
      'Source diagnostic detail dialog is not visible.',
      'Source diagnostic detail dialog does not show recent task chips.',
      'No Settings diagnostics screenshot artifact path was provided.',
      'No source detail screenshot artifact path was provided.'
    ])
    expect(failures[1]).toContain(
      'No source satisfied the Settings recent task audit evidence gate'
    )
  })
})
