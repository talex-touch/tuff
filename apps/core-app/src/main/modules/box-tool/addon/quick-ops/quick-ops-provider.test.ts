import type { NetworkInterfaceInfo } from 'node:os'
import { TuffInputType, type IExecuteArgs, type TuffItem } from '@talex-touch/utils'
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  nextBlockerId: 1,
  started: new Set<number>(),
  displays: [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1440, height: 900 }
    },
    {
      id: 2,
      bounds: { x: 1440, y: 0, width: 1280, height: 720 }
    }
  ],
  start: vi.fn(() => {
    const id = electronMocks.nextBlockerId
    electronMocks.nextBlockerId += 1
    electronMocks.started.add(id)
    return id
  }),
  stop: vi.fn((id: number) => {
    electronMocks.started.delete(id)
  }),
  isStarted: vi.fn((id: number) => electronMocks.started.has(id)),
  BrowserWindow: vi.fn(),
  getPath: vi.fn((name: string) => `/mock/${name}`),
  getVersion: vi.fn(() => '2.4.12-test')
}))

const notificationMocks = vi.hoisted(() => ({
  showInternalSystemNotification: vi.fn()
}))

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn()
}))

const fsMocks = vi.hoisted(() => ({
  readdir: vi.fn<(targetPath: string, options?: unknown) => Promise<unknown[]>>(
    async (targetPath) => {
      if (targetPath === '/sys/class/power_supply') return []
      return []
    }
  ),
  statfs: vi.fn((targetPath: string) => {
    if (targetPath.includes('Application Support')) {
      return Promise.resolve({
        type: 0,
        bsize: 1024,
        blocks: 10 * 1024 * 1024,
        bfree: 2 * 1024 * 1024,
        bavail: 2 * 1024 * 1024,
        files: 0,
        ffree: 0
      })
    }

    return Promise.resolve({
      type: 0,
      bsize: 1024,
      blocks: 20 * 1024 * 1024,
      bfree: 5 * 1024 * 1024,
      bavail: 5 * 1024 * 1024,
      files: 0,
      ffree: 0
    })
  })
}))

const dnsMocks = vi.hoisted(() => ({
  getServers: vi.fn(() => ['1.1.1.1', '2606:4700:4700::1111'])
}))

const dnsPromiseMocks = vi.hoisted(() => ({
  resolve4: vi.fn<() => Promise<string[]>>(async () => ['93.184.216.34']),
  resolve6: vi.fn<() => Promise<string[]>>(async () => ['2606:2800:220:1:248:1893:25c8:1946']),
  resolveCname: vi.fn<() => Promise<string[]>>(async () => []),
  resolveMx: vi.fn<() => Promise<Array<{ exchange: string; priority: number }>>>(async () => [
    { exchange: 'mail.example.com', priority: 10 }
  ]),
  resolveNs: vi.fn<() => Promise<string[]>>(async () => ['ns1.example.com']),
  resolveTxt: vi.fn<() => Promise<string[][]>>(async () => [['v=spf1 ', '-all']]),
  resolveSoa: vi.fn<() => Promise<{ nsname: string }>>(async () => ({
    nsname: 'ns1.example.com'
  }))
}))

type NetworkInterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>

const osMocks = vi.hoisted(() => ({
  cpus: vi.fn(() => [
    {
      model: 'Apple M Test',
      speed: 3200,
      times: {
        user: 0,
        nice: 0,
        sys: 0,
        idle: 0,
        irq: 0
      }
    },
    {
      model: 'Apple M Test',
      speed: 3200,
      times: {
        user: 0,
        nice: 0,
        sys: 0,
        idle: 0,
        irq: 0
      }
    }
  ]),
  freemem: vi.fn(() => 4 * 1024 * 1024 * 1024),
  homedir: vi.fn(() => '/Users/tester'),
  loadavg: vi.fn(() => [1.25, 2.5, 3.75]),
  networkInterfaces: vi.fn<() => NetworkInterfaceMap>(() => ({
    lo0: [
      {
        address: '127.0.0.1',
        family: 'IPv4',
        netmask: '255.0.0.0',
        mac: '00:00:00:00:00:00',
        cidr: '127.0.0.1/8',
        internal: true
      }
    ],
    en0: [
      {
        address: 'fe80::1',
        family: 'IPv6',
        netmask: 'ffff:ffff:ffff:ffff::',
        mac: '00:00:00:00:00:01',
        cidr: 'fe80::1/64',
        scopeid: 4,
        internal: false
      },
      {
        address: '192.168.2.10',
        family: 'IPv4',
        netmask: '255.255.255.0',
        mac: '00:00:00:00:00:01',
        cidr: '192.168.2.10/24',
        internal: false
      }
    ]
  })),
  release: vi.fn(() => '25.5.0-test'),
  totalmem: vi.fn(() => 16 * 1024 * 1024 * 1024),
  type: vi.fn(() => 'Darwin'),
  uptime: vi.fn(() => 3661)
}))

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath,
    getVersion: electronMocks.getVersion
  },
  BrowserWindow: electronMocks.BrowserWindow,
  powerSaveBlocker: {
    start: electronMocks.start,
    stop: electronMocks.stop,
    isStarted: electronMocks.isStarted
  },
  screen: {
    getAllDisplays: vi.fn(() => electronMocks.displays),
    getPrimaryDisplay: vi.fn(() => electronMocks.displays[0])
  }
}))

vi.mock('../../../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: notificationMocks.showInternalSystemNotification
  }
}))

vi.mock('../../../storage', () => ({
  getMainConfig: vi.fn(() => undefined)
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: childProcessMocks.execFile
  }
})

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>()
  return {
    ...actual,
    getServers: dnsMocks.getServers
  }
})

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>()
  return {
    ...actual,
    resolve4: dnsPromiseMocks.resolve4,
    resolve6: dnsPromiseMocks.resolve6,
    resolveCname: dnsPromiseMocks.resolveCname,
    resolveMx: dnsPromiseMocks.resolveMx,
    resolveNs: dnsPromiseMocks.resolveNs,
    resolveTxt: dnsPromiseMocks.resolveTxt,
    resolveSoa: dnsPromiseMocks.resolveSoa
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readdir: fsMocks.readdir,
    statfs: fsMocks.statfs
  }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    cpus: osMocks.cpus,
    freemem: osMocks.freemem,
    homedir: osMocks.homedir,
    loadavg: osMocks.loadavg,
    networkInterfaces: osMocks.networkInterfaces,
    release: osMocks.release,
    totalmem: osMocks.totalmem,
    type: osMocks.type,
    uptime: osMocks.uptime
  }
})

const PROXY_ENV_NAMES = [
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'all_proxy',
  'no_proxy'
]

function clearProxyEnv(): Record<string, string | undefined> {
  const original = Object.fromEntries(PROXY_ENV_NAMES.map((name) => [name, process.env[name]]))
  PROXY_ENV_NAMES.forEach((name) => {
    delete process.env[name]
  })
  return original
}

function restoreProxyEnv(original: Record<string, string | undefined>): void {
  PROXY_ENV_NAMES.forEach((name) => {
    const value = original[name]
    if (value === undefined) {
      delete process.env[name]
      return
    }
    process.env[name] = value
  })
}

function mockProcessPlatform(platform: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(process, 'platform', descriptor)
    }
  }
}

function mockExecFileSuccess(stdout: string): void {
  childProcessMocks.execFile.mockImplementation((_command, _args, _options, callback) => {
    callback(null, { stdout, stderr: '' })
  })
}

function mockExecFileFailure(error: Error): void {
  childProcessMocks.execFile.mockImplementation((_command, _args, _options, callback) => {
    callback(error, { stdout: '', stderr: '' })
  })
}

function getQuickOpsMeta(item: TuffItem):
  | {
      action?: string
      durationMs?: number
      breakDurationMs?: number
      pomodoroCycles?: number
      pomodoroLongBreakMs?: number
      pomodoroLongBreakEvery?: number
      pomodoroMode?: string
      screenMode?: string
      riskLevel?: string
      category?: string
      operation?: string
      sourcePath?: string
      targetDirectory?: string
      targetPath?: string
    }
  | undefined {
  return (
    item.meta?.extension as {
      quickOps?: {
        action?: string
        durationMs?: number
        breakDurationMs?: number
        pomodoroCycles?: number
        pomodoroLongBreakMs?: number
        pomodoroLongBreakEvery?: number
        pomodoroMode?: string
        screenMode?: string
        riskLevel?: string
        category?: string
        operation?: string
        sourcePath?: string
        targetDirectory?: string
        targetPath?: string
      }
    }
  )?.quickOps
}

function expectFirstItem(items: TuffItem[]): TuffItem {
  expect(items).toHaveLength(1)
  const item = items[0]
  if (!item) {
    throw new Error('Expected one QuickOps item')
  }
  return item
}

function createWindowHarness() {
  const windows: Array<{
    bounds: { x: number; y: number; width: number; height: number }
    screenMode?: string
    close: ReturnType<typeof vi.fn>
    isDestroyed: ReturnType<typeof vi.fn>
    emitClosed: () => void
  }> = []

  const factory = vi.fn((bounds, _session, onClosed) => {
    let destroyed = false
    const window = {
      bounds,
      screenMode: _session.screenMode,
      close: vi.fn(() => {
        destroyed = true
      }),
      isDestroyed: vi.fn(() => destroyed),
      emitClosed: () => {
        destroyed = true
        onClosed(window)
      }
    }
    windows.push(window)
    return window
  })

  return { factory, windows }
}

describe('QuickOpsProvider', () => {
  let tempDirs: string[] = []
  let originalProxyEnv: Record<string, string | undefined>

  beforeEach(() => {
    vi.useFakeTimers()
    electronMocks.nextBlockerId = 1
    electronMocks.started.clear()
    electronMocks.getPath.mockImplementation((name: string) => `/mock/${name}`)
    electronMocks.getVersion.mockReturnValue('2.4.12-test')
    electronMocks.displays = [
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1440, height: 900 }
      },
      {
        id: 2,
        bounds: { x: 1440, y: 0, width: 1280, height: 720 }
      }
    ]
    vi.clearAllMocks()
    originalProxyEnv = clearProxyEnv()
    mockExecFileFailure(new Error('execFile not mocked'))
    dnsMocks.getServers.mockReturnValue(['1.1.1.1', '2606:4700:4700::1111'])
    dnsPromiseMocks.resolve4.mockResolvedValue(['93.184.216.34'])
    dnsPromiseMocks.resolve6.mockResolvedValue(['2606:2800:220:1:248:1893:25c8:1946'])
    dnsPromiseMocks.resolveCname.mockResolvedValue([])
    dnsPromiseMocks.resolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }])
    dnsPromiseMocks.resolveNs.mockResolvedValue(['ns1.example.com'])
    dnsPromiseMocks.resolveTxt.mockResolvedValue([['v=spf1 ', '-all']])
    dnsPromiseMocks.resolveSoa.mockResolvedValue({ nsname: 'ns1.example.com' })
    fsMocks.readdir.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/sys/class/power_supply') return []
      return []
    })
    fsMocks.statfs.mockImplementation((targetPath: string) => {
      if (targetPath.includes('Application Support')) {
        return Promise.resolve({
          type: 0,
          bsize: 1024,
          blocks: 10 * 1024 * 1024,
          bfree: 2 * 1024 * 1024,
          bavail: 2 * 1024 * 1024,
          files: 0,
          ffree: 0
        })
      }

      return Promise.resolve({
        type: 0,
        bsize: 1024,
        blocks: 20 * 1024 * 1024,
        bfree: 5 * 1024 * 1024,
        bavail: 5 * 1024 * 1024,
        files: 0,
        ffree: 0
      })
    })
    osMocks.cpus.mockReturnValue([
      {
        model: 'Apple M Test',
        speed: 3200,
        times: {
          user: 0,
          nice: 0,
          sys: 0,
          idle: 0,
          irq: 0
        }
      },
      {
        model: 'Apple M Test',
        speed: 3200,
        times: {
          user: 0,
          nice: 0,
          sys: 0,
          idle: 0,
          irq: 0
        }
      }
    ])
    osMocks.freemem.mockReturnValue(4 * 1024 * 1024 * 1024)
    osMocks.loadavg.mockReturnValue([1.25, 2.5, 3.75])
    osMocks.networkInterfaces.mockReturnValue({
      lo0: [
        {
          address: '127.0.0.1',
          family: 'IPv4',
          netmask: '255.0.0.0',
          mac: '00:00:00:00:00:00',
          cidr: '127.0.0.1/8',
          internal: true
        }
      ],
      en0: [
        {
          address: 'fe80::1',
          family: 'IPv6',
          netmask: 'ffff:ffff:ffff:ffff::',
          mac: '00:00:00:00:00:01',
          cidr: 'fe80::1/64',
          scopeid: 4,
          internal: false
        },
        {
          address: '192.168.2.10',
          family: 'IPv4',
          netmask: '255.255.255.0',
          mac: '00:00:00:00:00:01',
          cidr: '192.168.2.10/24',
          internal: false
        }
      ]
    })
    osMocks.homedir.mockReturnValue('/Users/tester')
    osMocks.release.mockReturnValue('25.5.0-test')
    osMocks.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024)
    osMocks.type.mockReturnValue('Darwin')
    osMocks.uptime.mockReturnValue(3661)
  })

  afterEach(() => {
    vi.useRealTimers()
    restoreProxyEnv(originalProxyEnv)
    const dirs = tempDirs
    tempDirs = []
    return Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createTempFile(name: string, content: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    const filePath = path.join(dir, name)
    await writeFile(filePath, content)
    return filePath
  }

  it('creates a keep-awake action with parsed duration', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'keep awake 30m', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'keep-awake-start',
      durationMs: 30 * 60 * 1000,
      riskLevel: 'stateful'
    })
    expect(item.render).toMatchObject({
      basic: {
        title: '保持唤醒 30分钟'
      }
    })
  })

  it('uses QuickOps default preferences when commands omit explicit options', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider(undefined, () => ({
      enabled: true,
      showRunningSessionsInCoreBox: true,
      defaultKeepAwakeDurationMinutes: 45,
      defaultSystemAwakeDurationMinutes: 90,
      defaultTimerDurationMinutes: 12,
      defaultTimerExtendMinutes: 3,
      defaultPomodoroFocusMinutes: 40,
      defaultPomodoroBreakMinutes: 8,
      pomodoroTemplates: {
        classic: true,
        long: true
      },
      defaultScreenCleanDurationSeconds: 120,
      defaultScreenCleanMode: 'white'
    }))

    const keepAwake = await provider.onSearch(
      { text: 'keep awake', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(keepAwake.items))).toEqual({
      action: 'keep-awake-start',
      durationMs: 45 * 60 * 1000,
      riskLevel: 'stateful'
    })

    const timer = await provider.onSearch(
      { text: 'timer', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(timer.items))).toEqual({
      action: 'timer-start',
      durationMs: 12 * 60 * 1000,
      riskLevel: 'stateful'
    })

    const pomodoroCycle = await provider.onSearch(
      { text: 'pomodoro cycle', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(pomodoroCycle.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 40 * 60 * 1000,
      breakDurationMs: 8 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })

    const screenClean = await provider.onSearch(
      { text: 'clean screen', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(screenClean.items))).toEqual({
      action: 'screen-clean-start',
      durationMs: 120 * 1000,
      screenMode: 'white',
      riskLevel: 'stateful'
    })
  })

  it('respects built-in pomodoro template enablement preferences', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider(undefined, () => ({
      defaultPomodoroFocusMinutes: 40,
      defaultPomodoroBreakMinutes: 8,
      pomodoroTemplates: {
        classic: false,
        long: true
      }
    }))

    const disabledClassic = await provider.onSearch(
      { text: 'pomodoro 25/5', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(disabledClassic.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 40 * 60 * 1000,
      riskLevel: 'stateful'
    })

    const enabledLong = await provider.onSearch(
      { text: 'long pomodoro', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(enabledLong.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 50 * 60 * 1000,
      breakDurationMs: 10 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
  })

  it('starts enabled custom pomodoro templates from configured aliases', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider(undefined, () => ({
      defaultPomodoroFocusMinutes: 40,
      defaultPomodoroBreakMinutes: 8,
      pomodoroTemplates: {
        classic: true,
        long: true,
        custom: [
          {
            name: 'writing sprint',
            aliases: ['写作冲刺', 'draft sprint'],
            focusMinutes: 45,
            breakMinutes: 12,
            enabled: true
          },
          {
            name: 'disabled sprint',
            aliases: ['disabled pomodoro'],
            focusMinutes: 30,
            breakMinutes: 5,
            enabled: false
          },
          {
            name: 'invalid sprint',
            aliases: ['invalid pomodoro'],
            focusMinutes: 0,
            breakMinutes: 5,
            enabled: true
          }
        ]
      }
    }))

    const aliasResult = await provider.onSearch(
      { text: '写作冲刺', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(aliasResult.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 45 * 60 * 1000,
      breakDurationMs: 12 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })

    const inlineResult = await provider.onSearch(
      { text: 'pomodoro writing sprint', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(inlineResult.items))).toMatchObject({
      durationMs: 45 * 60 * 1000,
      breakDurationMs: 12 * 60 * 1000,
      pomodoroMode: 'cycle'
    })

    const disabledResult = await provider.onSearch(
      { text: 'disabled pomodoro', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(disabledResult.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 40 * 60 * 1000,
      riskLevel: 'stateful'
    })

    const invalidResult = await provider.onSearch(
      { text: 'invalid pomodoro', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(invalidResult.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 40 * 60 * 1000,
      riskLevel: 'stateful'
    })
  })

  it('respects QuickOps enablement and running-session visibility preferences', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const disabledProvider = new QuickOpsProvider(undefined, () => ({ enabled: false }))

    const disabled = await disabledProvider.onSearch(
      { text: 'timer 5m', inputs: [] },
      new AbortController().signal
    )
    expect(disabled.items).toHaveLength(0)

    const hiddenStatusProvider = new QuickOpsProvider(undefined, () => ({
      enabled: true,
      showRunningSessionsInCoreBox: false
    }))
    const start = await hiddenStatusProvider.onSearch(
      { text: 'timer 5m', inputs: [] },
      new AbortController().signal
    )
    await hiddenStatusProvider.onExecute({
      item: expectFirstItem(start.items)
    } satisfies IExecuteArgs)

    const status = await hiddenStatusProvider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(status.items).toHaveLength(0)
  })

  it('shows local IP addresses as a safe informational result', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: '本机 IP', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.render.basic?.title).toBe('本机 IP 192.168.2.10')
    expect(item.render.basic?.subtitle).toContain('en0: 192.168.2.10')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-local-ip',
      type: 'copy',
      payload: {
        text: 'en0 IPv4 192.168.2.10\nen0 IPv6 fe80::1'
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'network',
        operation: 'local-ip',
        riskLevel: 'safe'
      }
    })
  })

  it('shows a degraded local IP result when no non-internal address exists', async () => {
    osMocks.networkInterfaces.mockReturnValue({
      lo0: [
        {
          address: '127.0.0.1',
          family: 'IPv4',
          netmask: '255.0.0.0',
          mac: '00:00:00:00:00:00',
          cidr: '127.0.0.1/8',
          internal: true
        }
      ]
    })
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'local ip', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('未找到本机 IP')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'local-ip',
        degradedReason: 'local-ip-unavailable'
      }
    })
  })

  it('keeps public IP lookup disabled by default without calling external services', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'public ip', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('公网 IP 查询未启用')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'network',
        operation: 'public-ip',
        riskLevel: 'safe',
        degradedReason: 'public-ip-disabled'
      }
    })
    vi.unstubAllGlobals()
  })

  it('copies public IP lookup results only when explicitly enabled', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ip: '203.0.113.10' })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider(undefined, () => ({ allowPublicIpLookup: true }))

    const result = await provider.onSearch(
      { text: '公网 IP', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('公网 IP 203.0.113.10')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ipify.org?format=json',
      expect.objectContaining({
        method: 'GET',
        headers: {
          accept: 'application/json'
        }
      })
    )
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-public-ip',
      type: 'copy',
      primary: true,
      payload: {
        text: '203.0.113.10\nSource: https://api.ipify.org?format=json'
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'network',
        operation: 'public-ip',
        riskLevel: 'safe',
        address: '203.0.113.10',
        source: 'https://api.ipify.org?format=json'
      }
    })
    vi.unstubAllGlobals()
  })

  it('shows degraded public IP results for external service failures and invalid payloads', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({})
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider(undefined, () => ({ allowPublicIpLookup: true }))

    const unavailable = await provider.onSearch(
      { text: 'public ip', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(unavailable.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'public-ip',
        degradedReason: 'public-ip-request-failed'
      }
    })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ip: '999.999.999.999' })
    })

    const invalid = await provider.onSearch(
      { text: 'public ip', inputs: [] },
      new AbortController().signal
    )
    const item = expectFirstItem(invalid.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('公网 IP 查询失败')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'public-ip',
        degradedReason: 'public-ip-invalid-response'
      }
    })
    vi.unstubAllGlobals()
  })

  it('copies safe network status summaries with DNS servers', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'network status', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('复制网络状态')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-network-status',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('Local Addresses:')
    expect(text).toContain('en0 IPv4 192.168.2.10')
    expect(text).toContain('en0 IPv6 fe80::1')
    expect(text).toContain('DNS Servers:')
    expect(text).toContain('1.1.1.1')
    expect(text).toContain('2606:4700:4700::1111')
    expect(text).toContain('Proxy:')
    expect(text).toContain('No proxy environment variable detected')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'network',
        operation: 'network-status',
        riskLevel: 'safe',
        addressCount: 2,
        dnsServerCount: 2,
        proxyStatus: 'not-detected',
        proxyCount: 0
      }
    })
  })

  it('copies redacted proxy environment variables in network status', async () => {
    process.env.HTTPS_PROXY = 'http://user:secret@proxy.local:8080'
    process.env.NO_PROXY = 'localhost,127.0.0.1'
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'network status', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.subtitle).toContain('2 proxy envs')
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('HTTPS_PROXY: http://***:***@proxy.local:8080/')
    expect(text).toContain('NO_PROXY: localhost,127.0.0.1')
    expect(text).not.toContain('secret')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'network-status',
        proxyStatus: 'detected',
        proxyCount: 2,
        proxies: [
          {
            source: 'HTTPS_PROXY',
            value: 'http://***:***@proxy.local:8080/'
          },
          {
            source: 'NO_PROXY',
            value: 'localhost,127.0.0.1'
          }
        ]
      }
    })
  })

  it('copies network status summaries when local addresses and DNS servers are empty', async () => {
    osMocks.networkInterfaces.mockReturnValue({
      lo0: [
        {
          address: '127.0.0.1',
          family: 'IPv4',
          netmask: '255.0.0.0',
          mac: '00:00:00:00:00:00',
          cidr: '127.0.0.1/8',
          internal: true
        }
      ]
    })
    dnsMocks.getServers.mockReturnValue([])
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: '网络状态', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('No non-internal local address')
    expect(text).toContain('No DNS server')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'network-status',
        addressCount: 0,
        dnsServerCount: 0
      }
    })
  })

  it('copies read-only macOS system proxy status with redacted credentials', async () => {
    const restorePlatform = mockProcessPlatform('darwin')
    mockExecFileSuccess(
      [
        '<dictionary> {',
        '  HTTPEnable : 1',
        '  HTTPProxy : user:secret@proxy.local',
        '  HTTPPort : 8080',
        '  HTTPSEnable : 1',
        '  HTTPSProxy : secure.proxy.local',
        '  HTTPSPort : 8443',
        '  ProxyAutoConfigEnable : 1',
        '  ProxyAutoConfigURLString : https://user:secret@pac.local/proxy.pac',
        '}'
      ].join('\n')
    )

    try {
      const { QuickOpsProvider } = await import('./quick-ops-provider')
      const provider = new QuickOpsProvider()

      const result = await provider.onSearch(
        { text: 'system proxy', inputs: [] },
        new AbortController().signal
      )

      const item = expectFirstItem(result.items)
      expect(item.kind).toBe('result')
      expect(item.render.basic?.title).toBe('复制系统代理状态')
      expect(item.actions?.[0]).toMatchObject({
        id: 'quick-ops-copy-system-proxy-status',
        type: 'copy',
        primary: true
      })
      const text = item.actions?.[0]?.payload?.text
      expect(text).toContain('Platform: darwin')
      expect(text).toContain('HTTP: ***:***@proxy.local:8080')
      expect(text).toContain('HTTPS: secure.proxy.local:8443')
      expect(text).toContain('PAC: https://***:***@pac.local/proxy.pac')
      expect(text).toContain('Safety: read-only local proxy settings')
      expect(text).not.toContain('secret')
      expect(childProcessMocks.execFile).toHaveBeenCalledWith(
        'scutil',
        ['--proxy'],
        { timeout: 3000 },
        expect.any(Function)
      )
      expect(item.meta?.extension).toMatchObject({
        quickOps: {
          category: 'network',
          operation: 'system-proxy-status',
          riskLevel: 'safe',
          platform: 'darwin',
          status: 'detected',
          environmentCount: 0,
          systemCount: 3,
          system: expect.arrayContaining([
            {
              source: 'macos-system',
              name: 'HTTP',
              value: '***:***@proxy.local:8080'
            }
          ])
        }
      })
    } finally {
      restorePlatform()
    }
  })

  it('copies Windows system proxy status without leaking credentials', async () => {
    const restorePlatform = mockProcessPlatform('win32')
    mockExecFileSuccess(
      JSON.stringify({
        ProxyEnable: 1,
        ProxyServer: 'http=user:secret@proxy.local:8080;https=secure.proxy.local:8443',
        AutoConfigURL: 'https://user:secret@pac.local/proxy.pac',
        ProxyOverride: 'localhost;127.0.0.1'
      })
    )

    try {
      const { QuickOpsProvider } = await import('./quick-ops-provider')
      const provider = new QuickOpsProvider()

      const result = await provider.onSearch(
        { text: '代理状态', inputs: [] },
        new AbortController().signal
      )

      const item = expectFirstItem(result.items)
      const text = item.actions?.[0]?.payload?.text
      expect(text).toContain('Platform: win32')
      expect(text).toContain(
        'ProxyServer: http=***:***@proxy.local:8080;https=secure.proxy.local:8443'
      )
      expect(text).toContain('AutoConfigURL: https://***:***@pac.local/proxy.pac')
      expect(text).toContain('ProxyOverride: localhost;127.0.0.1')
      expect(text).not.toContain('secret')
      expect(childProcessMocks.execFile).toHaveBeenCalledWith(
        'powershell.exe',
        expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']),
        { timeout: 5000 },
        expect.any(Function)
      )
      expect(item.meta?.extension).toMatchObject({
        quickOps: {
          operation: 'system-proxy-status',
          platform: 'win32',
          status: 'detected',
          systemCount: 3
        }
      })
    } finally {
      restorePlatform()
    }
  })

  it('keeps proxy status copy-only when Linux system proxy probing degrades', async () => {
    const restorePlatform = mockProcessPlatform('linux')
    process.env.HTTPS_PROXY = 'https://user:secret@env.proxy:8443'
    mockExecFileFailure(new Error('gsettings unavailable'))

    try {
      const { QuickOpsProvider } = await import('./quick-ops-provider')
      const provider = new QuickOpsProvider()

      const result = await provider.onSearch(
        { text: '系统代理状态', inputs: [] },
        new AbortController().signal
      )

      const item = expectFirstItem(result.items)
      const text = item.actions?.[0]?.payload?.text
      expect(text).toContain('Platform: linux')
      expect(text).toContain('Status: degraded (gsettings unavailable)')
      expect(text).toContain('HTTPS_PROXY: https://***:***@env.proxy:8443/')
      expect(text).toContain('No enabled system proxy detected')
      expect(text).not.toContain('secret')
      expect(childProcessMocks.execFile).toHaveBeenCalledWith(
        'gsettings',
        ['get', 'org.gnome.system.proxy', 'mode'],
        { timeout: 3000 },
        expect.any(Function)
      )
      expect(item.meta?.extension).toMatchObject({
        quickOps: {
          operation: 'system-proxy-status',
          platform: 'linux',
          status: 'degraded',
          environmentCount: 1,
          systemCount: 0,
          degradedReason: 'system-proxy-probe-failed'
        }
      })
    } finally {
      restorePlatform()
    }
  })

  it('parses system proxy payloads conservatively', async () => {
    const {
      parseLinuxSystemProxyEntries,
      parseMacSystemProxyEntries,
      parseWindowsSystemProxyEntries
    } = await import('./quick-ops-provider')

    expect(parseLinuxSystemProxyEntries("'none'")).toEqual([])
    expect(parseLinuxSystemProxyEntries("'auto'")).toEqual([
      {
        source: 'linux-gsettings',
        name: 'GNOME Proxy Mode',
        value: 'auto'
      }
    ])
    expect(
      parseMacSystemProxyEntries(
        'SOCKSEnable : 1\nSOCKSProxy : user:secret@socks.local\nSOCKSPort : 1080'
      )
    ).toEqual([
      {
        source: 'macos-system',
        name: 'SOCKS',
        value: '***:***@socks.local:1080'
      }
    ])
    expect(
      parseWindowsSystemProxyEntries(
        '{"ProxyEnable":0,"ProxyServer":"user:secret@proxy.local:8080","AutoConfigURL":""}'
      )
    ).toEqual([])
  })

  it('copies DNS query results for a valid hostname', async () => {
    dnsPromiseMocks.resolve4.mockResolvedValue(['93.184.216.34'])
    dnsPromiseMocks.resolve6.mockResolvedValue(['2606:2800:220:1:248:1893:25c8:1946'])
    dnsPromiseMocks.resolveCname.mockResolvedValue(['example.map.fastly.net'])
    dnsPromiseMocks.resolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }])
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'dns https://Example.com/path?q=1', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('DNS 查询 example.com')
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('Host: example.com')
    expect(text).toContain('A:\n93.184.216.34')
    expect(text).toContain('AAAA:\n2606:2800:220:1:248:1893:25c8:1946')
    expect(text).toContain('CNAME:\nexample.map.fastly.net')
    expect(text).toContain('MX:\n10 mail.example.com')
    expect(text).not.toContain('NS:')
    expect(dnsPromiseMocks.resolveNs).not.toHaveBeenCalled()
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'network',
        operation: 'dns-query',
        riskLevel: 'safe',
        hostname: 'example.com',
        recordCount: 4,
        failedTypes: [],
        deep: false
      }
    })
  })

  it('copies deep DNS query results with NS TXT and SOA records', async () => {
    dnsPromiseMocks.resolve4.mockResolvedValue(['93.184.216.34'])
    dnsPromiseMocks.resolve6.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveCname.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }])
    dnsPromiseMocks.resolveNs.mockResolvedValue(['ns1.example.com', 'ns2.example.com'])
    dnsPromiseMocks.resolveTxt.mockResolvedValue([['v=spf1 ', '-all'], ['site-verification=abc']])
    dnsPromiseMocks.resolveSoa.mockResolvedValue({ nsname: 'ns1.example.com' })
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'deep dns example.com', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('A:\n93.184.216.34')
    expect(text).toContain('MX:\n10 mail.example.com')
    expect(text).toContain('NS:\nns1.example.com\nns2.example.com')
    expect(text).toContain('TXT:\nv=spf1 -all\nsite-verification=abc')
    expect(text).toContain('SOA:\nns1.example.com')
    expect(text).toContain('Unavailable: AAAA, CNAME')
    expect(dnsPromiseMocks.resolveNs).toHaveBeenCalledWith('example.com')
    expect(dnsPromiseMocks.resolveTxt).toHaveBeenCalledWith('example.com')
    expect(dnsPromiseMocks.resolveSoa).toHaveBeenCalledWith('example.com')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'dns-query',
        hostname: 'example.com',
        recordCount: 7,
        failedTypes: ['AAAA', 'CNAME'],
        deep: true
      }
    })
  })

  it('shows degraded DNS query results when no supported records resolve', async () => {
    dnsPromiseMocks.resolve4.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolve6.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveCname.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveMx.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveNs.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveTxt.mockRejectedValue(new Error('ENODATA'))
    dnsPromiseMocks.resolveSoa.mockRejectedValue(new Error('ENODATA'))
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'DNS 查询 missing.example', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('DNS 查询失败')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'dns-query',
        hostname: 'missing.example',
        degradedReason: 'dns-query-no-records'
      }
    })
  })

  it('parses and rejects DNS query hostnames conservatively', async () => {
    const { parseDnsQuery, normalizeDnsHostname, formatDnsQueryInfo } =
      await import('./quick-ops-provider')

    expect(parseDnsQuery('域名解析 https://Sub.Example.com/path')).toEqual({
      hostname: 'sub.example.com',
      deep: false
    })
    expect(parseDnsQuery('DNS 查询 Example.com')).toEqual({
      hostname: 'example.com',
      deep: false
    })
    expect(parseDnsQuery('深度 DNS 查询 Example.com')).toEqual({
      hostname: 'example.com',
      deep: true
    })
    expect(parseDnsQuery('dns localhost')).toBeNull()
    expect(normalizeDnsHostname('bad_host.example')).toBeNull()
    expect(
      formatDnsQueryInfo({
        hostname: 'example.com',
        records: [
          { type: 'A', value: '93.184.216.34' },
          { type: 'MX', value: 'mail.example.com', priority: 10 }
        ],
        failedTypes: ['AAAA'],
        deep: false
      })
    ).toBe('Host: example.com\nA:\n93.184.216.34\nMX:\n10 mail.example.com\nUnavailable: AAAA')
  })

  it('shows local TCP port availability as a safe informational result', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'port 54321', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('端口 54321 可用')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-port-probe',
      type: 'copy',
      payload: {
        text: '127.0.0.1:54321 可用'
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'network',
        operation: 'port-probe',
        riskLevel: 'safe',
        port: 54321,
        host: '127.0.0.1',
        available: true
      }
    })
  })

  it('shows occupied local TCP ports as a degraded notification', async () => {
    const occupied = createServer()
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject)
      occupied.listen({ port: 0, host: '127.0.0.1' }, resolve)
    })
    const address = occupied.address()
    if (!address || typeof address === 'string') {
      occupied.close()
      throw new Error('Expected an occupied TCP port')
    }

    try {
      const { QuickOpsProvider } = await import('./quick-ops-provider')
      const provider = new QuickOpsProvider()

      const result = await provider.onSearch(
        { text: `端口 ${address.port}`, inputs: [] },
        new AbortController().signal
      )

      const item = expectFirstItem(result.items)
      expect(item.kind).toBe('notification')
      expect(item.render.basic?.title).toBe(`端口 ${address.port} 已占用`)
      expect(item.meta?.extension).toMatchObject({
        quickOps: {
          operation: 'port-probe',
          port: address.port,
          available: false,
          degradedReason: 'port-occupied',
          errorCode: 'EADDRINUSE'
        }
      })
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
  })

  it('adds read-only process attribution for occupied local TCP ports', async () => {
    const restorePlatform = mockProcessPlatform('darwin')
    const occupied = createServer()
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject)
      occupied.listen({ port: 0, host: '127.0.0.1' }, resolve)
    })
    const address = occupied.address()
    if (!address || typeof address === 'string') {
      restorePlatform()
      occupied.close()
      throw new Error('Expected an occupied TCP port')
    }

    mockExecFileSuccess('p4321\ncnode\n')

    try {
      const { QuickOpsProvider } = await import('./quick-ops-provider')
      const provider = new QuickOpsProvider()

      const result = await provider.onSearch(
        { text: `port ${address.port}`, inputs: [] },
        new AbortController().signal
      )

      const item = expectFirstItem(result.items)
      expect(item.kind).toBe('notification')
      expect(item.render.basic?.subtitle).toContain('PID 4321 node')
      expect(item.actions?.[0]?.payload?.text).toContain('PID 4321 node')
      expect(item.actions?.[1]).toMatchObject({
        id: 'quick-ops-copy-port-release-command',
        type: 'copy',
        payload: {
          text: 'kill 4321'
        }
      })
      expect(item.meta?.extension).toMatchObject({
        quickOps: {
          operation: 'port-probe',
          port: address.port,
          available: false,
          process: {
            pid: 4321,
            name: 'node',
            command: 'node',
            source: 'lsof'
          },
          degradedReason: 'port-occupied'
        }
      })
    } finally {
      restorePlatform()
      await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
  })

  it('keeps occupied local TCP port results when process attribution fails', async () => {
    const restorePlatform = mockProcessPlatform('darwin')
    const occupied = createServer()
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject)
      occupied.listen({ port: 0, host: '127.0.0.1' }, resolve)
    })
    const address = occupied.address()
    if (!address || typeof address === 'string') {
      restorePlatform()
      occupied.close()
      throw new Error('Expected an occupied TCP port')
    }

    mockExecFileFailure(new Error('lsof unavailable'))

    try {
      const { QuickOpsProvider } = await import('./quick-ops-provider')
      const provider = new QuickOpsProvider()

      const result = await provider.onSearch(
        { text: `port ${address.port}`, inputs: [] },
        new AbortController().signal
      )

      const item = expectFirstItem(result.items)
      expect(item.kind).toBe('notification')
      expect(item.render.basic?.title).toBe(`端口 ${address.port} 已占用`)
      expect(item.actions?.[0]?.payload?.text).toBe(`127.0.0.1:${address.port} 已占用`)
      expect(
        item.actions?.some((action) => action.id === 'quick-ops-copy-port-release-command')
      ).toBe(false)
      expect(item.meta?.extension).toMatchObject({
        quickOps: {
          operation: 'port-probe',
          port: address.port,
          available: false,
          degradedReason: 'port-occupied'
        }
      })
      expect(
        (item.meta?.extension as { quickOps?: { process?: unknown } }).quickOps?.process
      ).toBeUndefined()
    } finally {
      restorePlatform()
      await new Promise<void>((resolve) => occupied.close(() => resolve()))
    }
  })

  it('parses lsof and Windows port process attribution payloads', async () => {
    const { createPortReleaseCommand, parseLsofPortProcessInfo, parseWindowsPortProcessInfo } =
      await import('./quick-ops-provider')

    const lsofInfo = parseLsofPortProcessInfo('p1234\ncTuff\n')
    expect(lsofInfo).toEqual({
      pid: 1234,
      name: 'Tuff',
      command: 'Tuff',
      source: 'lsof'
    })
    expect(lsofInfo ? createPortReleaseCommand(lsofInfo) : null).toBe('kill 1234')

    const windowsInfo = parseWindowsPortProcessInfo(
      '{"Pid":5678,"Name":"Tuff","Path":"C:\\\\Tuff\\\\Tuff.exe"}'
    )
    expect(windowsInfo).toEqual({
      pid: 5678,
      name: 'Tuff',
      command: 'C:\\Tuff\\Tuff.exe',
      source: 'windows-nettcpconnection'
    })
    expect(windowsInfo ? createPortReleaseCommand(windowsInfo) : null).toBe('Stop-Process -Id 5678')
    expect(parseLsofPortProcessInfo('cnode\n')).toBeNull()
    expect(parseWindowsPortProcessInfo('')).toBeNull()
  })

  it('shows invalid port queries as degraded notifications', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'port 70000', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('端口号无效')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'port-probe',
        port: 70000,
        degradedReason: 'invalid-port'
      }
    })
  })

  it('computes file hashes from an explicit path query', async () => {
    const filePath = await createTempFile('demo.txt', 'hello')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: `hash "${filePath}"`, inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('文件 Hash demo.txt')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-file-hash',
      type: 'copy',
      payload: {
        text: [
          'MD5 5d41402abc4b2a76b9719d911017c592',
          'SHA1 aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d',
          'SHA256 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
        ].join('\n')
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'file-hash',
        riskLevel: 'safe',
        path: filePath,
        size: 5,
        md5: '5d41402abc4b2a76b9719d911017c592',
        sha1: 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d',
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      }
    })
  })

  it('computes file hashes from Files input', async () => {
    const filePath = await createTempFile('input.txt', 'abc')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      {
        text: '文件 hash',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([filePath]) }]
      },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.render.basic?.title).toBe('文件 Hash input.txt')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-hash',
        sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
      }
    })
  })

  it('computes file hashes from multiple Files input paths', async () => {
    const firstPath = await createTempFile('first.txt', 'abc')
    const secondPath = await createTempFile('second.txt', 'hello')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      {
        text: '文件 hash',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([firstPath, secondPath]) }]
      },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('文件 Hash 2 个文件')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-file-hash-batch',
      type: 'copy',
      payload: {
        text: expect.stringContaining('first.txt')
      }
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain(
      'SHA256 ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(text).toContain('second.txt')
    expect(text).toContain(
      'SHA256 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    )
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'file-hash',
        riskLevel: 'safe',
        fileCount: 2,
        totalSize: 8,
        files: [
          {
            path: firstPath,
            size: 3,
            sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
          },
          {
            path: secondPath,
            size: 5,
            sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
          }
        ]
      }
    })
  })

  it('shows degraded multi-file hash results when any selected path is invalid', async () => {
    const firstPath = await createTempFile('valid.txt', 'abc')
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      {
        text: '文件 hash',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([firstPath, dir]) }]
      },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('无法计算文件 Hash')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-hash',
        path: dir,
        degradedReason: 'file-hash-not-file'
      }
    })
  })

  it('shows degraded file hash results for missing files and directories', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    const subdir = path.join(dir, 'folder')
    await mkdir(subdir)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const missing = await provider.onSearch(
      { text: `hash "${path.join(dir, 'missing.txt')}"`, inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(missing.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-hash',
        degradedReason: 'file-hash-file-missing'
      }
    })

    const directory = await provider.onSearch(
      { text: `hash "${subdir}"`, inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(directory.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-hash',
        degradedReason: 'file-hash-not-file'
      }
    })
  })

  it('copies Base64 for an explicit file path query', async () => {
    const filePath = await createTempFile('encoded.txt', 'hello')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: `file base64 "${filePath}"`, inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('文件 Base64 encoded.txt')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-file-base64',
      type: 'copy',
      primary: true,
      payload: {
        text: 'aGVsbG8='
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'file-base64',
        riskLevel: 'safe',
        path: filePath,
        size: 5
      }
    })
  })

  it('copies Base64 from a single Files input path', async () => {
    const filePath = await createTempFile('input.bin', 'abc')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      {
        text: '文件 base64',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([filePath]) }]
      },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.render.basic?.title).toBe('文件 Base64 input.bin')
    expect(item.actions?.[0]?.payload?.text).toBe('YWJj')
  })

  it('copies Base64 summaries from multiple Files input paths', async () => {
    const firstPath = await createTempFile('first.txt', 'abc')
    const secondPath = await createTempFile('second.txt', 'xyz')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      {
        text: '文件 base64',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([firstPath, secondPath]) }]
      },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('文件 Base64 2 个文件')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-file-base64-batch',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('first.txt')
    expect(text).toContain('YWJj')
    expect(text).toContain('second.txt')
    expect(text).toContain('eHl6')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'file-base64',
        riskLevel: 'safe',
        fileCount: 2,
        totalSize: 6
      }
    })
  })

  it('shows degraded Base64 results for invalid targets', async () => {
    const filePath = await createTempFile('valid.txt', 'abc')
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const missing = await provider.onSearch(
      { text: `file base64 "${path.join(dir, 'missing.txt')}"`, inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(missing.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-base64',
        degradedReason: 'file-base64-file-missing'
      }
    })

    const directory = await provider.onSearch(
      { text: `file base64 "${dir}"`, inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(directory.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-base64',
        degradedReason: 'file-base64-not-file'
      }
    })

    const multiple = await provider.onSearch(
      {
        text: '文件 base64',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([filePath, dir]) }]
      },
      new AbortController().signal
    )
    expect(expectFirstItem(multiple.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-base64',
        degradedReason: 'file-base64-not-file',
        path: dir
      }
    })
  })

  it('guards Base64 encoding with a file size limit', async () => {
    const { encodeFileBase64 } = await import('./quick-ops-provider')
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    const filePath = path.join(dir, 'large.bin')
    await writeFile(filePath, Buffer.alloc(1024 * 1024 + 1))

    await expect(encodeFileBase64(filePath)).resolves.toMatchObject({
      degradedReason: 'file-base64-too-large'
    })
  })

  it('decodes Base64 into a temporary file from an explicit query', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'temp' ? dir : `/mock/${name}`
    )
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'))
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'base64 decode file aGVsbG8=', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    const outputPath = path.join(dir, 'tuff-quickops', 'base64-1781784000000-decoded-base64.bin')
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('Base64 已解码为 base64-1781784000000-decoded-base64.bin')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-open-base64-decoded-file',
      type: 'open',
      primary: true,
      payload: {
        path: outputPath
      }
    })
    expect(item.actions?.[1]).toMatchObject({
      id: 'quick-ops-copy-base64-decoded-path',
      type: 'copy',
      payload: {
        text: outputPath
      }
    })
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('hello')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'file-base64-decode',
        riskLevel: 'safe',
        path: outputPath,
        size: 5
      }
    })
  })

  it('shows degraded Base64 decode results for invalid and oversized payloads', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'temp' ? dir : `/mock/${name}`
    )
    const { QuickOpsProvider, decodeFileBase64ToTempFile } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const invalid = await provider.onSearch(
      { text: 'base64 decode file not-base64', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(invalid.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-base64-decode',
        degradedReason: 'file-base64-decode-invalid-input'
      }
    })

    await expect(
      decodeFileBase64ToTempFile(Buffer.alloc(1024 * 1024 + 1).toString('base64'))
    ).resolves.toMatchObject({
      degradedReason: 'file-base64-decode-too-large'
    })
  })

  it('formats file paths from an explicit path query', async () => {
    const filePath = await createTempFile("demo file's.txt", 'path')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: `copy path "${filePath}"`, inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe("复制路径 demo file's.txt")
    expect(item.actions?.map((action) => action.id)).toEqual([
      'quick-ops-copy-file-path',
      'quick-ops-copy-file-shell-path',
      'quick-ops-copy-file-url',
      'quick-ops-copy-file-path-all'
    ])
    expect(item.actions?.[0]).toMatchObject({
      type: 'copy',
      payload: {
        text: filePath
      }
    })
    expect(item.actions?.[1]?.payload).toMatchObject({
      text: `'${filePath.replace(/'/g, "'\\''")}'`
    })
    expect(item.actions?.[2]?.payload).toMatchObject({
      text: pathToFileURL(filePath).href
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'file-path',
        riskLevel: 'safe',
        path: filePath,
        shellPath: `'${filePath.replace(/'/g, "'\\''")}'`,
        fileUrl: pathToFileURL(filePath).href
      }
    })
  })

  it('adds WSL path formatting for Windows paths', async () => {
    const windowsPath = 'C:\\Users\\Boss\\Documents\\demo file.txt'
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: `copy path "${windowsPath}"`, inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('复制路径 demo file.txt')
    expect(item.actions?.map((action) => action.id)).toEqual([
      'quick-ops-copy-file-path',
      'quick-ops-copy-file-shell-path',
      'quick-ops-copy-file-url',
      'quick-ops-copy-file-wsl-path',
      'quick-ops-copy-file-path-all'
    ])
    expect(item.actions?.[3]).toMatchObject({
      type: 'copy',
      payload: {
        text: '/mnt/c/Users/Boss/Documents/demo file.txt'
      }
    })
    expect(item.actions?.[4]?.payload).toMatchObject({
      text: expect.stringContaining('/mnt/c/Users/Boss/Documents/demo file.txt')
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-path',
        path: windowsPath,
        wslPath: '/mnt/c/Users/Boss/Documents/demo file.txt'
      }
    })
  })

  it('adds Windows path formatting for WSL mount paths', async () => {
    const wslPath = '/mnt/d/Workspace/demo file.txt'
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: `copy path "${wslPath}"`, inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.actions?.map((action) => action.id)).toEqual([
      'quick-ops-copy-file-path',
      'quick-ops-copy-file-shell-path',
      'quick-ops-copy-file-url',
      'quick-ops-copy-file-windows-path',
      'quick-ops-copy-file-path-all'
    ])
    expect(item.actions?.[3]).toMatchObject({
      type: 'copy',
      payload: {
        text: 'D:\\Workspace\\demo file.txt'
      }
    })
    expect(item.actions?.[4]?.payload).toMatchObject({
      text: expect.stringContaining('D:\\Workspace\\demo file.txt')
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-path',
        path: wslPath,
        windowsPath: 'D:\\Workspace\\demo file.txt'
      }
    })
  })

  it('formats file paths from Files input and degrades without a target', async () => {
    const filePath = await createTempFile('input-path.txt', 'path')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const fromInput = await provider.onSearch(
      {
        text: '复制文件路径',
        inputs: [{ type: TuffInputType.Files, content: JSON.stringify([filePath]) }]
      },
      new AbortController().signal
    )

    expect(expectFirstItem(fromInput.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-path',
        path: filePath,
        fileUrl: pathToFileURL(filePath).href
      }
    })

    const withoutTarget = await provider.onSearch(
      { text: 'copy path', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(withoutTarget.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'file-path',
        degradedReason: 'file-path-missing-file'
      }
    })
  })

  it('opens common directories through open actions', async () => {
    electronMocks.getPath.mockImplementation((name: string) => `/quickops/${name}`)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const downloads = await provider.onSearch(
      { text: 'open downloads', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(downloads.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('打开下载目录')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-open-common-directory',
      type: 'open',
      primary: true,
      payload: {
        path: '/quickops/downloads'
      }
    })
    expect(item.actions?.[1]).toMatchObject({
      id: 'quick-ops-copy-common-directory-path',
      type: 'copy',
      payload: {
        text: '/quickops/downloads'
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'open-common-directory',
        riskLevel: 'safe',
        directoryId: 'downloads',
        path: '/quickops/downloads'
      }
    })
  })

  it('opens the most recent downloaded file with copy-only path actions', async () => {
    fsMocks.readdir.mockImplementation(async (targetPath: string, options?: unknown) => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readdir(targetPath, options as Parameters<typeof actual.readdir>[1])
    })
    const root = await mkdtemp(path.join(tmpdir(), 'quick-ops-downloads-'))
    tempDirs.push(root)
    const downloads = path.join(root, 'Downloads')
    await mkdir(path.join(downloads, 'folder'), { recursive: true })
    const oldFile = path.join(downloads, 'old.zip')
    const latestFile = path.join(downloads, 'latest.dmg')
    await writeFile(oldFile, 'old')
    await writeFile(latestFile, 'latest')
    const oldDate = new Date('2024-01-01T00:00:00Z')
    const latestDate = new Date('2024-02-01T00:00:00Z')
    const { utimes } = await import('node:fs/promises')
    await Promise.all([
      utimes(oldFile, oldDate, oldDate),
      utimes(latestFile, latestDate, latestDate)
    ])
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'downloads' ? downloads : `/mock/${name}`
    )
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'recent download', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('最近下载 latest.dmg')
    expect(item.render.basic?.subtitle).toContain('QuickOps Files')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-open-recent-download',
      type: 'open',
      primary: true,
      payload: {
        path: latestFile
      }
    })
    expect(item.actions?.[1]).toMatchObject({
      id: 'quick-ops-open-recent-download-folder',
      type: 'open',
      payload: {
        path: downloads
      }
    })
    expect(item.actions?.[2]).toMatchObject({
      id: 'quick-ops-copy-recent-download-path',
      type: 'copy',
      payload: {
        text: latestFile
      }
    })
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'recent-download',
        riskLevel: 'safe',
        path: latestFile,
        size: 6
      }
    })

    const openDownloads = await provider.onSearch(
      { text: 'open downloads', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(openDownloads.items))).toMatchObject({
      operation: 'open-common-directory',
      directoryId: 'downloads',
      path: downloads
    })
  })

  it('moves the most recent downloaded file only through a dangerous confirmed execute action', async () => {
    fsMocks.readdir.mockImplementation(async (targetPath: string, options?: unknown) => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readdir(targetPath, options as Parameters<typeof actual.readdir>[1])
    })
    const root = await mkdtemp(path.join(tmpdir(), 'quick-ops-download-move-'))
    tempDirs.push(root)
    const downloads = path.join(root, 'Downloads')
    const target = path.join(root, 'Archive')
    await mkdir(downloads, { recursive: true })
    await mkdir(target, { recursive: true })
    const latestFile = path.join(downloads, 'latest.zip')
    await writeFile(latestFile, 'latest')
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'downloads' ? downloads : `/mock/${name}`
    )
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: `move recent download to "${target}"`, inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    const targetPath = path.join(target, 'latest.zip')
    expect(item.kind).toBe('action')
    expect(item.render.basic?.title).toBe('移动最近下载 latest.zip')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-move-recent-download',
      type: 'execute',
      primary: true,
      confirm: {
        title: '移动最近下载文件',
        danger: true
      }
    })
    expect(item.actions?.[0]?.confirm?.message).toContain(targetPath)
    expect(getQuickOpsMeta(item)).toMatchObject({
      category: 'files',
      operation: 'recent-download-move',
      riskLevel: 'dangerous',
      sourcePath: latestFile,
      targetDirectory: target,
      targetPath
    })

    await provider.onExecute({
      item,
      actionId: 'quick-ops-move-recent-download'
    } satisfies IExecuteArgs)

    await expect(stat(latestFile)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(targetPath, 'utf8')).toBe('latest')
    expect(notificationMocks.showInternalSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 已移动文件',
        level: 'success',
        meta: {
          quickOps: expect.objectContaining({
            operation: 'recent-download-move',
            sourcePath: latestFile,
            targetPath
          })
        }
      })
    )
  })

  it('degrades recent download move when target is missing or would overwrite a file', async () => {
    fsMocks.readdir.mockImplementation(async (targetPath: string, options?: unknown) => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readdir(targetPath, options as Parameters<typeof actual.readdir>[1])
    })
    const root = await mkdtemp(path.join(tmpdir(), 'quick-ops-download-move-edge-'))
    tempDirs.push(root)
    const downloads = path.join(root, 'Downloads')
    const target = path.join(root, 'Archive')
    await mkdir(downloads, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(path.join(downloads, 'latest.zip'), 'latest')
    await writeFile(path.join(target, 'latest.zip'), 'exists')
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'downloads' ? downloads : `/mock/${name}`
    )
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const overwrite = await provider.onSearch(
      { text: `移动最近下载到 "${target}"`, inputs: [] },
      new AbortController().signal
    )

    expect(expectFirstItem(overwrite.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'recent-download-move',
        riskLevel: 'dangerous',
        degradedReason: 'recent-download-move-target-exists'
      }
    })

    const missingTarget = await provider.onSearch(
      { text: `move latest download to "${path.join(root, 'Missing')}"`, inputs: [] },
      new AbortController().signal
    )

    const missingItem = expectFirstItem(missingTarget.items)
    expect(missingItem.kind).toBe('notification')
    expect(missingItem.render.basic?.title).toBe('无法移动最近下载文件')
    expect(missingItem.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'recent-download-move',
        degradedReason: 'recent-download-move-target-missing'
      }
    })
  })

  it('shows degraded recent download results for empty or unreadable downloads folders', async () => {
    fsMocks.readdir.mockResolvedValue([])
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const empty = await provider.onSearch(
      { text: '最近下载文件', inputs: [] },
      new AbortController().signal
    )

    expect(expectFirstItem(empty.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'recent-download',
        degradedReason: 'recent-download-empty'
      }
    })

    fsMocks.readdir.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
    const denied = await provider.onSearch(
      { text: 'latest download', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(denied.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('未找到最近下载文件')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'recent-download',
        degradedReason: 'recent-download-permission-denied'
      }
    })
  })

  it('resolves app data and logs common directories', async () => {
    electronMocks.getPath.mockImplementation((name: string) => `/quickops/${name}`)
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const appData = await provider.onSearch(
      { text: '打开应用数据', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(appData.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'open-common-directory',
        directoryId: 'app-data',
        path: '/quickops/userData'
      }
    })

    const logs = await provider.onSearch(
      { text: 'logs folder', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(logs.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'open-common-directory',
        directoryId: 'logs',
        path: '/quickops/logs'
      }
    })
  })

  it('creates temporary scratch text files under the app temp directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'temp' ? dir : `/mock/${name}`
    )
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'))
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'scratch note hello boss', inputs: [] },
      new AbortController().signal
    )

    const outputPath = path.join(dir, 'tuff-quickops', 'scratch-1781784000000.txt')
    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('临时文本 scratch-1781784000000.txt')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-open-temp-text-file',
      type: 'open',
      primary: true,
      payload: {
        path: outputPath
      }
    })
    expect(item.actions?.[1]).toMatchObject({
      id: 'quick-ops-copy-temp-text-file-path',
      type: 'copy',
      payload: {
        text: outputPath
      }
    })
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('hello boss')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'temp-text-file',
        riskLevel: 'safe',
        path: outputPath,
        size: 10
      }
    })
  })

  it('creates temporary directories with sanitized names under the app temp directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(dir)
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'temp' ? dir : `/mock/${name}`
    )
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: '临时目录 demo workspace', inputs: [] },
      new AbortController().signal
    )

    const outputPath = path.join(dir, 'tuff-quickops', 'demo-workspace')
    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('临时目录 demo-workspace')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-open-temp-directory',
      type: 'open',
      primary: true,
      payload: {
        path: outputPath
      }
    })
    await expect(stat(outputPath).then((value) => value.isDirectory())).resolves.toBe(true)
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'files',
        operation: 'temp-directory',
        riskLevel: 'safe',
        path: outputPath
      }
    })
  })

  it('guards temporary scratch text files with a size limit', async () => {
    const { createTempTextFile } = await import('./quick-ops-provider')

    await expect(createTempTextFile('x'.repeat(64 * 1024 + 1))).resolves.toMatchObject({
      degradedReason: 'temp-text-file-too-large'
    })
  })

  it('copies redacted Tuff diagnostics without raw home paths or config dumps', async () => {
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'logs'
        ? '/Users/tester/Library/Logs/Tuff'
        : '/Users/tester/Library/Application Support/Tuff'
    )
    electronMocks.getVersion.mockReturnValue('2.4.12-beta.8')
    osMocks.homedir.mockReturnValue('/Users/tester')
    process.env.HTTPS_PROXY = 'https://user:secret@example.proxy:8443'
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'tuff diagnostics', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('复制 Tuff 诊断信息')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-diagnostics',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('Schema: quickops-diagnostics/v2')
    expect(text).toContain('Tuff 2.4.12-beta.8')
    expect(text).toContain('OS: Darwin 25.5.0-test')
    expect(text).toContain('Runtime: Node')
    expect(text).toContain('CPU: 2 logical cores')
    expect(text).toContain('Memory: 4.00 GB free / 16.0 GB total')
    expect(text).toContain('Home: ~')
    expect(text).toContain('UserData: ~/Library/Application Support/Tuff')
    expect(text).toContain('Logs: ~/Library/Logs/Tuff')
    expect(text).toContain('Network: localAddresses=2, dnsServers=2, proxy=detected')
    expect(text).toContain('Proxy Sources: HTTPS_PROXY')
    expect(text).toContain('QuickOps: enabled=true')
    expect(text).toContain('Defaults:')
    expect(text).toContain(
      'Safety: redacted paths only; no log contents; no full configuration dump'
    )
    expect(text).not.toContain('/Users/tester')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('example.proxy')
    expect(text).not.toContain('quickOps":')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'tuff-diagnostics',
        riskLevel: 'safe',
        schemaVersion: 2,
        appVersion: '2.4.12-beta.8',
        userDataDir: '~/Library/Application Support/Tuff',
        logsDir: '~/Library/Logs/Tuff',
        localAddressCount: 2,
        dnsServerCount: 2,
        proxyStatus: 'detected',
        redacted: true
      }
    })
  })

  it('copies safe system information without reading sensitive paths', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'system info', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('复制系统信息')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-system-info',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('OS: Darwin 25.5.0-test')
    expect(text).toContain('Platform:')
    expect(text).toContain('CPU: Apple M Test x2')
    expect(text).toContain('Memory: 4.00 GB free / 16.0 GB total')
    expect(text).toContain('Uptime:')
    expect(text).toContain('Load Average: 1.25, 2.50, 3.75')
    expect(text).not.toContain('/Users/tester')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'system-info',
        riskLevel: 'safe',
        osType: 'Darwin',
        osRelease: '25.5.0-test',
        cpuCount: 2,
        totalMemoryBytes: 16 * 1024 * 1024 * 1024
      }
    })
  })

  it('copies safe disk space summaries with redacted paths', async () => {
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'userData' ? '/Users/tester/Library/Application Support/Tuff' : `/mock/${name}`
    )
    osMocks.homedir.mockReturnValue('/Users/tester')
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'disk space', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('复制磁盘空间')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-disk-space',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('Home: ~')
    expect(text).toContain('Free: 5.00 GB')
    expect(text).toContain('Used: 15.0 GB (75%)')
    expect(text).toContain('Tuff Data: ~/Library/Application Support/Tuff')
    expect(text).toContain('Free: 2.00 GB')
    expect(text).not.toContain('/Users/tester')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'disk-space',
        riskLevel: 'safe',
        entries: [
          {
            label: 'Home',
            path: '~',
            totalBytes: 20 * 1024 * 1024 * 1024,
            freeBytes: 5 * 1024 * 1024 * 1024,
            usedBytes: 15 * 1024 * 1024 * 1024,
            usedPercent: 75
          },
          {
            label: 'Tuff Data',
            path: '~/Library/Application Support/Tuff',
            totalBytes: 10 * 1024 * 1024 * 1024,
            freeBytes: 2 * 1024 * 1024 * 1024,
            usedBytes: 8 * 1024 * 1024 * 1024,
            usedPercent: 80
          }
        ]
      }
    })
  })

  it('shows degraded disk space results when filesystem stats fail', async () => {
    fsMocks.statfs.mockRejectedValue(new Error('statfs failed'))
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: '磁盘空间', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('无法读取磁盘空间')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'disk-space',
        riskLevel: 'safe',
        degradedReason: 'disk-space-read-failed'
      }
    })
  })

  it('copies bounded directory usage summaries with redacted paths', async () => {
    fsMocks.readdir.mockImplementation(async (targetPath: string, options?: unknown) => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readdir(targetPath, options as Parameters<typeof actual.readdir>[1])
    })
    const root = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(root)
    const desktop = path.join(root, 'Desktop')
    const downloads = path.join(root, 'Downloads')
    const documents = path.join(root, 'Documents')
    const userData = path.join(root, 'Library/Application Support/Tuff')
    const logs = path.join(root, 'Library/Logs/Tuff')
    await Promise.all([
      mkdir(path.join(desktop, 'nested'), { recursive: true }),
      mkdir(downloads, { recursive: true }),
      mkdir(documents, { recursive: true }),
      mkdir(userData, { recursive: true }),
      mkdir(logs, { recursive: true })
    ])
    await Promise.all([
      writeFile(path.join(desktop, 'a.txt'), 'abcd'),
      writeFile(path.join(desktop, 'b.txt'), '123456'),
      writeFile(path.join(downloads, 'download.bin'), '12'),
      symlink(path.join(desktop, 'a.txt'), path.join(desktop, 'a-link'))
    ])
    osMocks.homedir.mockReturnValue(root)
    electronMocks.getPath.mockImplementation((name: string) => {
      if (name === 'desktop') return desktop
      if (name === 'downloads') return downloads
      if (name === 'documents') return documents
      if (name === 'userData') return userData
      if (name === 'logs') return logs
      return `/mock/${name}`
    })
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: '目录占用', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('复制关键目录占用')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-directory-usage',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('Scan: direct children only, max 200 entries per directory')
    expect(text).toContain('Desktop: ~/Desktop')
    expect(text).toContain('Direct file size: 10 B')
    expect(text).toContain('Entries: 2 files, 1 directories, 1 other')
    expect(text).toContain('Tuff Data: ~/Library/Application Support/Tuff')
    expect(text).not.toContain(root)
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'directory-usage',
        riskLevel: 'safe',
        maxEntriesPerDirectory: 200,
        scanDepth: 1,
        entries: expect.arrayContaining([
          expect.objectContaining({
            label: 'Desktop',
            path: '~/Desktop',
            directFileBytes: 10,
            fileCount: 2,
            directoryCount: 1,
            otherCount: 1,
            scannedEntryCount: 4,
            truncated: false
          })
        ])
      }
    })
  })

  it('copies bounded recursive directory usage summaries on explicit deep query', async () => {
    fsMocks.readdir.mockImplementation(async (targetPath: string, options?: unknown) => {
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readdir(targetPath, options as Parameters<typeof actual.readdir>[1])
    })
    const root = await mkdtemp(path.join(tmpdir(), 'quick-ops-'))
    tempDirs.push(root)
    const desktop = path.join(root, 'Desktop')
    const downloads = path.join(root, 'Downloads')
    const documents = path.join(root, 'Documents')
    const userData = path.join(root, 'Library/Application Support/Tuff')
    const logs = path.join(root, 'Library/Logs/Tuff')
    await Promise.all([
      mkdir(path.join(desktop, 'nested/deeper'), { recursive: true }),
      mkdir(downloads, { recursive: true }),
      mkdir(documents, { recursive: true }),
      mkdir(userData, { recursive: true }),
      mkdir(logs, { recursive: true })
    ])
    await Promise.all([
      writeFile(path.join(desktop, 'root.txt'), 'abcd'),
      writeFile(path.join(desktop, 'nested', 'child.txt'), '123456'),
      writeFile(path.join(desktop, 'nested/deeper', 'deep.txt'), 'xy')
    ])
    osMocks.homedir.mockReturnValue(root)
    electronMocks.getPath.mockImplementation((name: string) => {
      if (name === 'desktop') return desktop
      if (name === 'downloads') return downloads
      if (name === 'documents') return documents
      if (name === 'userData') return userData
      if (name === 'logs') return logs
      return `/mock/${name}`
    })
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'deep directory usage', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.subtitle).toContain('depth 3')
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain(
      'Scan: recursive depth 3, max 200 entries per directory, max 1000 entries total'
    )
    expect(text).toContain('Desktop: ~/Desktop')
    expect(text).toContain('Direct file size: 4 B')
    expect(text).toContain('Recursive file size: 12 B')
    expect(text).toContain('Entries: 3 files, 2 directories, 0 other')
    expect(text).not.toContain(root)
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'directory-usage',
        riskLevel: 'safe',
        maxEntriesPerDirectory: 200,
        maxTotalEntries: 1000,
        scanDepth: 3,
        entries: expect.arrayContaining([
          expect.objectContaining({
            label: 'Desktop',
            path: '~/Desktop',
            directFileBytes: 4,
            totalFileBytes: 12,
            fileCount: 3,
            directoryCount: 2,
            otherCount: 0
          })
        ])
      }
    })
  })

  it('shows degraded directory usage results when scanning fails', async () => {
    const { createDirectoryUsageInfo, QuickOpsProvider } = await import('./quick-ops-provider')
    const denied = Object.assign(new Error('permission denied'), {
      code: 'EACCES',
      path: '/Users/tester/private'
    })
    fsMocks.readdir.mockRejectedValue(denied)
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'directory usage', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('无法读取关键目录占用')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        operation: 'directory-usage',
        degradedReason: 'directory-usage-permission-denied',
        path: '~/private',
        scanDepth: 1
      }
    })
    await expect(
      createDirectoryUsageInfo([{ label: 'Private', path: '/Users/tester/private' }])
    ).resolves.toMatchObject({
      degradedReason: 'directory-usage-permission-denied',
      message: '没有权限读取目录',
      path: '/Users/tester/private'
    })

    const deepResult = await provider.onSearch(
      { text: '深度目录占用', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(deepResult.items).meta?.extension).toMatchObject({
      quickOps: {
        operation: 'directory-usage',
        degradedReason: 'directory-usage-permission-denied',
        scanDepth: 3
      }
    })
  })

  it('copies battery status from macOS pmset output', async () => {
    const restorePlatform = mockProcessPlatform('darwin')
    mockExecFileSuccess(
      "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t82%; discharging; 4:12 remaining present: true\n"
    )
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: 'battery status', inputs: [] },
      new AbortController().signal
    )
    restorePlatform()

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('result')
    expect(item.render.basic?.title).toBe('电池状态 82%')
    expect(item.actions?.[0]).toMatchObject({
      id: 'quick-ops-copy-battery-status',
      type: 'copy',
      primary: true
    })
    const text = item.actions?.[0]?.payload?.text
    expect(text).toContain('Level: 82%')
    expect(text).toContain('Charging: no')
    expect(text).toContain('Status: discharging')
    expect(text).toContain('Source: macos-pmset')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'battery-status',
        riskLevel: 'safe',
        levelPercent: 82,
        charging: false,
        status: 'discharging',
        source: 'macos-pmset'
      }
    })
  })

  it('notifies when battery status is low and discharging', async () => {
    const restorePlatform = mockProcessPlatform('darwin')
    mockExecFileSuccess(
      "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t15%; discharging; 0:42 remaining present: true\n"
    )
    const notifyLowBattery = vi.fn()
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider(undefined, undefined, notifyLowBattery)

    const result = await provider.onSearch(
      { text: 'battery status', inputs: [] },
      new AbortController().signal
    )
    restorePlatform()

    expect(expectFirstItem(result.items).render.basic?.title).toBe('电池状态 15%')
    expect(notifyLowBattery).toHaveBeenCalledWith({
      levelPercent: 15,
      charging: false,
      status: 'discharging',
      source: 'macos-pmset'
    })
  })

  it('does not notify for charging or healthy battery status', async () => {
    const { parseMacBatteryStatus, shouldNotifyLowBattery } = await import('./quick-ops-provider')

    expect(
      shouldNotifyLowBattery(parseMacBatteryStatus(' -InternalBattery-0\t19%; charging;')!)
    ).toBe(false)
    expect(
      shouldNotifyLowBattery(parseMacBatteryStatus(' -InternalBattery-0\t21%; discharging;')!)
    ).toBe(false)
  })

  it('shows degraded battery status results when no battery source is available', async () => {
    const restorePlatform = mockProcessPlatform('linux')
    fsMocks.readdir.mockResolvedValue([])
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const result = await provider.onSearch(
      { text: '电池状态', inputs: [] },
      new AbortController().signal
    )
    restorePlatform()

    const item = expectFirstItem(result.items)
    expect(item.kind).toBe('notification')
    expect(item.render.basic?.title).toBe('无法读取电池状态')
    expect(item.meta?.extension).toMatchObject({
      quickOps: {
        category: 'system',
        operation: 'battery-status',
        riskLevel: 'safe',
        degradedReason: 'battery-status-read-failed'
      }
    })
  })

  it('parses Windows and Linux battery status payloads', async () => {
    const { parseLinuxBatteryStatus, parseWindowsBatteryStatus } =
      await import('./quick-ops-provider')

    expect(
      parseWindowsBatteryStatus('{"EstimatedChargeRemaining":67,"BatteryStatus":6}')
    ).toMatchObject({
      levelPercent: 67,
      charging: true,
      status: 'Charging',
      source: 'windows-cim'
    })
    expect(parseLinuxBatteryStatus('45\n', 'Discharging\n')).toMatchObject({
      levelPercent: 45,
      charging: false,
      status: 'Discharging',
      source: 'linux-sysfs'
    })
  })

  it('starts and stops keep-awake through powerSaveBlocker', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const result = await provider.onSearch(
      { text: '禁止息屏 1小时', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(result.items) } satisfies IExecuteArgs)
    expect(electronMocks.start).toHaveBeenCalledWith('prevent-display-sleep')
    expect(electronMocks.started.has(1)).toBe(true)

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(status.items))?.action).toBe('keep-awake-stop')

    const stop = await provider.onSearch(
      { text: '停止保持唤醒', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(stop.items) } satisfies IExecuteArgs)

    expect(electronMocks.stop).toHaveBeenCalledWith(1)
    expect(electronMocks.started.has(1)).toBe(false)
  })

  it('expires keep-awake sessions automatically', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const result = await provider.onSearch(
      { text: 'caffeine 5s', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(result.items) } satisfies IExecuteArgs)
    expect(electronMocks.started.has(1)).toBe(true)

    vi.advanceTimersByTime(5_000)

    expect(electronMocks.stop).toHaveBeenCalledWith(1)
    expect(electronMocks.started.has(1)).toBe(false)
  })

  it('extends an active keep-awake session without restarting the blocker', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const start = await provider.onSearch(
      { text: 'keep awake 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)

    const extend = await provider.onSearch(
      { text: '延长保持唤醒 15分钟', inputs: [] },
      new AbortController().signal
    )
    const extendItem = expectFirstItem(extend.items)
    expect(getQuickOpsMeta(extendItem)).toEqual({
      action: 'keep-awake-extend',
      durationMs: 15 * 60 * 1000,
      riskLevel: 'stateful'
    })

    await provider.onExecute({ item: extendItem } satisfies IExecuteArgs)

    expect(electronMocks.start).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(electronMocks.started.has(1)).toBe(true)

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(electronMocks.stop).toHaveBeenCalledWith(1)
    expect(electronMocks.started.has(1)).toBe(false)
  })

  it('starts system-awake sessions with app suspension blocker', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const result = await provider.onSearch(
      { text: '禁止系统睡眠 30分钟', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'system-awake-start',
      durationMs: 30 * 60 * 1000,
      riskLevel: 'stateful'
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(electronMocks.start).toHaveBeenCalledWith('prevent-app-suspension')
    expect(electronMocks.started.has(1)).toBe(true)

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const stopItem = expectFirstItem(status.items)
    expect(stopItem.render.basic?.title).toBe('防止系统睡眠运行中')
    expect(getQuickOpsMeta(stopItem)?.action).toBe('system-awake-stop')

    await provider.onExecute({ item: stopItem } satisfies IExecuteArgs)

    expect(electronMocks.stop).toHaveBeenCalledWith(1)
    expect(electronMocks.started.has(1)).toBe(false)
  })

  it('keeps display and system awake sessions independent', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const keepAwake = await provider.onSearch(
      { text: 'keep awake 10m', inputs: [] },
      new AbortController().signal
    )
    const systemAwake = await provider.onSearch(
      { text: 'prevent system sleep 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(keepAwake.items) } satisfies IExecuteArgs)
    await provider.onExecute({ item: expectFirstItem(systemAwake.items) } satisfies IExecuteArgs)

    expect(electronMocks.start).toHaveBeenNthCalledWith(1, 'prevent-display-sleep')
    expect(electronMocks.start).toHaveBeenNthCalledWith(2, 'prevent-app-suspension')
    expect(electronMocks.started.has(1)).toBe(true)
    expect(electronMocks.started.has(2)).toBe(true)

    const stopSystem = await provider.onSearch(
      { text: '停止禁止系统睡眠', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(stopSystem.items) } satisfies IExecuteArgs)

    expect(electronMocks.started.has(1)).toBe(true)
    expect(electronMocks.started.has(2)).toBe(false)
  })

  it('starts timer sessions and exposes a stop item', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const result = await provider.onSearch(
      { text: 'timer 10m', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'timer-start',
      durationMs: 10 * 60 * 1000,
      riskLevel: 'stateful'
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)
    const status = await provider.onSearch(
      { text: 'quick ops status', inputs: [] },
      new AbortController().signal
    )

    const stopItem = expectFirstItem(status.items)
    expect(stopItem.render.basic?.title).toBe('计时器运行中')
    expect(getQuickOpsMeta(stopItem)?.action).toBe('timer-stop')
  })

  it('extends an active timer session and delays the finish notification', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const start = await provider.onSearch(
      { text: 'timer 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)

    const extend = await provider.onSearch(
      { text: '延长计时 5分钟', inputs: [] },
      new AbortController().signal
    )
    const extendItem = expectFirstItem(extend.items)
    expect(getQuickOpsMeta(extendItem)).toEqual({
      action: 'timer-extend',
      durationMs: 5 * 60 * 1000,
      riskLevel: 'stateful'
    })

    await provider.onExecute({ item: extendItem } satisfies IExecuteArgs)
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(notify).not.toHaveBeenCalled()

    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 计时结束',
        message: '15分钟计时已结束'
      })
    )
  })

  it('starts a default snooze timer when extending without an active timer', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const result = await provider.onSearch(
      { text: 'snooze timer', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'timer-extend',
      durationMs: 5 * 60 * 1000,
      riskLevel: 'stateful'
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)
    vi.advanceTimersByTime(5 * 60 * 1000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '5分钟计时已结束'
      })
    )
  })

  it('pauses and resumes an active timer session', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const start = await provider.onSearch(
      { text: 'timer 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(4 * 60 * 1000)

    const pause = await provider.onSearch(
      { text: '暂停计时', inputs: [] },
      new AbortController().signal
    )
    const pauseItem = expectFirstItem(pause.items)
    expect(getQuickOpsMeta(pauseItem)).toEqual({
      action: 'timer-pause',
      riskLevel: 'stateful'
    })
    await provider.onExecute({ item: pauseItem } satisfies IExecuteArgs)

    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(notify).not.toHaveBeenCalled()

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(status.items).render.basic?.title).toBe('计时器暂停中')

    const resume = await provider.onSearch(
      { text: '继续计时', inputs: [] },
      new AbortController().signal
    )
    const resumeItem = expectFirstItem(resume.items)
    expect(getQuickOpsMeta(resumeItem)).toEqual({
      action: 'timer-resume',
      riskLevel: 'stateful'
    })
    await provider.onExecute({ item: resumeItem } satisfies IExecuteArgs)

    vi.advanceTimersByTime(6 * 60 * 1000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '10分钟计时已结束'
      })
    )
  })

  it('extends a paused timer without counting paused wall-clock time', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const start = await provider.onSearch(
      { text: 'timer 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(4 * 60 * 1000)

    const pause = await provider.onSearch(
      { text: 'pause timer', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(pause.items) } satisfies IExecuteArgs)

    const extend = await provider.onSearch(
      { text: 'extend timer 5m', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(extend.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(notify).not.toHaveBeenCalled()

    const resume = await provider.onSearch(
      { text: 'resume timer', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(resume.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(11 * 60 * 1000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '15分钟计时已结束'
      })
    )
  })

  it('starts pomodoro sessions with default focus duration and exposes status', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const result = await provider.onSearch(
      { text: '番茄钟', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'pomodoro-start',
      durationMs: 25 * 60 * 1000,
      riskLevel: 'stateful'
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)
    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )

    const stopItem = expectFirstItem(status.items)
    expect(stopItem.render.basic?.title).toBe('番茄钟运行中')
    expect(stopItem.render.basic?.subtitle).toContain('剩余 25分钟')
    expect(getQuickOpsMeta(stopItem)?.action).toBe('pomodoro-stop')
  })

  it('pauses and resumes pomodoro without counting paused wall-clock time', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const start = await provider.onSearch(
      { text: 'pomodoro 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(4 * 60 * 1000)

    const pause = await provider.onSearch(
      { text: '暂停番茄钟', inputs: [] },
      new AbortController().signal
    )
    const pauseItem = expectFirstItem(pause.items)
    expect(getQuickOpsMeta(pauseItem)).toEqual({
      action: 'pomodoro-pause',
      riskLevel: 'stateful'
    })
    await provider.onExecute({ item: pauseItem } satisfies IExecuteArgs)

    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(notify).not.toHaveBeenCalled()

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(status.items).render.basic?.title).toBe('番茄钟暂停中')

    const resume = await provider.onSearch(
      { text: '继续番茄钟', inputs: [] },
      new AbortController().signal
    )
    const resumeItem = expectFirstItem(resume.items)
    expect(getQuickOpsMeta(resumeItem)).toEqual({
      action: 'pomodoro-resume',
      riskLevel: 'stateful'
    })
    await provider.onExecute({ item: resumeItem } satisfies IExecuteArgs)

    vi.advanceTimersByTime(6 * 60 * 1000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟结束',
        message: '10分钟专注已结束'
      })
    )
  })

  it('stops pomodoro sessions and cleans pending notifications', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const start = await provider.onSearch(
      { text: 'start pomodoro 5s', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)

    const stop = await provider.onSearch(
      { text: 'stop pomodoro', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(stop.items) } satisfies IExecuteArgs)

    vi.advanceTimersByTime(5_000)
    expect(notify).not.toHaveBeenCalled()

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(status.items).toHaveLength(0)
  })

  it('starts pomodoro cycle sessions and transitions through break and next focus', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const result = await provider.onSearch(
      { text: 'pomodoro cycle 5s 2s', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'pomodoro-start',
      durationMs: 5 * 1000,
      breakDurationMs: 2 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
    expect(item.render.basic?.title).toBe('开始循环番茄钟 5秒 / 2秒休息')

    await provider.onExecute({ item } satisfies IExecuteArgs)

    vi.advanceTimersByTime(5_000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟专注结束',
        message: '5秒专注已结束，进入2秒休息'
      })
    )
    const breakStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const breakItem = expectFirstItem(breakStatus.items)
    expect(breakItem.render.basic?.title).toBe('番茄钟休息运行中')
    expect(breakItem.render.basic?.subtitle).toContain('剩余 2秒')

    vi.advanceTimersByTime(2_000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟休息结束',
        message: '2秒休息已结束，开始第2轮专注'
      })
    )
    const focusStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const focusItem = expectFirstItem(focusStatus.items)
    expect(focusItem.render.basic?.title).toBe('番茄钟专注运行中')
    expect(focusItem.render.basic?.subtitle).toContain('剩余 5秒')
  })

  it('stops finite pomodoro cycles after the configured final focus segment', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const result = await provider.onSearch(
      { text: 'pomodoro cycle 2 rounds 5s 2s', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'pomodoro-start',
      durationMs: 5 * 1000,
      breakDurationMs: 2 * 1000,
      pomodoroCycles: 2,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
    expect(item.render.basic?.title).toBe('开始循环番茄钟 5秒 / 2秒休息 · 2轮')
    expect(item.render.basic?.subtitle).toBe('QuickOps Pomodoro · 5秒 专注与 2秒 休息循环 2 轮')

    await provider.onExecute({ item } satisfies IExecuteArgs)

    vi.advanceTimersByTime(5_000)
    vi.advanceTimersByTime(2_000)

    const secondFocusStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const secondFocusItem = expectFirstItem(secondFocusStatus.items)
    expect(secondFocusItem.render.basic?.title).toBe('番茄钟专注运行中')
    expect(secondFocusItem.render.basic?.subtitle).toContain('第 2/2 轮')

    vi.advanceTimersByTime(5_000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟循环结束',
        message: '已完成2轮5秒专注'
      })
    )
    const completedStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(completedStatus.items).toHaveLength(0)
  })

  it('uses configured long breaks every N pomodoro cycles without adding a final break', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const result = await provider.onSearch(
      { text: 'pomodoro cycle 4 rounds 5s 2s long break 1m every 2', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'pomodoro-start',
      durationMs: 5 * 1000,
      breakDurationMs: 2 * 1000,
      pomodoroCycles: 4,
      pomodoroLongBreakMs: 60 * 1000,
      pomodoroLongBreakEvery: 2,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
    expect(item.render.basic?.title).toBe('开始循环番茄钟 5秒 / 2秒休息 · 4轮 · 每2轮长休息1分钟')
    expect(item.render.basic?.subtitle).toBe(
      'QuickOps Pomodoro · 5秒 专注与 2秒 休息循环 4 轮，每 2 轮长休息 1分钟'
    )

    await provider.onExecute({ item } satisfies IExecuteArgs)

    vi.advanceTimersByTime(5_000)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟专注结束',
        message: '5秒专注已结束，进入2秒休息'
      })
    )
    vi.advanceTimersByTime(2_000)

    vi.advanceTimersByTime(5_000)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟专注结束',
        message: '5秒专注已结束，进入1分钟长休息'
      })
    )
    const longBreakStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const longBreakItem = expectFirstItem(longBreakStatus.items)
    expect(longBreakItem.render.basic?.title).toBe('番茄钟休息运行中')
    expect(longBreakItem.render.basic?.subtitle).toContain('剩余 1分钟')
    expect(longBreakItem.render.basic?.subtitle).toContain('第 2/4 轮')

    vi.advanceTimersByTime(60_000)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟休息结束',
        message: '1分钟休息已结束，开始第3轮专注'
      })
    )
    const thirdFocusStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const thirdFocusItem = expectFirstItem(thirdFocusStatus.items)
    expect(thirdFocusItem.render.basic?.title).toBe('番茄钟专注运行中')
    expect(thirdFocusItem.render.basic?.subtitle).toContain('第 3/4 轮')

    vi.advanceTimersByTime(5_000)
    vi.advanceTimersByTime(2_000)
    vi.advanceTimersByTime(5_000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 番茄钟循环结束',
        message: '已完成4轮5秒专注'
      })
    )
    const completedStatus = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(completedStatus.items).toHaveLength(0)
  })

  it('parses built-in pomodoro templates as focus break cycles', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const classic = await provider.onSearch(
      { text: 'pomodoro 25/5', inputs: [] },
      new AbortController().signal
    )
    const classicItem = expectFirstItem(classic.items)
    expect(getQuickOpsMeta(classicItem)).toEqual({
      action: 'pomodoro-start',
      durationMs: 25 * 60 * 1000,
      breakDurationMs: 5 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
    expect(classicItem.render.basic?.title).toBe('开始循环番茄钟 25分钟 / 5分钟休息')

    const long = await provider.onSearch(
      { text: '长番茄钟', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(long.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 50 * 60 * 1000,
      breakDurationMs: 10 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })

    const explicit = await provider.onSearch(
      { text: '番茄钟 25分钟 5分钟', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(explicit.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 25 * 60 * 1000,
      breakDurationMs: 5 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })

    const finite = await provider.onSearch(
      { text: '循环番茄钟 4轮 25分钟 5分钟', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(finite.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 25 * 60 * 1000,
      breakDurationMs: 5 * 60 * 1000,
      pomodoroCycles: 4,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })

    const longBreak = await provider.onSearch(
      { text: '循环番茄钟 4轮 5秒 2秒 长休息 1分钟 每2轮', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(longBreak.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 5 * 1000,
      breakDurationMs: 2 * 1000,
      pomodoroCycles: 4,
      pomodoroLongBreakMs: 60 * 1000,
      pomodoroLongBreakEvery: 2,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
  })

  it('parses custom pomodoro templates only from explicit custom commands', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const custom = await provider.onSearch(
      { text: 'pomodoro custom 40/8', inputs: [] },
      new AbortController().signal
    )
    const customItem = expectFirstItem(custom.items)
    expect(getQuickOpsMeta(customItem)).toEqual({
      action: 'pomodoro-start',
      durationMs: 40 * 60 * 1000,
      breakDurationMs: 8 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })
    expect(customItem.render.basic?.title).toBe('开始循环番茄钟 40分钟 / 8分钟休息')

    const zhCustom = await provider.onSearch(
      { text: '自定义番茄钟 45/10', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(zhCustom.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 45 * 60 * 1000,
      breakDurationMs: 10 * 60 * 1000,
      pomodoroMode: 'cycle',
      riskLevel: 'stateful'
    })

    const plain = await provider.onSearch(
      { text: 'pomodoro 40/8', inputs: [] },
      new AbortController().signal
    )
    expect(getQuickOpsMeta(expectFirstItem(plain.items))).toEqual({
      action: 'pomodoro-start',
      durationMs: 25 * 60 * 1000,
      riskLevel: 'stateful'
    })
  })

  it('starts screen-clean overlays for all displays and exposes a stop item', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const { factory, windows } = createWindowHarness()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(vi.fn(), factory as never))
    const result = await provider.onSearch(
      { text: '清洁屏幕 30s', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'screen-clean-start',
      durationMs: 30 * 1000,
      screenMode: 'black',
      riskLevel: 'stateful'
    })
    expect(item.render.basic?.title).toBe('黑底清洁屏幕 30秒')

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(factory).toHaveBeenCalledTimes(2)
    expect(windows.map((window) => window.bounds)).toEqual([
      { x: 0, y: 0, width: 1440, height: 900 },
      { x: 1440, y: 0, width: 1280, height: 720 }
    ])
    expect(windows.every((window) => window.screenMode === 'black')).toBe(true)

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const stopItem = expectFirstItem(status.items)
    expect(stopItem.render.basic?.title).toBe('清洁屏幕运行中')
    expect(getQuickOpsMeta(stopItem)?.action).toBe('screen-clean-stop')
  })

  it('starts white screen-clean overlays when requested', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const { factory, windows } = createWindowHarness()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(vi.fn(), factory as never))
    const result = await provider.onSearch(
      { text: '白底清洁屏幕 10s', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'screen-clean-start',
      durationMs: 10 * 1000,
      screenMode: 'white',
      riskLevel: 'stateful'
    })
    expect(item.render.basic?.title).toBe('白底清洁屏幕 10秒')
    expect(item.render.basic?.subtitle).toContain('白底全屏遮罩')

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(windows.every((window) => window.screenMode === 'white')).toBe(true)
  })

  it('starts solid color screen test overlays from screen-clean runtime', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const { factory, windows } = createWindowHarness()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(vi.fn(), factory as never))
    const result = await provider.onSearch(
      { text: 'red screen test 20s', inputs: [] },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getQuickOpsMeta(item)).toEqual({
      action: 'screen-clean-start',
      durationMs: 20 * 1000,
      screenMode: 'red',
      riskLevel: 'stateful'
    })
    expect(item.render.basic?.title).toBe('红色屏幕测试 20秒')
    expect(item.render.basic?.subtitle).toContain('红色屏幕测试全屏纯色遮罩')

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(windows.every((window) => window.screenMode === 'red')).toBe(true)
  })

  it('defaults generic screen color tests to red and supports Chinese color keywords', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()

    const generic = await provider.onSearch(
      { text: 'screen color test 15s', inputs: [] },
      new AbortController().signal
    )
    const chinese = await provider.onSearch(
      { text: '蓝色屏幕测试 15s', inputs: [] },
      new AbortController().signal
    )

    expect(getQuickOpsMeta(expectFirstItem(generic.items))).toEqual({
      action: 'screen-clean-start',
      durationMs: 15 * 1000,
      screenMode: 'red',
      riskLevel: 'stateful'
    })
    expect(getQuickOpsMeta(expectFirstItem(chinese.items))).toEqual({
      action: 'screen-clean-start',
      durationMs: 15 * 1000,
      screenMode: 'blue',
      riskLevel: 'stateful'
    })
  })

  it('renders screen-clean overlay data URLs with stable visual and exit affordances', async () => {
    const { createScreenCleanOverlayUrl } = await import('./quick-ops-session-manager')

    const blackUrl = createScreenCleanOverlayUrl(30_000, 'black')
    const whiteUrl = createScreenCleanOverlayUrl(60_000, 'white')
    const redUrl = createScreenCleanOverlayUrl(20_000, 'red')
    const greenUrl = createScreenCleanOverlayUrl(20_000, 'green')
    const blueUrl = createScreenCleanOverlayUrl(20_000, 'blue')
    const blackHtml = decodeURIComponent(blackUrl.replace('data:text/html;charset=utf-8,', ''))
    const whiteHtml = decodeURIComponent(whiteUrl.replace('data:text/html;charset=utf-8,', ''))
    const redHtml = decodeURIComponent(redUrl.replace('data:text/html;charset=utf-8,', ''))
    const greenHtml = decodeURIComponent(greenUrl.replace('data:text/html;charset=utf-8,', ''))
    const blueHtml = decodeURIComponent(blueUrl.replace('data:text/html;charset=utf-8,', ''))

    expect(blackUrl.startsWith('data:text/html;charset=utf-8,')).toBe(true)
    expect(blackHtml).toContain('background: #050505')
    expect(blackHtml).toContain('QuickOps 黑底清洁屏幕 · 30秒 后自动退出 · 长按 Esc 退出')
    expect(blackHtml).toContain('cursor: none')
    expect(blackHtml).toContain("event.key !== 'Escape'")
    expect(blackHtml).toContain('window.close()')
    expect(blackHtml).not.toContain('nodeIntegration')
    expect(blackHtml).not.toContain('http://')
    expect(blackHtml).not.toContain('https://')

    expect(whiteHtml).toContain('background: #f7f7f2')
    expect(whiteHtml).toContain('QuickOps 白底清洁屏幕 · 1分钟 后自动退出 · 长按 Esc 退出')
    expect(redHtml).toContain('background: #ff0000')
    expect(redHtml).toContain('QuickOps 红色屏幕测试 · 20秒 后自动退出 · 长按 Esc 退出')
    expect(greenHtml).toContain('background: #00ff00')
    expect(greenHtml).toContain('QuickOps 绿色屏幕测试 · 20秒 后自动退出 · 长按 Esc 退出')
    expect(blueHtml).toContain('background: #0000ff')
    expect(blueHtml).toContain('QuickOps 蓝色屏幕测试 · 20秒 后自动退出 · 长按 Esc 退出')
  })

  it('closes screen-clean overlays on expiry and manual stop', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const first = createWindowHarness()
    const provider = new QuickOpsProvider(
      new QuickOpsSessionManager(vi.fn(), first.factory as never)
    )
    const start = await provider.onSearch(
      { text: 'clean screen 5s', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(5_000)

    expect(first.windows.every((window) => window.close.mock.calls.length === 1)).toBe(true)

    const second = createWindowHarness()
    const providerWithManualStop = new QuickOpsProvider(
      new QuickOpsSessionManager(vi.fn(), second.factory as never)
    )
    const manualStart = await providerWithManualStop.onSearch(
      { text: '擦屏幕', inputs: [] },
      new AbortController().signal
    )
    await providerWithManualStop.onExecute({
      item: expectFirstItem(manualStart.items)
    } satisfies IExecuteArgs)

    const stop = await providerWithManualStop.onSearch(
      { text: '退出清洁屏幕', inputs: [] },
      new AbortController().signal
    )
    await providerWithManualStop.onExecute({
      item: expectFirstItem(stop.items)
    } satisfies IExecuteArgs)

    expect(second.windows.every((window) => window.close.mock.calls.length === 1)).toBe(true)
  })

  it('cleans screen-clean overlays when provider is destroyed', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const { factory, windows } = createWindowHarness()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(vi.fn(), factory as never))
    const start = await provider.onSearch(
      { text: 'screen cleaning', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(start.items) } satisfies IExecuteArgs)
    provider.onDestroy()

    expect(windows.every((window) => window.close.mock.calls.length === 1)).toBe(true)
  })

  it('runs stopwatch sessions with pause resume lap and reset', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const start = await provider.onSearch(
      { text: 'stopwatch', inputs: [] },
      new AbortController().signal
    )

    const startItem = expectFirstItem(start.items)
    expect(getQuickOpsMeta(startItem)).toEqual({
      action: 'stopwatch-start',
      riskLevel: 'stateful'
    })
    await provider.onExecute({ item: startItem } satisfies IExecuteArgs)

    vi.advanceTimersByTime(3_000)
    const lap = await provider.onSearch(
      { text: '秒表分段', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(lap.items) } satisfies IExecuteArgs)

    const running = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const runningItem = expectFirstItem(running.items)
    expect(runningItem.render.basic?.title).toBe('秒表运行中')
    expect(runningItem.render.basic?.subtitle).toContain('已用时 3秒')
    expect(runningItem.render.basic?.subtitle).toContain('分段 1')

    const pause = await provider.onSearch(
      { text: '暂停秒表', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(pause.items) } satisfies IExecuteArgs)

    vi.advanceTimersByTime(10_000)
    const paused = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    const pausedItem = expectFirstItem(paused.items)
    expect(pausedItem.render.basic?.title).toBe('秒表暂停中')
    expect(pausedItem.render.basic?.subtitle).toContain('已用时 3秒')

    const resume = await provider.onSearch(
      { text: '继续秒表', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(resume.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(2_000)

    const resumed = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(expectFirstItem(resumed.items).render.basic?.subtitle).toContain('已用时 5秒')

    const reset = await provider.onSearch(
      { text: '重置秒表', inputs: [] },
      new AbortController().signal
    )
    await provider.onExecute({ item: expectFirstItem(reset.items) } satisfies IExecuteArgs)

    const empty = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(empty.items).toHaveLength(0)
  })

  it('notifies when timer sessions expire', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const result = await provider.onSearch(
      { text: 'timer 5s', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(result.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(5_000)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'QuickOps 计时结束',
        message: '5秒计时已结束',
        level: 'success',
        system: { silent: false }
      })
    )

    const status = await provider.onSearch(
      { text: 'quickops', inputs: [] },
      new AbortController().signal
    )
    expect(status.items).toHaveLength(0)
  })

  it('does not send timer notifications for keep-awake expiry', async () => {
    const { QuickOpsProvider, QuickOpsSessionManager } = await import('./quick-ops-provider')
    const notify = vi.fn()
    const provider = new QuickOpsProvider(new QuickOpsSessionManager(notify))
    const result = await provider.onSearch(
      { text: 'keep awake 5s', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(result.items) } satisfies IExecuteArgs)
    vi.advanceTimersByTime(5_000)

    expect(notify).not.toHaveBeenCalled()
  })

  it('cleans running sessions on provider destroy', async () => {
    const { QuickOpsProvider } = await import('./quick-ops-provider')
    const provider = new QuickOpsProvider()
    const result = await provider.onSearch(
      { text: 'keep awake 10m', inputs: [] },
      new AbortController().signal
    )

    await provider.onExecute({ item: expectFirstItem(result.items) } satisfies IExecuteArgs)
    expect(electronMocks.started.has(1)).toBe(true)

    provider.onDestroy()

    expect(electronMocks.stop).toHaveBeenCalledWith(1)
    expect(electronMocks.started.has(1)).toBe(false)
  })
})
