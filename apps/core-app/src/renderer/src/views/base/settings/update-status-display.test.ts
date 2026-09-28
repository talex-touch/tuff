import type { UpdateLifecycleSnapshot } from '@talex-touch/utils'
import type {
  UpdateStatusAction,
  UpdateStatusRowView,
  UpdateStatusViewInput
} from './update-status-display'
import { AppPreviewChannel, UPDATE_LIFECYCLE_PHASES } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import enUS from '../../../modules/lang/en-US.json'
import zhCN from '../../../modules/lang/zh-CN.json'
import {
  AUTO_DOWNLOAD_GRACE_MS,
  formatFileSize,
  formatUpdateVersionLabel,
  resolveUpdateStatusView
} from './update-status-display'

const K = 'settings.settingUpdate'
const NOW = 1_800_000_000_000

function buildSnapshot(overrides: Partial<UpdateLifecycleSnapshot> = {}): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision: 1,
    phase: 'idle',
    currentVersion: '2.4.14-beta.46',
    targetVersion: null,
    source: null,
    channel: AppPreviewChannel.BETA,
    releaseTag: null,
    taskId: null,
    installMode: null,
    installOnNormalQuit: false,
    rollbackCompatible: false,
    rollbackFromVersion: null,
    previousVersion: null,
    recoveryAvailable: false,
    lastCheckAt: null,
    error: null,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 1_000,
    ...overrides
  }
}

function buildInput(overrides: Partial<UpdateStatusViewInput> = {}): UpdateStatusViewInput {
  return {
    snapshot: buildSnapshot(),
    loading: false,
    currentVersion: '2.4.14-beta.46',
    autoDownload: true,
    availableSinceMs: null,
    nowMs: NOW,
    platform: 'darwin',
    authenticity: 'official',
    downloadProgress: null,
    canStartDownload: true,
    checkRequestPending: false,
    checkLocked: false,
    downloadRequestPending: false,
    installRequestPending: false,
    ...overrides
  }
}

function resolveRow(overrides: Partial<UpdateStatusViewInput> = {}): UpdateStatusRowView {
  const view = resolveUpdateStatusView(buildInput(overrides))
  if (view.kind !== 'status') throw new Error(`expected a status row, got ${view.kind}`)
  return view
}

const target = { targetVersion: 'v2.4.14-beta.47', releaseTag: 'v2.4.14-beta.47' }
const checkAction: UpdateStatusAction = {
  kind: 'check',
  labelKey: `${K}.actions.manualCheck`,
  loading: false,
  disabled: false
}

describe('resolveUpdateStatusView', () => {
  it('shows a skeleton until the first snapshot answers', () => {
    expect(resolveUpdateStatusView(buildInput({ snapshot: null, loading: true }))).toEqual({
      kind: 'skeleton'
    })
  })

  it('holds the skeleton for the version too while the status request is out', () => {
    expect(
      resolveUpdateStatusView(
        buildInput({
          snapshot: buildSnapshot({ lastCheckAt: NOW }),
          loading: true,
          currentVersion: null
        })
      )
    ).toEqual({ kind: 'skeleton' })
    expect(
      resolveUpdateStatusView(
        buildInput({ snapshot: buildSnapshot({ lastCheckAt: NOW }), loading: true })
      ).kind
    ).toBe('status')
  })

  it('stops waiting for a version that never came once the status has answered', () => {
    const row = resolveRow({
      snapshot: buildSnapshot({
        phase: 'idle',
        lastCheckAt: NOW,
        currentVersion: '2.4.14-beta.45'
      }),
      loading: false,
      currentVersion: null
    })

    // The attempt's own starting version stands in; it is a real version, not the build kind.
    expect(row.detail).toEqual({ kind: 'text', text: 'v2.4.14-beta.45' })
  })

  it.each([
    {
      name: 'idle after a check: up to date',
      input: { snapshot: buildSnapshot({ phase: 'idle', lastCheckAt: NOW - 5_000 }) },
      expected: {
        title: { key: `${K}.status.latest` },
        detail: { kind: 'text', text: 'v2.4.14-beta.46' },
        progress: null,
        action: checkAction
      }
    },
    {
      name: 'healthy after a check: up to date',
      input: { snapshot: buildSnapshot({ phase: 'healthy', lastCheckAt: NOW - 5_000, ...target }) },
      expected: {
        title: { key: `${K}.status.latest` },
        detail: { kind: 'text', text: 'v2.4.14-beta.46' },
        progress: null,
        action: checkAction
      }
    },
    {
      name: 'idle and never checked: the current version',
      input: { snapshot: buildSnapshot({ phase: 'idle', lastCheckAt: null }) },
      expected: {
        title: { key: `${K}.status.currentVersion`, params: { version: 'v2.4.14-beta.46' } },
        detail: null,
        progress: null,
        action: checkAction
      }
    },
    {
      name: 'recovered: the current version, even after a check',
      input: { snapshot: buildSnapshot({ phase: 'recovered', lastCheckAt: NOW - 5_000 }) },
      expected: {
        title: { key: `${K}.status.currentVersion`, params: { version: 'v2.4.14-beta.46' } },
        detail: null,
        progress: null,
        action: checkAction
      }
    },
    {
      name: 'no snapshot after the status request failed',
      input: { snapshot: null, loading: false },
      expected: {
        title: { key: `${K}.status.currentVersion`, params: { version: 'v2.4.14-beta.46' } },
        detail: null,
        progress: null,
        action: checkAction
      }
    },
    {
      name: 'checking',
      input: { snapshot: buildSnapshot({ phase: 'checking' }) },
      expected: {
        title: { key: `${K}.status.checking` },
        detail: { kind: 'text', text: 'v2.4.14-beta.46' },
        progress: null,
        action: { ...checkAction, loading: true }
      }
    },
    {
      name: 'available while the automatic download is starting',
      input: {
        snapshot: buildSnapshot({ phase: 'available', ...target }),
        availableSinceMs: NOW - 3_000
      },
      expected: {
        title: { key: `${K}.status.preparing`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'default' },
        action: null
      }
    },
    {
      name: 'available with automatic updates off',
      input: {
        snapshot: buildSnapshot({ phase: 'available', ...target }),
        autoDownload: false,
        availableSinceMs: NOW
      },
      expected: {
        title: { key: `${K}.status.available`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: null,
        action: {
          kind: 'download',
          labelKey: `${K}.actions.downloadAvailable`,
          loading: false,
          disabled: false
        }
      }
    },
    {
      name: 'downloading before the first progress event',
      input: { snapshot: buildSnapshot({ phase: 'downloading', taskId: 'task-1', ...target }) },
      expected: {
        title: { key: `${K}.status.downloading`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'default' },
        action: null
      }
    },
    {
      name: 'downloading with progress',
      input: {
        snapshot: buildSnapshot({ phase: 'downloading', taskId: 'task-1', ...target }),
        downloadProgress: {
          downloadedSize: 47_395_635,
          totalSize: 127_506_841,
          speed: 2_202_009,
          percentage: 37.17
        }
      },
      expected: {
        title: { key: `${K}.status.downloading`, params: { version: 'v2.4.14-beta.47' } },
        detail: {
          kind: 'progress',
          percent: 37,
          downloaded: '45 MB',
          total: '122 MB',
          speed: '2.1 MB'
        },
        progress: { kind: 'determinate', percentage: 37.17 },
        action: null
      }
    },
    {
      name: 'verifying',
      input: { snapshot: buildSnapshot({ phase: 'verifying', taskId: 'task-1', ...target }) },
      expected: {
        title: { key: `${K}.status.verifying`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'default' },
        action: null
      }
    },
    {
      name: 'ready on macOS, installing on quit',
      input: {
        snapshot: buildSnapshot({
          phase: 'ready',
          taskId: 'task-1',
          installOnNormalQuit: true,
          ...target
        })
      },
      expected: {
        title: { key: `${K}.status.ready`, params: { version: 'v2.4.14-beta.47' } },
        detail: { kind: 'message', message: { key: `${K}.status.readyOnQuit` } },
        progress: null,
        action: {
          kind: 'install',
          labelKey: `${K}.actions.restartMac`,
          loading: false,
          disabled: false
        }
      }
    },
    {
      name: 'ready on Windows without install-on-quit',
      input: {
        platform: 'win32',
        snapshot: buildSnapshot({ phase: 'ready', taskId: 'task-1', ...target })
      },
      expected: {
        title: { key: `${K}.status.ready`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: null,
        action: {
          kind: 'install',
          labelKey: `${K}.actions.startWindowsInstaller`,
          loading: false,
          disabled: false
        }
      }
    },
    {
      name: 'ready on Linux',
      input: {
        platform: 'linux',
        snapshot: buildSnapshot({ phase: 'ready', taskId: 'task-1', ...target })
      },
      expected: {
        title: { key: `${K}.status.ready`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: null,
        action: {
          kind: 'install',
          labelKey: `${K}.actions.openLinuxPackage`,
          loading: false,
          disabled: false
        }
      }
    },
    {
      name: 'ready on an unofficial macOS build',
      input: {
        authenticity: 'unofficial',
        snapshot: buildSnapshot({
          phase: 'ready',
          taskId: 'task-1',
          installOnNormalQuit: true,
          ...target
        })
      },
      expected: {
        title: { key: `${K}.status.ready`, params: { version: 'v2.4.14-beta.47' } },
        // Why it stops, not "installs when you quit": the quit path refuses this build too. No
        // action either — the authenticity banner holds the only download link.
        detail: { kind: 'message', message: { key: `${K}.status.readyBlocked` } },
        progress: null,
        action: null
      }
    },
    {
      name: 'install scheduled',
      input: {
        snapshot: buildSnapshot({ phase: 'install-scheduled', taskId: 'task-1', ...target })
      },
      expected: {
        title: { key: `${K}.status.installing`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'default' },
        action: null
      }
    },
    {
      name: 'installer handoff started',
      input: { snapshot: buildSnapshot({ phase: 'handoff-started', taskId: 'task-1', ...target }) },
      expected: {
        title: { key: `${K}.status.installing`, params: { version: 'v2.4.14-beta.47' } },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'default' },
        action: null
      }
    },
    {
      name: 'awaiting the health check',
      input: { snapshot: buildSnapshot({ phase: 'awaiting-health', ...target }) },
      expected: {
        title: { key: `${K}.status.finishing` },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'default' },
        action: null
      }
    },
    {
      name: 'recovery required',
      input: { snapshot: buildSnapshot({ phase: 'recovery-required', ...target }) },
      expected: {
        title: { key: `${K}.status.recovering` },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'warning' },
        action: null
      }
    },
    {
      name: 'recovering',
      input: { snapshot: buildSnapshot({ phase: 'recovering', ...target }) },
      expected: {
        title: { key: `${K}.status.recovering` },
        detail: null,
        progress: { kind: 'indeterminate', tone: 'warning' },
        action: null
      }
    },
    {
      name: 'failed',
      input: {
        snapshot: buildSnapshot({
          phase: 'failed',
          ...target,
          error: { code: 'UPDATE_DOWNLOAD_FAILED', message: 'Network unreachable', retryable: true }
        })
      },
      expected: {
        title: { key: `${K}.status.failed` },
        detail: { kind: 'text', text: 'Network unreachable' },
        progress: null,
        action: {
          kind: 'retry',
          labelKey: `${K}.actions.retry`,
          loading: false,
          disabled: false
        }
      }
    }
  ] satisfies Array<{
    name: string
    input: Partial<UpdateStatusViewInput>
    expected: Omit<UpdateStatusRowView, 'kind' | 'phase'>
  }>)('renders $name', ({ input, expected }) => {
    expect(resolveRow(input)).toMatchObject({ kind: 'status', ...expected })
  })

  describe('the automatic-download grace period', () => {
    const available = buildSnapshot({ phase: 'available', ...target })

    it('hides the download button until the grace period has fully elapsed', () => {
      const justBefore = resolveRow({
        snapshot: available,
        availableSinceMs: NOW - (AUTO_DOWNLOAD_GRACE_MS - 1)
      })
      const atBoundary = resolveRow({
        snapshot: available,
        availableSinceMs: NOW - AUTO_DOWNLOAD_GRACE_MS
      })

      expect(justBefore.title.key).toBe(`${K}.status.preparing`)
      expect(justBefore.action).toBeNull()
      expect(atBoundary.title.key).toBe(`${K}.status.available`)
      expect(atBoundary.action).toMatchObject({ kind: 'download', loading: false })
    })

    it('treats an attempt this page has not timed yet as just entered', () => {
      expect(resolveRow({ snapshot: available, availableSinceMs: null }).action).toBeNull()
    })

    it('keeps a download the user already requested visible and loading', () => {
      const view = resolveRow({
        snapshot: available,
        availableSinceMs: NOW - 1_000,
        downloadRequestPending: true
      })

      expect(view.action).toMatchObject({ kind: 'download', loading: true })
    })

    it('disables the download button when this device has no matching package', () => {
      const view = resolveRow({
        snapshot: available,
        autoDownload: false,
        canStartDownload: false
      })

      expect(view.action).toMatchObject({ kind: 'download', disabled: true })
    })
  })

  describe('the ready action', () => {
    const ready = buildSnapshot({ phase: 'ready', taskId: 'task-1', ...target })

    it.each(['win32', 'linux'])(
      'keeps the install action for an unofficial %s build, which the main process allows',
      (platform) => {
        expect(
          resolveRow({ snapshot: ready, platform, authenticity: 'unofficial' }).action
        ).toMatchObject({
          kind: 'install'
        })
      }
    )

    it('keeps the install action on macOS while authenticity is still loading', () => {
      expect(resolveRow({ snapshot: ready, authenticity: 'unknown' }).action).toMatchObject({
        kind: 'install',
        labelKey: `${K}.actions.restartMac`
      })
    })

    it('disables install without a verified task and shows progress while it is requested', () => {
      expect(resolveRow({ snapshot: { ...ready, taskId: null } }).action).toMatchObject({
        kind: 'install',
        disabled: true
      })
      expect(resolveRow({ snapshot: ready, installRequestPending: true }).action).toMatchObject({
        kind: 'install',
        loading: true
      })
    })
  })

  it('marks a manual check in flight and locks it while settings load', () => {
    const snapshot = buildSnapshot({
      phase: 'failed',
      error: { code: 'X', message: 'x', retryable: true }
    })

    expect(resolveRow({ snapshot, checkRequestPending: true }).action).toMatchObject({
      kind: 'retry',
      loading: true
    })
    expect(resolveRow({ snapshot, checkLocked: true }).action).toMatchObject({
      kind: 'retry',
      disabled: true
    })
  })

  it('never falls back to a lifecycle phase label such as "idle"', () => {
    for (const phase of UPDATE_LIFECYCLE_PHASES) {
      const row = resolveRow({ snapshot: buildSnapshot({ phase, taskId: 'task-1', ...target }) })
      expect(row.title.key.startsWith(`${K}.status.`)).toBe(true)
    }
  })

  it('only produces keys that exist in both locales', () => {
    const keys = new Set<string>()
    const variants: Partial<UpdateStatusViewInput>[] = [
      {},
      { platform: 'win32' },
      { platform: 'linux' },
      { authenticity: 'unofficial' },
      { autoDownload: false },
      { availableSinceMs: NOW - AUTO_DOWNLOAD_GRACE_MS },
      {
        downloadProgress: { downloadedSize: 1, totalSize: 2, speed: 1, percentage: 50 }
      }
    ]
    for (const phase of UPDATE_LIFECYCLE_PHASES) {
      for (const lastCheckAt of [null, NOW]) {
        for (const installOnNormalQuit of [false, true]) {
          for (const variant of variants) {
            const row = resolveRow({
              ...variant,
              snapshot: buildSnapshot({
                phase,
                lastCheckAt,
                installOnNormalQuit,
                taskId: 'task-1',
                ...target
              })
            })
            keys.add(row.title.key)
            if (row.detail?.kind === 'message') keys.add(row.detail.message.key)
            if (row.action) keys.add(row.action.labelKey)
          }
        }
      }
    }
    // The progress line is composed by the status row; its template must resolve too.
    keys.add(`${K}.status.progressDetail`)

    const missing = [...keys].filter((key) => !hasMessage(enUS, key) || !hasMessage(zhCN, key))
    expect(keys.size).toBeGreaterThan(15)
    expect(missing).toEqual([])
  })
})

describe('formatUpdateVersionLabel', () => {
  it.each([
    ['2.4.14-beta.46', 'v2.4.14-beta.46'],
    ['v2.4.14-beta.47', 'v2.4.14-beta.47'],
    ['V2.5.0', 'v2.5.0'],
    [' 2.5.0 ', 'v2.5.0'],
    [null, ''],
    [undefined, ''],
    ['', '']
  ])('formats %s as %s', (input, expected) => {
    expect(formatUpdateVersionLabel(input)).toBe(expected)
  })

  it('gives a release tag and the matching app version the same label', () => {
    // Tags (`targetVersion`, history `toVersion`) keep the `v`; app versions
    // (the package.json version, `fromVersion`) drop it.
    expect(formatUpdateVersionLabel('v2.4.14-beta.47')).toBe(
      formatUpdateVersionLabel('2.4.14-beta.47')
    )
  })

  it('labels the running version and the target the same way in the status row', () => {
    const view = resolveRow({
      currentVersion: '2.4.14-beta.46',
      snapshot: buildSnapshot({ phase: 'idle', lastCheckAt: NOW })
    })
    const available = resolveRow({
      autoDownload: false,
      snapshot: buildSnapshot({ phase: 'available', targetVersion: '2.4.14-beta.47' })
    })

    expect(view.detail).toEqual({ kind: 'text', text: 'v2.4.14-beta.46' })
    expect(available.title.params).toEqual({ version: 'v2.4.14-beta.47' })
  })
})

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [-1, '0 B'],
    [Number.NaN, '0 B'],
    [512, '512 B'],
    [1536, '1.5 KB'],
    [2_202_009, '2.1 MB'],
    [127_506_841, '122 MB'],
    [3 * 1024 ** 3, '3.0 GB']
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected)
  })
})

function hasMessage(catalog: unknown, key: string): boolean {
  let node: unknown = catalog
  for (const segment of key.split('.')) {
    if (!node || typeof node !== 'object') return false
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string'
}
