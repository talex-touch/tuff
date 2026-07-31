import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createFixedPluginBrowserOpenService,
  createPluginBrowserOpenCapabilities,
  createPluginBrowserOpenProcess,
  PLUGIN_BROWSER_OPEN_MAX_URL_BYTES,
  PLUGIN_BROWSER_OPEN_TOKEN_TTL_MS,
  type PluginBrowserOpenProcess
} from './plugin-browser-open-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-browser-open',
  pluginInstanceId: 'browser-open-instance',
  activationGeneration: 1,
  key: 'browser-open-key'
})

function completedProcess(code = 0): PluginBrowserOpenProcess {
  const child = new EventEmitter() as ChildProcess
  Object.assign(child, {
    pid: 101,
    kill: vi.fn(() => true)
  })
  queueMicrotask(() => child.emit('exit', code))
  return createPluginBrowserOpenProcess(child)
}

function controlledProcess() {
  const child = new EventEmitter() as ChildProcess
  const kill = vi.fn(() => true)
  Object.assign(child, { pid: 202, kill })
  return {
    child,
    kill,
    process: createPluginBrowserOpenProcess(child),
    exit(code: number | null = null) {
      child.emit('exit', code)
    }
  }
}

function browserToken(result: unknown): string {
  return (result as { browsers: Array<{ token: string }> }).browsers[0].token
}

function createHarness(
  options: {
    platform?: NodeJS.Platform
    shellAllowed?: boolean
    networkAllowed?: boolean
    identityVersion?: () => string
    inspectDelay?: () => Promise<void>
    processFactory?: () => PluginBrowserOpenProcess
  } = {}
) {
  let current: PluginActivationIdentity | undefined = activation
  let hostGeneration = 7
  let shellAllowed = options.shellAllowed ?? true
  let networkAllowed = options.networkAllowed ?? true
  const watchers = new Map<string, Set<() => void>>()
  const inspect = vi.fn(async (candidatePath: string, kind: 'directory' | 'file') => {
    await options.inspectDelay?.()
    if (!candidatePath.includes('Google Chrome') && !candidatePath.includes('Google\\Chrome')) {
      return null
    }
    return {
      canonicalPath: candidatePath,
      kind,
      dev: '1',
      ino: options.identityVersion?.() ?? '42'
    }
  })
  const spawn = vi.fn(() => options.processFactory?.() ?? completedProcess())
  const service = createFixedPluginBrowserOpenService({
    platform: options.platform ?? 'darwin',
    homeDirectory: '/Users/test',
    windowsDirectory: options.platform === 'win32' ? 'C:\\Windows' : '/Windows',
    environment: {
      HOME: '/Users/test',
      LANG: 'en_US.UTF-8',
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      SystemRoot: 'C:\\Windows'
    },
    inspect,
    spawn
  })
  const watch = (permissionId: string, onRevoke: () => void): (() => void) => {
    const handlers = watchers.get(permissionId) ?? new Set<() => void>()
    handlers.add(onRevoke)
    watchers.set(permissionId, handlers)
    return () => handlers.delete(onRevoke)
  }
  const capability = createPluginBrowserOpenCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    authorizeShell: () => shellAllowed,
    authorizeNetwork: () => networkAllowed,
    watchShellPermissionRevoked: (_pluginName, onRevoke) => watch('system.shell', onRevoke),
    watchNetworkPermissionRevoked: (_pluginName, onRevoke) => watch('network.internet', onRevoke),
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'browser-open-host', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: (_pluginName, permissionId) =>
      permissionId === 'system.shell' ? shellAllowed : networkAllowed,
    watchPermissionRevoked: (_pluginName, permissionId, onRevoke) => watch(permissionId, onRevoke),
    isActive: () => true,
    onFatalViolation() {}
  })
  registry.register(capability.definitions[0])
  return {
    capability,
    inspect,
    registry,
    service,
    spawn,
    revoke(permissionId: 'system.shell' | 'network.internet') {
      if (permissionId === 'system.shell') shellAllowed = false
      else networkAllowed = false
      for (const listener of [...(watchers.get(permissionId) ?? [])]) listener()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated-key' }
    },
    rotateHost() {
      hostGeneration = 8
    }
  }
}

describe('isolated browser-open capability', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('lists only bounded display metadata and activation-local opaque tokens', async () => {
    const harness = createHarness()

    const result = await harness.registry.dispatch('system.browser-open', { operation: 'list' })

    expect(result).toEqual({
      operation: 'list',
      status: 'available',
      defaultAvailable: true,
      browsers: [
        {
          id: 'chrome',
          name: 'Chrome',
          token: expect.stringMatching(/^bo_[A-Za-z0-9_-]{32}$/)
        }
      ]
    })
    expect(JSON.stringify(result)).not.toMatch(
      /Applications|Google Chrome\.app|path|executable|dev|ino/i
    )
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('rejects a late inventory response after a newer list rotates the epoch', async () => {
    let inspection = 0
    let releaseFirst!: () => void
    const firstInspection = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const harness = createHarness({
      inspectDelay: async () => {
        inspection += 1
        if (inspection === 1) await firstInspection
      }
    })

    const older = harness.registry.dispatch('system.browser-open', { operation: 'list' })
    await vi.waitFor(() => expect(harness.inspect).toHaveBeenCalledTimes(1))
    const newer = await harness.registry.dispatch('system.browser-open', { operation: 'list' })
    releaseFirst()

    await expect(older).resolves.toEqual({
      operation: 'list',
      status: 'failed',
      reason: 'list-failed'
    })
    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com',
        browserToken: browserToken(newer)
      })
    ).resolves.toEqual({ operation: 'open', status: 'completed' })
  })

  it('opens the default browser with fixed no-shell launch and no target field', async () => {
    const harness = createHarness()

    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com/path'
      })
    ).resolves.toEqual({ operation: 'open', status: 'completed' })

    expect(harness.spawn).toHaveBeenCalledExactlyOnceWith(
      '/usr/bin/open',
      ['https://example.com/path'],
      expect.objectContaining({
        shell: false,
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore']
      })
    )
    expect(harness.inspect).not.toHaveBeenCalled()
  })

  it('revalidates a token before a fixed specific-browser launch', async () => {
    const harness = createHarness()
    const listed = await harness.registry.dispatch('system.browser-open', { operation: 'list' })
    const token = browserToken(listed)
    harness.inspect.mockClear()

    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com',
        browserToken: token
      })
    ).resolves.toEqual({ operation: 'open', status: 'completed' })

    expect(harness.inspect).toHaveBeenCalledTimes(1)
    expect(harness.spawn).toHaveBeenCalledWith(
      '/usr/bin/open',
      ['-a', '/Applications/Google Chrome.app', 'https://example.com/'],
      expect.objectContaining({ shell: false })
    )
  })

  it.each([
    { operation: 'open', url: 'file:///private/tmp/a' },
    { operation: 'open', url: 'https://user:secret@example.com' },
    { operation: 'open', url: 'https://example.com\n--args' },
    {
      operation: 'open',
      url: `https://example.com/${'x'.repeat(PLUGIN_BROWSER_OPEN_MAX_URL_BYTES)}`
    },
    { operation: 'open', url: 'https://example.com', executable: '/Applications/Calculator.app' },
    { operation: 'open', url: 'https://example.com', path: '/Applications/Calculator.app' },
    { operation: 'open', url: 'https://example.com', script: 'open Calculator' },
    { operation: 'open', url: 'https://example.com', args: ['--incognito'] },
    { operation: 'open', url: 'https://example.com', browserToken: '/Applications/Safari.app' }
  ])('rejects hostile URL and target authority before host work: %o', async (request) => {
    const harness = createHarness()
    await expect(harness.registry.dispatch('system.browser-open', request)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
    })
    expect(harness.inspect).not.toHaveBeenCalled()
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('fails unknown, replayed and previous-epoch tokens closed', async () => {
    const harness = createHarness()
    const first = await harness.registry.dispatch('system.browser-open', { operation: 'list' })
    const firstToken = browserToken(first)

    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com',
        browserToken: 'bo_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-invalid' })

    await harness.registry.dispatch('system.browser-open', { operation: 'list' })
    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com',
        browserToken: firstToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('expires tokens at the exact TTL boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'))
    const harness = createHarness()
    const listed = await harness.registry.dispatch('system.browser-open', { operation: 'list' })
    vi.setSystemTime(Date.now() + PLUGIN_BROWSER_OPEN_TOKEN_TTL_MS)

    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com',
        browserToken: browserToken(listed)
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-expired' })
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('rejects native replacement after consuming the token', async () => {
    let identity = '42'
    const harness = createHarness({ identityVersion: () => identity })
    const listed = await harness.registry.dispatch('system.browser-open', { operation: 'list' })
    identity = '43'

    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com',
        browserToken: browserToken(listed)
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'native-replaced' })
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('requires shell for inventory and both shell and network for opening', async () => {
    const deniedList = createHarness({ shellAllowed: false })
    await expect(
      deniedList.registry.dispatch('system.browser-open', { operation: 'list' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })
    expect(deniedList.inspect).not.toHaveBeenCalled()

    const deniedOpen = createHarness({ networkAllowed: false })
    await expect(
      deniedOpen.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com'
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission-denied' })
    expect(deniedOpen.spawn).not.toHaveBeenCalled()
  })

  it('rejects stale activation and host generation before discovery or spawn', async () => {
    const stale = createHarness()
    stale.rotate()
    await expect(
      stale.registry.dispatch('system.browser-open', { operation: 'list' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    expect(stale.inspect).not.toHaveBeenCalled()

    const wrongHost = createHarness()
    wrongHost.rotateHost()
    await expect(
      wrongHost.registry.dispatch('system.browser-open', { operation: 'list' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(wrongHost.inspect).not.toHaveBeenCalled()
  })

  it('network revoke cancels an active launcher and awaits its exit barrier', async () => {
    const controlled = controlledProcess()
    const harness = createHarness({ processFactory: () => controlled.process })
    const pending = harness.registry.dispatch('system.browser-open', {
      operation: 'open',
      url: 'https://example.com'
    })
    await vi.waitFor(() => expect(harness.spawn).toHaveBeenCalled())

    harness.revoke('network.internet')
    await vi.waitFor(() => expect(controlled.kill).toHaveBeenCalledTimes(1))
    controlled.exit()

    await expect(pending).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied'
    })
    await expect(harness.capability.close()).resolves.toBeUndefined()
  })

  it('close stays pending until the real launcher exit and kills at most once', async () => {
    const controlled = controlledProcess()
    const harness = createHarness({ processFactory: () => controlled.process })
    const pending = harness.registry.dispatch('system.browser-open', {
      operation: 'open',
      url: 'https://example.com'
    })
    await vi.waitFor(() => expect(harness.spawn).toHaveBeenCalled())
    const close = harness.capability.close()
    let settled = false
    void close.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(controlled.kill).toHaveBeenCalledTimes(1)

    controlled.exit()
    await expect(close).resolves.toBeUndefined()
    await expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    })
    expect(controlled.kill).toHaveBeenCalledTimes(1)
  })

  it('uses fixed no-shell Windows launchers and keeps host-owned targets as data arguments', async () => {
    const defaultHarness = createHarness({ platform: 'win32' })
    await defaultHarness.registry.dispatch('system.browser-open', {
      operation: 'open',
      url: 'https://example.com'
    })
    expect(defaultHarness.spawn).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\rundll32.exe',
      ['url.dll,FileProtocolHandler', 'https://example.com/'],
      expect.objectContaining({ shell: false, cwd: 'C:\\Windows\\System32' })
    )

    const specificHarness = createHarness({ platform: 'win32' })
    const listed = await specificHarness.registry.dispatch('system.browser-open', {
      operation: 'list'
    })
    await specificHarness.registry.dispatch('system.browser-open', {
      operation: 'open',
      url: 'https://example.com/a?b=1&c=2',
      browserToken: browserToken(listed)
    })
    expect(specificHarness.spawn).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "$ErrorActionPreference='Stop'; Start-Process -FilePath $args[0] -ArgumentList @($args[1])",
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'https://example.com/a?b=1&c=2'
      ],
      expect.objectContaining({ shell: false })
    )
  })

  it('snapshots mutable Windows launcher options before discovery and process creation', async () => {
    const environment: Record<string, string | undefined> = {
      ProgramFiles: 'C:\\Program Files',
      SystemRoot: 'C:\\Windows'
    }
    const inspect = vi.fn(async (candidatePath: string, kind: 'directory' | 'file') =>
      candidatePath.includes('Google\\Chrome')
        ? { canonicalPath: candidatePath, kind, dev: '1', ino: '42' }
        : null
    )
    const spawn = vi.fn(() => completedProcess())
    const options = {
      platform: 'win32' as const,
      homeDirectory: 'C:\\Users\\test',
      windowsDirectory: 'C:\\Windows',
      environment,
      inspect,
      spawn
    }
    const service = createFixedPluginBrowserOpenService(options)

    options.windowsDirectory = 'D:\\MutableWindows'
    environment.ProgramFiles = 'D:\\MutablePrograms'
    environment.SystemRoot = 'D:\\MutableWindows'
    options.spawn = vi.fn(() => {
      throw new Error('mutated spawn must not run')
    })

    const targets = await service.list(new AbortController().signal)
    expect(targets).toHaveLength(1)
    expect(targets[0].path).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')

    await service.startOpen('https://example.com').wait()
    await service.startOpen('https://example.com', targets[0]).wait()

    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'C:\\Windows\\System32\\rundll32.exe',
      ['url.dll,FileProtocolHandler', 'https://example.com/'],
      expect.objectContaining({ env: { SystemRoot: 'C:\\Windows' }, shell: false })
    )
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      expect.arrayContaining([
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'https://example.com/'
      ]),
      expect.objectContaining({ env: { SystemRoot: 'C:\\Windows' }, shell: false })
    )
  })

  it('rejects hostile environment accessors without evaluating them', () => {
    const getter = vi.fn(() => 'C:\\MutableWindows')
    const environment = { ProgramFiles: 'C:\\Program Files' }
    Object.defineProperty(environment, 'SystemRoot', {
      enumerable: true,
      get: getter
    })

    expect(() =>
      createFixedPluginBrowserOpenService({
        platform: 'win32',
        homeDirectory: 'C:\\Users\\test',
        windowsDirectory: 'C:\\Windows',
        environment,
        inspect: vi.fn(async () => null),
        spawn: vi.fn(() => completedProcess())
      })
    ).toThrow('PLUGIN_BROWSER_OPEN_INVALID')
    expect(getter).not.toHaveBeenCalled()
  })

  it('accepts the real Node environment without retaining its special prototype', () => {
    const service = createFixedPluginBrowserOpenService({
      platform: 'darwin',
      homeDirectory: '/Users/test',
      windowsDirectory: '/Windows',
      environment: process.env,
      inspect: vi.fn(async () => null),
      spawn: vi.fn(() => completedProcess())
    })

    expect(service.platform).toBe('darwin')
  })

  it('keeps Linux specific inventory empty and uses fixed xdg-open for default URLs', async () => {
    const harness = createHarness({ platform: 'linux' })

    await expect(
      harness.registry.dispatch('system.browser-open', { operation: 'list' })
    ).resolves.toEqual({
      operation: 'list',
      status: 'available',
      defaultAvailable: true,
      browsers: []
    })
    await expect(
      harness.registry.dispatch('system.browser-open', {
        operation: 'open',
        url: 'https://example.com'
      })
    ).resolves.toEqual({ operation: 'open', status: 'completed' })
    expect(harness.spawn).toHaveBeenCalledWith(
      '/usr/bin/xdg-open',
      ['https://example.com/'],
      expect.objectContaining({ shell: false })
    )
  })
})
