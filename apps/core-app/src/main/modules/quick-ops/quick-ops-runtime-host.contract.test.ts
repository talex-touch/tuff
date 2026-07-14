import { afterEach, describe, expect, it, vi } from 'vitest'

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn()
}))

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  statfs: vi.fn(),
  writeFile: vi.fn()
}))

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/mock/temp'),
  getVersion: vi.fn(() => '2.4.12-test')
}))

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath,
    getVersion: electronMocks.getVersion
  },
  BrowserWindow: vi.fn(),
  powerSaveBlocker: {
    isStarted: vi.fn(() => false),
    start: vi.fn(() => 1),
    stop: vi.fn()
  },
  screen: {
    getAllDisplays: vi.fn(() => []),
    getPrimaryDisplay: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1, height: 1 } }))
  }
}))

vi.mock('../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: vi.fn()
  }
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => undefined)
}))

vi.mock('node:child_process', () => ({
  execFile: childProcessMocks.execFile
}))

vi.mock('node:fs/promises', () => ({
  mkdir: fsMocks.mkdir,
  readdir: fsMocks.readdir,
  readFile: fsMocks.readFile,
  rename: fsMocks.rename,
  stat: fsMocks.stat,
  statfs: fsMocks.statfs,
  writeFile: fsMocks.writeFile
}))

vi.mock('node:dns', () => ({
  getServers: vi.fn(() => [])
}))

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveCname: vi.fn(),
  resolveMx: vi.fn(),
  resolveNs: vi.fn(),
  resolveSoa: vi.fn(),
  resolveTxt: vi.fn()
}))

vi.mock('node:net', () => ({
  createServer: vi.fn(),
  isIP: vi.fn(() => 0)
}))

vi.mock('node:os', () => ({
  cpus: vi.fn(() => []),
  freemem: vi.fn(() => 0),
  homedir: vi.fn(() => '/mock/home'),
  loadavg: vi.fn(() => []),
  networkInterfaces: vi.fn(() => ({})),
  release: vi.fn(() => 'mock-release'),
  totalmem: vi.fn(() => 0),
  type: vi.fn(() => 'MockOS'),
  uptime: vi.fn(() => 0)
}))

function withErrorCode(message: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code })
}

function mockProcessPlatform(platform: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform
  })

  return () => {
    if (descriptor) Object.defineProperty(process, 'platform', descriptor)
  }
}

describe('QuickOps runtime boundary contracts', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes valid DNS commands while rejecting unsafe hostname boundaries', async () => {
    const { normalizeDnsHostname, parseDnsQuery } = await import('./quick-ops-runtime-host')

    expect(parseDnsQuery('deep dns https://Example.COM./docs?source=quickops')).toEqual({
      hostname: 'example.com',
      deep: true
    })
    expect(normalizeDnsHostname('localhost')).toBeNull()
    expect(normalizeDnsHostname('bad..example.com')).toBeNull()
    expect(normalizeDnsHostname('-edge.example.com')).toBeNull()
  })

  it('maps unavailable network, filesystem, and system boundaries to degraded results', async () => {
    const { computeFileHashes, createSystemProxyInfo, lookupPublicIp } =
      await import('./quick-ops-runtime-host')
    const restorePlatform = mockProcessPlatform('darwin')
    fsMocks.stat.mockRejectedValueOnce(withErrorCode('denied', 'EACCES'))
    childProcessMocks.execFile.mockImplementation(
      (_command: unknown, _args: unknown, _options: unknown, callback: Function) => {
        callback(withErrorCode('system access denied', 'EACCES'), '', '')
      }
    )

    try {
      await expect(
        lookupPublicIp(
          vi.fn(async () => ({
            ok: true,
            json: async () => ({ ip: 'not-an-ip' })
          })) as unknown as typeof fetch
        )
      ).resolves.toEqual({
        degradedReason: 'public-ip-invalid-response',
        message: '外部服务返回了不可识别的 IP 地址'
      })
      await expect(computeFileHashes('/restricted/notes.txt')).resolves.toEqual({
        degradedReason: 'file-hash-permission-denied',
        message: '没有权限读取文件'
      })
      await expect(createSystemProxyInfo()).resolves.toMatchObject({
        platform: 'darwin',
        status: 'degraded',
        environment: expect.any(Array),
        system: [],
        degradedReason: 'system-proxy-probe-failed',
        degradedMessage: 'system access denied'
      })
    } finally {
      restorePlatform()
    }
  })

  it('reports unsupported platform system probes as degraded instead of invoking a platform action', async () => {
    const { createQuickOpsCapabilityInfo } = await import('./quick-ops-runtime-host')
    const capability = createQuickOpsCapabilityInfo(
      {
        enabled: true,
        showRunningSessionsInCoreBox: true,
        allowStatefulTools: true,
        allowNetworkTools: true,
        allowFileTools: true,
        allowSystemTools: true,
        allowDeveloperTools: true,
        allowHighRiskTools: false,
        defaultKeepAwakeDurationMs: 15_000,
        defaultSystemAwakeDurationMs: 15_000,
        defaultTimerDurationMs: 15_000,
        defaultTimerExtendMs: 15_000,
        defaultPomodoroFocusMs: 15_000,
        defaultPomodoroBreakMs: 15_000,
        pomodoroTemplates: { classic: true, long: true, custom: [] },
        defaultScreenCleanDurationMs: 15_000,
        defaultScreenCleanMode: 'black',
        allowPublicIpLookup: false
      },
      'freebsd'
    )

    expect(
      capability.entries.find((entry) => entry.id === 'quickops.network.systemProxy')
    ).toMatchObject({
      status: 'degraded',
      reason: 'unsupported-platform'
    })
  })
})
