import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import type { IndexedSourceDiagnosticsSnapshot } from '@talex-touch/utils/search'
import {
  buildArtifactPaths,
  buildIsolatedAppSetting,
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
    href: 'app://tuff/#/setting/file-index',
    title: 'Tuff',
    readyState: 'complete',
    text: 'Search Source Diagnostics File Index Details Recent Scan failed',
    hasSettingsShell: true,
    hasFileIndexPage: true,
    hasSourceDiagnosticsGroup: true,
    targetSourceVisible: true,
    sourceRows: [
      {
        title: 'File Index',
        description: 'File Index ready Details',
        hasDetailAction: true
      }
    ],
    dialog: {
      visible: true,
      animationStable: true,
      title: 'File Index',
      text: 'Recent Scan failed indexed 8/18 duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:3',
      sections: ['Overview', 'Recent'],
      recentTaskText:
        'Recent Scan failed indexed 8/18 duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:3',
      recentTaskChips: [
        'Scan failed indexed 8/18 duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:3'
      ],
      recentTaskChipGeometry: [
        {
          text: 'Scan failed indexed 8/18 duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:3',
          clientWidth: 560,
          scrollWidth: 560,
          clientHeight: 40,
          scrollHeight: 40,
          rectWidth: 560,
          rectHeight: 40,
          display: 'inline-flex',
          visibility: 'visible',
          opacity: 1,
          withinSection: true,
          withinDialog: true,
          withinOverlayContent: true,
          withinViewport: true,
          intrinsicTruncated: false,
          fullyVisible: true,
          truncated: false
        }
      ],
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
          hasChannelSend: true,
          hasSettingsShell: false,
          text: 'CoreBox'
        }
      },
      {
        target: makeTarget('settings', 'app://tuff/renderer/index.html#/setting', 'Settings'),
        snapshot: {
          hasRouter: true,
          hasChannelSend: true,
          hasSettingsShell: true,
          text: 'App Settings'
        }
      }
    ])

    expect(selected?.id).toBe('settings')
  })

  it('uses an app-shell target only for an explicitly controlled launch', () => {
    const snapshots = [
      {
        target: makeTarget('overlay', 'app://tuff/renderer/index.html#/meta-overlay', 'CoreBox'),
        snapshot: {
          hasRouter: true,
          hasChannelSend: true,
          hasSettingsShell: false,
          text: 'CoreBox'
        }
      },
      {
        target: makeTarget('home', 'app://tuff/renderer/index.html#/home'),
        snapshot: {
          hasRouter: true,
          hasChannelSend: true,
          hasSettingsShell: false,
          text: 'Home'
        }
      }
    ]

    expect(selectSettingsTarget(snapshots)).toBeUndefined()
    expect(selectSettingsTarget(snapshots, { allowAppShell: true })?.id).toBe('home')
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

  it('enables current developer mode in the isolated app setting seed', () => {
    const setting = buildIsolatedAppSetting()

    expect(setting).toEqual({
      beginner: { init: true },
      dev: { developerMode: true }
    })
    expect(setting).not.toHaveProperty('dev.advancedSettings')
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

  it('uses a disposable HOME for isolated launches without an explicit fixture root', () => {
    const env = buildPackagedAppLaunchEnv({
      userDataDir: '/tmp/tuff-r3-user-data'
    })

    expect(env.HOME).toBe('/tmp/tuff-r3-user-data/home')
    expect(env.TUFF_FILE_PROVIDER_BASE_WATCH_PATHS).toBe('/tmp/tuff-r3-user-data/home')
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

  it('does not accept a longer job id that only contains the expected id as a substring', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChips = detailDom.dialog.recentTaskChips.map((chip) =>
      chip.replace('file-provider:scan:3', 'file-provider:scan:30')
    )

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual(['Source diagnostic detail dialog is missing recent task ids: file-provider:scan:3.'])
  })

  it('matches audit values from diagnostics in the same exact task chip', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChips = [
      detailDom.dialog.recentTaskChips[0]
        .replace('duration 1234ms', 'duration 0ms')
        .replace('code SQLITE_BUSY', 'code WRONG'),
      'duration 1234ms trigger manual reason manual-rebuild attempt 2 code SQLITE_BUSY file-provider:scan:30'
    ]

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([
      'Source diagnostic detail dialog is missing visible audit fields: duration, errorCode.'
    ])
  })

  it('fails when typed audit fields do not reach visible recent task chips', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChips = ['Scan failed file-provider:scan:3']

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([
      'Source diagnostic detail dialog is missing visible audit fields: duration, trigger, reason, attempt, errorCode.'
    ])
  })

  it('fails when a recent task chip is visually clipped', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChipGeometry[0] = {
      ...detailDom.dialog.recentTaskChipGeometry[0],
      clientWidth: 180,
      scrollWidth: 740,
      intrinsicTruncated: true,
      truncated: true
    }

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual(['Source diagnostic detail dialog clips 1 recent task chip(s).'])
  })

  it('fails when section containment is true but a required chip is outside a visibility boundary', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChipGeometry[0] = {
      ...detailDom.dialog.recentTaskChipGeometry[0],
      withinSection: true,
      withinDialog: false,
      fullyVisible: false
    }

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([
      'Source diagnostic detail dialog does not fully show 1 required recent task chip(s).'
    ])
  })

  it('fails closed for zero-sized or hidden required task chips', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })

    for (const geometryOverride of [{ clientWidth: 0, rectWidth: 0 }, { visibility: 'hidden' }]) {
      const detailDom = makeDom()
      detailDom.dialog.recentTaskChipGeometry[0] = {
        ...detailDom.dialog.recentTaskChipGeometry[0],
        ...geometryOverride
      }

      expect(
        buildProbeFailures({
          sourceId: 'file-provider',
          diagnostics,
          verification,
          settingsDom: makeDom(),
          detailDom,
          settingsScreenshotPath: 'settings.png',
          detailScreenshotPath: 'detail.png'
        })
      ).toEqual([
        'Source diagnostic detail dialog does not fully show 1 required recent task chip(s).'
      ])
    }
  })

  it('only requires the minRecentTasks target geometry to be fully visible', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    const targetChip = detailDom.dialog.recentTaskChips[0]
    const targetGeometry = detailDom.dialog.recentTaskChipGeometry[0]
    const hiddenGeometry = {
      ...targetGeometry,
      fullyVisible: false,
      withinDialog: false
    }
    detailDom.dialog.recentTaskChips = [
      targetChip,
      targetChip.replace('file-provider:scan:3', 'file-provider:scan:4'),
      targetChip.replace('file-provider:scan:3', 'file-provider:scan:5')
    ]
    detailDom.dialog.recentTaskChipGeometry = [
      targetGeometry,
      {
        ...hiddenGeometry,
        text: hiddenGeometry.text.replace('file-provider:scan:3', 'file-provider:scan:4')
      },
      {
        ...hiddenGeometry,
        text: hiddenGeometry.text.replace('file-provider:scan:3', 'file-provider:scan:5')
      }
    ]

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([])
  })

  it('fails closed when target task geometry is missing', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChipGeometry = []

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual([
      'Source diagnostic detail dialog is missing geometry for recent task ids: file-provider:scan:3.'
    ])
  })

  it('fails closed when the detail overlay animation has not stabilized', () => {
    const diagnostics = makeDiagnostics()
    const verification = verifySettingsIndexingDiagnosticsEvidence(diagnostics.sources, {
      sourceId: 'file-provider'
    })
    const detailDom = makeDom()
    detailDom.dialog.animationStable = false

    expect(
      buildProbeFailures({
        sourceId: 'file-provider',
        diagnostics,
        verification,
        settingsDom: makeDom(),
        detailDom,
        settingsScreenshotPath: 'settings.png',
        detailScreenshotPath: 'detail.png'
      })
    ).toEqual(['Source diagnostic detail dialog animation did not stabilize before capture.'])
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
    const detailDom = makeDom()
    detailDom.dialog.recentTaskChips = [
      'Reset done duration 0ms trigger user-clear reason user-clear file-provider:reset:1'
    ]
    detailDom.dialog.recentTaskChipGeometry[0] = {
      ...detailDom.dialog.recentTaskChipGeometry[0],
      text: detailDom.dialog.recentTaskChipGeometry[0].text.replace(
        'file-provider:scan:3',
        'file-provider:reset:1'
      )
    }

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
        detailDom,
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
      'Diagnostics did not include recent task history for file-provider.',
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
