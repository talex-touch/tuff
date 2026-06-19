import type { NetworkInterfaceInfo } from 'node:os'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  nextBlockerId: 1,
  started: new Set<number>(),
  displays: [
    {
      id: 1,
      bounds: { x: 0, y: 0, width: 1440, height: 900 }
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
  readdir: vi.fn<(targetPath: string, options?: unknown) => Promise<unknown[]>>(async () => []),
  statfs: vi.fn(async () => ({
    type: 0,
    bsize: 1024,
    blocks: 20 * 1024 * 1024,
    bfree: 5 * 1024 * 1024,
    bavail: 5 * 1024 * 1024,
    files: 0,
    ffree: 0
  }))
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
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
    },
    {
      model: 'Apple M Test',
      speed: 3200,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
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

function expectDnsQueryInfo(
  value: Awaited<ReturnType<typeof import('./quick-ops-provider').createDnsQueryInfo>>
): import('@talex-touch/utils/transport/events/types').QuickOpsDnsQueryInfo {
  if ('degradedReason' in value) {
    throw new Error(`Expected DNS query info, received ${value.degradedReason}`)
  }
  return value
}

describe('QuickOpsRuntimeHost', () => {
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
    fsMocks.statfs.mockResolvedValue({
      type: 0,
      bsize: 1024,
      blocks: 20 * 1024 * 1024,
      bfree: 5 * 1024 * 1024,
      bavail: 5 * 1024 * 1024,
      files: 0,
      ffree: 0
    })
    osMocks.homedir.mockReturnValue('/Users/tester')
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
  })

  afterEach(async () => {
    vi.useRealTimers()
    restoreProxyEnv(originalProxyEnv)
    const dirs = tempDirs
    tempDirs = []
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function createTempFile(name: string, content: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-runtime-'))
    tempDirs.push(dir)
    const filePath = path.join(dir, name)
    await writeFile(filePath, content)
    return filePath
  }

  it('keeps CoreApp host runtime sessions without exposing a CoreBox provider class', async () => {
    const mod = await import('./quick-ops-provider')
    const host = new mod.QuickOpsRuntimeHost()
    const seenKinds: string[][] = []
    const dispose = host.subscribeSessions((sessions) => {
      seenKinds.push(sessions.map((session) => session.kind))
    })

    const keepAwake = host.startKeepAwake(30_000)
    const timer = host.startTimer(5_000)

    expect(mod).not.toHaveProperty('QuickOpsProvider')
    expect(
      host
        .listSessions()
        .map((session) => session.kind)
        .sort()
    ).toEqual(['keep-awake', 'timer'])
    expect(keepAwake.blockerId).toBe(1)
    expect(timer.expiresAt).toBeGreaterThan(Date.now())
    expect(electronMocks.start).toHaveBeenCalledWith('prevent-display-sleep')
    expect(seenKinds.at(-1)?.sort()).toEqual(['keep-awake', 'timer'])

    expect(host.stopAllSessions('test-stop-all')).toBe(2)
    expect(host.listSessions()).toEqual([])
    expect(electronMocks.stop).toHaveBeenCalledWith(1)
    dispose()
  })

  it('cleans runtime sessions on deactivate and destroy lifecycle hooks', async () => {
    const { QuickOpsRuntimeHost } = await import('./quick-ops-provider')
    const host = new QuickOpsRuntimeHost()

    host.startSystemAwake(30_000)
    expect(host.listSessions()).toHaveLength(1)
    host.onDeactivate()
    expect(host.listSessions()).toHaveLength(0)
    expect(electronMocks.stop).toHaveBeenCalledWith(1)

    host.startKeepAwake(30_000)
    host.onDestroy()
    expect(host.listSessions()).toHaveLength(0)
    expect(electronMocks.stop).toHaveBeenCalledWith(2)
  })

  it('reads QuickOps settings only for capability and diagnostics summaries', async () => {
    const { QuickOpsRuntimeHost, formatDiagnosticsInfo } = await import('./quick-ops-provider')
    const host = new QuickOpsRuntimeHost(undefined, () => ({
      enabled: true,
      allowStatefulTools: false,
      allowNetworkTools: false,
      allowPublicIpLookup: true,
      defaultKeepAwakeDurationMinutes: 45,
      defaultTimerDurationMinutes: 12,
      defaultPomodoroFocusMinutes: 40,
      defaultPomodoroBreakMinutes: 8,
      defaultScreenCleanDurationSeconds: 120
    }))

    const capability = host.getCapabilityInfo()
    const keepAwake = capability.entries.find((entry) => entry.id === 'quickops.state.keepAwake')
    const localNetwork = capability.entries.find((entry) => entry.id === 'quickops.network.local')
    const diagnosticsText = formatDiagnosticsInfo(host.getDiagnosticsInfo())

    expect(keepAwake).toMatchObject({
      status: 'disabled',
      reason: 'stateful-tools-disabled-by-policy'
    })
    expect(localNetwork).toMatchObject({
      status: 'disabled',
      reason: 'network-tools-disabled-by-policy'
    })
    expect(diagnosticsText).toContain('Home: ~')
    expect(diagnosticsText).toContain('keepAwake=45分钟')
    expect(diagnosticsText).not.toContain('/Users/tester')
  })

  it('parses QuickOps natural language commands without CoreBox item builders', async () => {
    const { parseQuickOpsQuery, parseDurationMs } = await import('./quick-ops-provider')

    expect(parseDurationMs('1小时30分钟')).toBe(90 * 60 * 1000)
    expect(parseQuickOpsQuery('keep awake 30m')).toMatchObject({
      action: 'keep-awake-start',
      durationMs: 30 * 60 * 1000
    })
    expect(
      parseQuickOpsQuery('pomodoro cycle 4 rounds 25m 5m long break 15m every 2 rounds')
    ).toMatchObject({
      action: 'pomodoro-start',
      durationMs: 25 * 60 * 1000,
      breakDurationMs: 5 * 60 * 1000,
      pomodoroCycles: 4,
      pomodoroLongBreakMs: 15 * 60 * 1000,
      pomodoroLongBreakEvery: 2,
      pomodoroMode: 'cycle'
    })
    expect(parseQuickOpsQuery('blue screen test')).toMatchObject({
      action: 'screen-clean-start',
      screenMode: 'blue'
    })
  })

  it('creates local network, DNS, and port helper responses', async () => {
    const {
      createDnsQueryInfo,
      createNetworkStatusInfo,
      formatDnsQueryInfo,
      formatLocalIpInfo,
      getLocalIpAddresses,
      parseDnsQuery,
      parsePortQuery,
      probeLocalTcpPort
    } = await import('./quick-ops-provider')

    const addresses = getLocalIpAddresses()
    expect(addresses.map((item) => item.address)).toEqual(['192.168.2.10', 'fe80::1'])
    expect(formatLocalIpInfo(addresses)).toContain('en0 IPv4 192.168.2.10')
    expect(createNetworkStatusInfo()).toMatchObject({
      dnsServers: ['1.1.1.1', '2606:4700:4700::1111'],
      proxyStatus: 'not-detected'
    })
    expect(parseDnsQuery('deep dns example.com')).toEqual({ hostname: 'example.com', deep: true })

    const dnsInfo = expectDnsQueryInfo(await createDnsQueryInfo('example.com', true))
    expect(dnsInfo.records.map((record) => record.type)).toContain('A')
    expect(formatDnsQueryInfo(dnsInfo)).toContain('example.com')
    expect(parsePortQuery('port 3456')).toBe(3456)

    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const occupied = await probeLocalTcpPort(port)
    expect(occupied.available).toBe(false)
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('handles file hash, base64, path, and common-directory helpers', async () => {
    const {
      computeFileHashes,
      createFilePathInfo,
      decodeFileBase64ToTempFile,
      encodeFileBase64,
      formatFileBase64BatchInfo,
      formatFileHashBatchInfo,
      resolveCommonDirectory,
      resolveFileBase64Path,
      resolveFileHashPath,
      resolveFilePathTarget
    } = await import('./quick-ops-provider')
    const filePath = await createTempFile('hello.txt', 'hello')
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'quick-ops-temp-'))
    tempDirs.push(tempRoot)
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'temp' ? tempRoot : `/mock/${name}`
    )

    await expect(computeFileHashes(filePath)).resolves.toMatchObject({
      md5: '5d41402abc4b2a76b9719d911017c592',
      sha1: 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d',
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    })
    await expect(encodeFileBase64(filePath)).resolves.toMatchObject({ base64: 'aGVsbG8=' })
    await expect(decodeFileBase64ToTempFile('aGVsbG8=')).resolves.toMatchObject({ size: 5 })
    expect(resolveFileHashPath(`hash "${filePath}"`, { text: '', inputs: [] })).toBe(filePath)
    expect(resolveFileBase64Path(`file base64 "${filePath}"`, { text: '', inputs: [] })).toBe(
      filePath
    )
    expect(resolveFilePathTarget(`copy path "${filePath}"`, { text: '', inputs: [] })).toBe(
      filePath
    )
    expect(createFilePathInfo('C:\\Users\\tester\\file.txt')).toMatchObject({
      fileName: 'file.txt',
      wslPath: '/mnt/c/Users/tester/file.txt'
    })
    expect(resolveCommonDirectory('open logs')).toMatchObject({ id: 'logs', path: '/mock/logs' })
    expect(
      formatFileHashBatchInfo({
        files: [
          {
            path: filePath,
            fileName: 'hello.txt',
            size: 5,
            md5: 'md5',
            sha1: 'sha1',
            sha256: 'sha256'
          }
        ],
        totalSize: 5
      })
    ).toContain('SHA256 sha256')
    expect(
      formatFileBase64BatchInfo({
        files: [{ path: filePath, fileName: 'hello.txt', size: 5, base64: 'aGVsbG8=' }],
        totalSize: 5
      })
    ).toContain('aGVsbG8=')
  })

  it('bounds recent-download moves to Downloads and explicit target directories', async () => {
    const { findRecentDownloadFile, moveRecentDownloadFile, prepareRecentDownloadMove } =
      await import('./quick-ops-provider')
    const downloadsDir = await mkdtemp(path.join(tmpdir(), 'quick-ops-downloads-'))
    const targetDir = await mkdtemp(path.join(tmpdir(), 'quick-ops-target-'))
    tempDirs.push(downloadsDir, targetDir)
    const filePath = path.join(downloadsDir, 'recent.txt')
    electronMocks.getPath.mockImplementation((name: string) =>
      name === 'downloads' ? downloadsDir : `/mock/${name}`
    )
    await writeFile(filePath, 'recent')
    fsMocks.readdir.mockImplementation(async (targetPath: string) =>
      targetPath === downloadsDir
        ? [
            {
              name: 'recent.txt',
              isFile: () => true
            }
          ]
        : []
    )

    await expect(findRecentDownloadFile()).resolves.toMatchObject({ path: filePath })
    const prepared = await prepareRecentDownloadMove(targetDir)
    expect(prepared).toMatchObject({ path: filePath, targetDirectory: targetDir })
    if ('degradedReason' in prepared) throw new Error(prepared.message)

    await expect(moveRecentDownloadFile(prepared.path, prepared.targetPath)).resolves.toMatchObject(
      {
        path: filePath,
        targetPath: prepared.targetPath
      }
    )
    await expect(stat(prepared.targetPath)).resolves.toMatchObject({})
    await expect(
      moveRecentDownloadFile('/tmp/outside.txt', path.join(targetDir, 'x.txt'))
    ).resolves.toMatchObject({
      degradedReason: 'recent-download-move-source-outside-downloads'
    })
  })

  it('redacts proxy credentials and parses platform proxy outputs', async () => {
    const {
      createSystemProxyInfo,
      getProxyEnvironmentInfo,
      parseLinuxSystemProxyEntries,
      parseMacSystemProxyEntries,
      parseWindowsSystemProxyEntries
    } = await import('./quick-ops-provider')
    process.env.HTTP_PROXY = 'http://alice:secret@proxy.local:8080'

    expect(getProxyEnvironmentInfo()).toEqual([
      {
        source: 'HTTP_PROXY',
        value: 'http://***:***@proxy.local:8080/'
      }
    ])
    expect(
      parseMacSystemProxyEntries('HTTPEnable : 1\nHTTPProxy : proxy.local\nHTTPPort : 8080')
    ).toEqual([{ source: 'macos-system', name: 'HTTP', value: 'proxy.local:8080' }])
    expect(
      parseWindowsSystemProxyEntries('{"ProxyEnable":1,"ProxyServer":"proxy.local:8080"}')
    ).toEqual([{ source: 'windows-system', name: 'ProxyServer', value: 'proxy.local:8080' }])
    expect(parseLinuxSystemProxyEntries('manual\nproxy.local\n8080')).toEqual([
      {
        source: 'linux-gsettings',
        name: 'GNOME Proxy Mode',
        value: 'manual\nproxy.local\n8080'
      }
    ])

    const restore = mockProcessPlatform('darwin')
    mockExecFileSuccess('HTTPEnable : 1\nHTTPProxy : proxy.local\nHTTPPort : 8080')
    await expect(createSystemProxyInfo()).resolves.toMatchObject({
      status: 'detected',
      system: [{ source: 'macos-system', name: 'HTTP', value: 'proxy.local:8080' }]
    })
    restore()
  })

  it('parses battery status and preserves low-battery predicate without side effects', async () => {
    const {
      parseLinuxBatteryStatus,
      parseMacBatteryStatus,
      parseWindowsBatteryStatus,
      shouldNotifyLowBattery
    } = await import('./quick-ops-provider')

    const mac = parseMacBatteryStatus(
      'Now drawing from battery power\n -InternalBattery-0; 15%; discharging;'
    )
    const win = parseWindowsBatteryStatus('{"EstimatedChargeRemaining":85,"BatteryStatus":6}')
    const linux = parseLinuxBatteryStatus('18', 'Discharging')

    expect(mac).toMatchObject({ levelPercent: 15, charging: false, source: 'macos-pmset' })
    expect(win).toMatchObject({ levelPercent: 85, charging: true, source: 'windows-cim' })
    expect(linux).toMatchObject({ levelPercent: 18, charging: false, source: 'linux-sysfs' })
    expect(shouldNotifyLowBattery(mac!)).toBe(true)
    expect(shouldNotifyLowBattery(win!)).toBe(false)
    expect(notificationMocks.showInternalSystemNotification).not.toHaveBeenCalled()
  })

  it('summarizes disk, directory, system, and diagnostics data with redacted paths', async () => {
    const {
      createDiagnosticsInfo,
      createDirectoryUsageInfo,
      createDiskSpaceInfo,
      createSystemInfo,
      formatDiagnosticsInfo,
      formatDirectoryUsageInfo,
      formatDiskSpaceInfo,
      formatSystemInfo
    } = await import('./quick-ops-provider')
    const dir = await mkdtemp(path.join(tmpdir(), 'quick-ops-dir-'))
    tempDirs.push(dir)
    await mkdir(path.join(dir, 'nested'))
    await writeFile(path.join(dir, 'a.txt'), 'hello')
    await writeFile(path.join(dir, 'nested', 'b.txt'), 'world')
    fsMocks.readdir.mockImplementation(async (targetPath: string) => {
      if (targetPath === dir) {
        return [
          {
            name: 'nested',
            isFile: () => false,
            isDirectory: () => true
          },
          {
            name: 'a.txt',
            isFile: () => true,
            isDirectory: () => false
          }
        ]
      }
      if (targetPath === path.join(dir, 'nested')) {
        return [
          {
            name: 'b.txt',
            isFile: () => true,
            isDirectory: () => false
          }
        ]
      }
      return []
    })

    const disk = await createDiskSpaceInfo()
    expect('entries' in disk ? disk.entries[0]?.path : '').toBe('~')
    expect('entries' in disk ? formatDiskSpaceInfo(disk) : disk.message).toContain('Free:')

    const usage = await createDirectoryUsageInfo([{ label: 'Fixture', path: dir }], { deep: true })
    expect('entries' in usage ? usage.entries[0]?.fileCount : 0).toBe(2)
    expect('entries' in usage ? formatDirectoryUsageInfo(usage) : usage.message).toContain(
      'recursive depth 3'
    )

    expect(formatSystemInfo(createSystemInfo())).toContain('Darwin')
    const diagnostics = createDiagnosticsInfo({
      enabled: true,
      showRunningSessionsInCoreBox: true,
      allowStatefulTools: true,
      allowNetworkTools: true,
      allowFileTools: true,
      allowSystemTools: true,
      allowDeveloperTools: true,
      allowHighRiskTools: false,
      defaultKeepAwakeDurationMs: 60_000,
      defaultSystemAwakeDurationMs: 60_000,
      defaultTimerDurationMs: 60_000,
      defaultTimerExtendMs: 60_000,
      defaultPomodoroFocusMs: 60_000,
      defaultPomodoroBreakMs: 60_000,
      pomodoroTemplates: { classic: true, long: true, custom: [] },
      defaultScreenCleanDurationMs: 60_000,
      defaultScreenCleanMode: 'black',
      allowPublicIpLookup: false
    })
    expect(formatDiagnosticsInfo(diagnostics)).not.toContain('/Users/tester')
  })
})
