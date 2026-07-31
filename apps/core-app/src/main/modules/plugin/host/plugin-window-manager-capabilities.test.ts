import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createFixedPluginWindowManagerService,
  createPluginWindowManagerCapabilities,
  createPluginWindowManagerProcess,
  PLUGIN_WINDOW_MANAGER_ACTION_IDS,
  PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES,
  PLUGIN_WINDOW_MANAGER_TOKEN_TTL_MS,
  type PluginWindowManagerProcess
} from './plugin-window-manager-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-window-manager',
  pluginInstanceId: 'window-manager-instance',
  activationGeneration: 1,
  key: 'window-manager-key'
})

const INVENTORY = JSON.stringify({
  windows: [
    {
      name: 'Terminal',
      title: 'Workspace',
      pid: 11,
      nativeId: '100',
      startTime: '638900000000000000',
      appPath: 'C:\\Program Files\\Terminal\\terminal.exe',
      topmost: false,
      isFront: true
    },
    {
      name: 'Browser',
      title: 'Docs',
      pid: 22,
      nativeId: '200',
      startTime: '638900000000000001',
      appPath: 'C:\\Program Files\\Browser\\browser.exe',
      topmost: true,
      isFront: false
    }
  ],
  apps: [
    {
      name: 'Terminal',
      pid: 11,
      nativeId: 'terminal-app',
      startTime: '638900000000000000',
      appPath: 'C:\\Program Files\\Terminal\\terminal.exe',
      running: true
    }
  ]
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function completedProcess(stdout: string, code = 0): PluginWindowManagerProcess {
  return Object.freeze({
    started: async () => undefined,
    wait: async () => ({ code, stdout }),
    kill: async () => undefined
  })
}

function controlledProcess(stdout = '{"success":true}') {
  const started = deferred<void>()
  const exit = deferred<{ code: number | null; stdout: string }>()
  const process: PluginWindowManagerProcess = Object.freeze({
    started: vi.fn(() => started.promise),
    wait: vi.fn(() => exit.promise),
    kill: vi.fn(async () => {
      exit.resolve({ code: null, stdout })
      await exit.promise
    })
  })
  return { exit, process, started }
}

function createHarness(
  options: {
    allowed?: boolean
    outputs?: readonly string[]
    processFactory?: (index: number) => PluginWindowManagerProcess
  } = {}
) {
  let current: PluginActivationIdentity | undefined = activation
  let hostGeneration = 7
  const revokeWatchers = new Set<() => void>()
  const outputs = [...(options.outputs ?? [INVENTORY, INVENTORY, '{"success":true}'])]
  let index = 0
  const spawn = vi.fn((_executable: string, _args: readonly string[], _options: unknown) => {
    const currentIndex = index++
    return options.processFactory?.(currentIndex) ?? completedProcess(outputs[currentIndex] ?? '')
  })
  const service = createFixedPluginWindowManagerService({
    platform: 'win32',
    windowsDirectory: 'C:\\Windows',
    spawn
  })
  const capability = createPluginWindowManagerCapabilities({
    activation,
    platform: 'win32',
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    authorizeShell: () => options.allowed ?? true,
    watchShellPermissionRevoked: (_pluginName, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'window-manager-host', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => options.allowed ?? true,
    watchPermissionRevoked: (_pluginName, _permissionId, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    isActive: () => true,
    onFatalViolation() {}
  })
  registry.register(capability.definitions[0])
  return {
    capability,
    registry,
    service,
    spawn,
    revoke() {
      for (const watcher of [...revokeWatchers]) watcher()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated-key' }
    },
    rotateHost() {
      hostGeneration = 8
    }
  }
}

function firstToken(result: unknown, kind: 'window' | 'app' = 'window'): string {
  const items = (result as { items: Array<{ kind: string; token: string }> }).items
  const item = items.find((entry) => entry.kind === kind)
  if (!item) throw new Error(`missing ${kind} token`)
  return item.token
}

describe('isolated window manager capability', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('lists bounded redacted DTOs with opaque tokens and fixed host scripts', async () => {
    const harness = createHarness({ outputs: [INVENTORY] })

    const result = await harness.registry.dispatch('system.window-manager', { operation: 'list' })

    expect(result).toMatchObject({
      operation: 'list',
      status: 'available',
      platform: 'win32'
    })
    expect((result as { items: unknown[] }).items[0]).toMatchObject({
      kind: 'window',
      name: 'Terminal',
      title: 'Workspace',
      isFront: true,
      topmost: false,
      actions: PLUGIN_WINDOW_MANAGER_ACTION_IDS.filter((action) => action !== 'launch')
    })
    expect(JSON.stringify(result)).not.toMatch(/6389|Program Files|nativeId|pid|handle|appPath/i)
    expect(firstToken(result)).toMatch(/^wm_[A-Za-z0-9_-]{32}$/)
    expect(harness.spawn).toHaveBeenCalledExactlyOnceWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']),
      expect.objectContaining({ shell: false, windowsHide: true })
    )
    const script = String(harness.spawn.mock.calls[0]?.[1]?.at(-1) ?? '')
    expect(script).toContain("$TuffWindowManagerOperation = 'list'")
  })

  it('projects the macOS action subset and keeps fixed JXA free of native titles', async () => {
    const inventory = JSON.stringify({
      windows: [
        {
          name: 'Safari',
          title: '\'; do shell script "open /Applications/Calculator.app"; \'',
          pid: 42,
          nativeId: '42',
          startTime: '42:com.apple.Safari:/Applications/Safari.app',
          appPath: '/Applications/Safari.app',
          topmost: false,
          isFront: true
        }
      ],
      apps: [
        {
          name: 'Safari',
          pid: 42,
          nativeId: 'com.apple.Safari',
          startTime: '42:com.apple.Safari:/Applications/Safari.app',
          appPath: '/Applications/Safari.app',
          running: true
        }
      ]
    })
    let current: PluginActivationIdentity | undefined = activation
    const spawn = vi
      .fn()
      .mockReturnValueOnce(completedProcess(inventory))
      .mockReturnValueOnce(completedProcess(inventory))
      .mockReturnValueOnce(completedProcess('{"success":true}'))
    const service = createFixedPluginWindowManagerService({
      platform: 'darwin',
      windowsDirectory: 'C:\\Windows',
      spawn
    })
    const capability = createPluginWindowManagerCapabilities({
      activation,
      platform: 'darwin',
      resolveCurrentActivation: () => current,
      resolveHostGeneration: () => 7,
      authorizeShell: () => true,
      watchShellPermissionRevoked: () => () => undefined,
      service
    })
    const registry = new PluginHostCapabilityRegistry({
      owner: { protocolVersion: 2, activationHandle: 'window-manager-host', hostGeneration: 7 },
      activation,
      resolveCurrentActivation: () => current,
      authorize: () => true,
      watchPermissionRevoked: () => () => undefined,
      isActive: () => true,
      onFatalViolation() {}
    })
    registry.register(capability.definitions[0])

    const listed = await registry.dispatch('system.window-manager', { operation: 'list' })
    expect(
      (listed as { items: Array<{ kind: string; actions: string[] }> }).items[0]?.actions
    ).toEqual(['activate', 'close', 'hide', 'quit'])
    await expect(
      registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: firstToken(listed)
      })
    ).resolves.toMatchObject({ status: 'completed' })
    const listArgs = spawn.mock.calls[0]?.[1] as readonly string[]
    expect(String(listArgs.at(-1))).toContain('NSRunningApplication')
    expect(String(listArgs.at(-1))).toContain('launchDate.timeIntervalSince1970')
    const actionArgs = spawn.mock.calls[2]?.[1] as readonly string[]
    expect(actionArgs[0]).toBe('-l')
    expect(actionArgs.slice(-3)).toEqual(['42', '42:com.apple.Safari:/Applications/Safari.app', ''])
    expect(String(actionArgs[3])).toContain('launchDate.timeIntervalSince1970')
    expect(String(actionArgs[3])).toContain('native identity changed')
    expect(JSON.stringify(actionArgs)).not.toContain('Calculator')
    expect(JSON.stringify(actionArgs)).not.toContain('do shell script')
    current = undefined
    await capability.close()
  })

  it.each([
    { operation: 'list', handle: '100' },
    {
      operation: 'act',
      action: 'activate',
      token: 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      script: 'calc.exe'
    },
    {
      operation: 'act',
      action: 'activate',
      token: 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      appPath: 'C:\\private.exe'
    },
    {
      operation: 'act',
      action: 'activate',
      token: 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      appName: 'Calculator'
    },
    { operation: 'act', action: 'restart', token: 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }
  ])('rejects hostile child authority fields %#', async (request) => {
    const harness = createHarness()
    await expect(harness.registry.dispatch('system.window-manager', request)).rejects.toMatchObject(
      {
        code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
      }
    )
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('uses single-use tokens and invalidates the previous list epoch', async () => {
    const harness = createHarness({
      outputs: [INVENTORY, INVENTORY, INVENTORY, INVENTORY, '{"success":true}']
    })
    const first = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const oldToken = firstToken(first)
    const second = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const secondTokens = (second as { items: Array<{ token: string }> }).items.map(
      (entry) => entry.token
    )
    expect(new Set(secondTokens).size).toBe(secondTokens.length)
    expect(secondTokens).not.toContain(oldToken)
    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: oldToken
      })
    ).resolves.toEqual({
      operation: 'act',
      action: 'activate',
      status: 'blocked',
      reason: 'token-replayed'
    })

    const current = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const token = firstToken(current)
    expect(token).not.toBe(oldToken)
    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token
      })
    ).resolves.toMatchObject({ status: 'completed' })
    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })
  })

  it('serializes list and act admission so epoch changes cannot race token consumption', async () => {
    const secondList = controlledProcess(INVENTORY)
    secondList.started.resolve()
    const harness = createHarness({
      processFactory: (index) =>
        index === 0
          ? completedProcess(INVENTORY)
          : index === 1
            ? secondList.process
            : completedProcess('')
    })
    const first = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const oldToken = firstToken(first)
    const pendingList = harness.registry.dispatch('system.window-manager', { operation: 'list' })
    await vi.waitFor(() => expect(secondList.process.wait).toHaveBeenCalledOnce())

    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: oldToken
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CONCURRENCY_LIMIT' })

    secondList.exit.resolve({ code: 0, stdout: INVENTORY })
    await expect(pendingList).resolves.toMatchObject({ status: 'available' })
    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: oldToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })
  })

  it('consumes every admitted act once but preserves tokens after request validation failure', async () => {
    const validAfterMalformed = createHarness({
      outputs: [INVENTORY, INVENTORY, '{"success":true}']
    })
    const listed = await validAfterMalformed.registry.dispatch('system.window-manager', {
      operation: 'list'
    })
    const token = firstToken(listed)
    await expect(
      validAfterMalformed.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token,
        path: 'C:\\forged.exe'
      } as never)
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    await expect(
      validAfterMalformed.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token
      })
    ).resolves.toMatchObject({ status: 'completed' })

    const unsupported = createHarness({ outputs: [INVENTORY] })
    const unsupportedList = await unsupported.registry.dispatch('system.window-manager', {
      operation: 'list'
    })
    const unsupportedToken = firstToken(unsupportedList)
    await expect(
      unsupported.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'launch',
        token: unsupportedToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'action-unsupported' })
    await expect(
      unsupported.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: unsupportedToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })

    const transientFailure = createHarness({
      outputs: [INVENTORY, INVENTORY, '{"success":false}']
    })
    const failureList = await transientFailure.registry.dispatch('system.window-manager', {
      operation: 'list'
    })
    const failureToken = firstToken(failureList)
    await expect(
      transientFailure.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: failureToken
      })
    ).resolves.toMatchObject({ status: 'failed', reason: 'action-failed' })
    await expect(
      transientFailure.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: failureToken
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-replayed' })
  })

  it('rejects sparse and accessor-backed capability results without evaluating getters', () => {
    const harness = createHarness()
    const validate = harness.capability.definitions[0].validateResult
    const sparseItems = new Array(1)
    expect(() =>
      validate({ operation: 'list', status: 'available', platform: 'win32', items: sparseItems })
    ).toThrow('PLUGIN_WINDOW_MANAGER_INVALID')

    const getter = vi.fn(() => 'activate')
    const actions = new Array(7)
    Object.defineProperty(actions, '0', { enumerable: true, get: getter })
    for (let index = 1; index < 7; index += 1) {
      Object.defineProperty(actions, String(index), {
        enumerable: true,
        value: PLUGIN_WINDOW_MANAGER_ACTION_IDS[index]
      })
    }
    expect(() =>
      validate({
        operation: 'list',
        status: 'available',
        platform: 'win32',
        items: [
          {
            kind: 'window',
            token: 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            name: 'Terminal',
            title: 'Workspace',
            isFront: true,
            topmost: false,
            actions
          }
        ]
      })
    ).toThrow('PLUGIN_WINDOW_MANAGER_INVALID')
    expect(getter).not.toHaveBeenCalled()
  })

  it('expires tokens and rejects cross-plugin and cross-generation tokens', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    const first = createHarness({ outputs: [INVENTORY] })
    const listed = await first.registry.dispatch('system.window-manager', { operation: 'list' })
    const token = firstToken(listed)
    vi.setSystemTime(Date.now() + PLUGIN_WINDOW_MANAGER_TOKEN_TTL_MS)
    await expect(
      first.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-expired' })

    const foreign = createHarness()
    await expect(
      foreign.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'token-invalid' })

    const stale = createHarness()
    const staleList = await stale.registry.dispatch('system.window-manager', { operation: 'list' })
    stale.rotate()
    await expect(
      stale.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: firstToken(staleList)
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
  })

  it('revalidates native identity before mutation and never interpolates native titles', async () => {
    const marker = "'; Start-Process calc.exe; #'"
    const initial = JSON.stringify({
      windows: [
        {
          name: marker,
          title: marker,
          pid: 11,
          nativeId: '100',
          startTime: '638900000000000000',
          appPath: 'C:\\Program Files\\Terminal\\terminal.exe',
          topmost: false,
          isFront: true
        }
      ],
      apps: []
    })
    const replaced = JSON.stringify({
      windows: [
        {
          name: marker,
          title: marker,
          pid: 99,
          nativeId: '100',
          startTime: '638900000000009999',
          appPath: 'C:\\Program Files\\Terminal\\terminal.exe',
          topmost: false,
          isFront: true
        }
      ],
      apps: []
    })
    const harness = createHarness({ outputs: [initial, replaced] })
    const listed = await harness.registry.dispatch('system.window-manager', { operation: 'list' })

    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'activate',
        token: firstToken(listed)
      })
    ).resolves.toEqual({
      operation: 'act',
      action: 'activate',
      status: 'blocked',
      reason: 'native-replaced'
    })
    expect(harness.spawn).toHaveBeenCalledTimes(2)

    const accepted = createHarness({ outputs: [initial, initial, '{"success":true}'] })
    const acceptedList = await accepted.registry.dispatch('system.window-manager', {
      operation: 'list'
    })
    await accepted.registry.dispatch('system.window-manager', {
      operation: 'act',
      action: 'activate',
      token: firstToken(acceptedList)
    })
    const mutationArgs = accepted.spawn.mock.calls[2]?.[1] as readonly string[]
    expect(mutationArgs.slice(-3)).toEqual(['100', '11', '638900000000000000'])
    expect(String(mutationArgs.at(-4))).toContain('native identity changed')
    expect(String(mutationArgs.at(-4))).toContain('MainWindowHandle')
    expect(JSON.stringify(mutationArgs)).not.toContain(marker)
    expect(JSON.stringify(mutationArgs)).toContain("$TuffWindowManagerOperation = 'act:activate'")
  })

  it('accepts launch only through an app token from the current inventory', async () => {
    const harness = createHarness({ outputs: [INVENTORY, INVENTORY, '{"success":true}'] })
    const listed = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const appToken = firstToken(listed, 'app')
    await expect(
      harness.registry.dispatch('system.window-manager', {
        operation: 'act',
        action: 'launch',
        token: appToken
      })
    ).resolves.toMatchObject({ status: 'completed', action: 'launch' })
    const launchArgs = harness.spawn.mock.calls[2]?.[1] as readonly string[]
    expect(launchArgs.slice(-2)).toEqual(['11', '638900000000000000'])
    expect(String(launchArgs.at(-3))).toContain('native identity changed')
    expect(JSON.stringify(launchArgs)).not.toContain('Program Files')
    expect(JSON.stringify(launchArgs)).not.toContain('Start-Process')
  })

  it('rejects stale host generations and denied permission before host work', async () => {
    const stale = createHarness()
    stale.rotateHost()
    await expect(
      stale.registry.dispatch('system.window-manager', { operation: 'list' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(stale.spawn).not.toHaveBeenCalled()

    const denied = createHarness({ allowed: false })
    await expect(
      denied.registry.dispatch('system.window-manager', { operation: 'list' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })
    expect(denied.spawn).not.toHaveBeenCalled()
  })

  it('rejects cross-plugin authoritative contexts before native work', async () => {
    const harness = createHarness()
    const other = Object.freeze({ ...activation, name: 'touch-window-presets' })
    await expect(
      harness.capability.definitions[0].invoke(
        issuePluginSecurityContext(other, 'plugin-host', { hostGeneration: 7 }),
        { operation: 'list' },
        new AbortController().signal,
        { register: vi.fn() } as never
      )
    ).rejects.toThrow('PLUGIN_WINDOW_MANAGER_INVALID')
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('kills once and awaits true exit on cancellation, revoke and close', async () => {
    const list = completedProcess(INVENTORY)
    const revalidate = completedProcess(INVENTORY)
    const action = controlledProcess()
    action.started.resolve()
    const harness = createHarness({
      processFactory: (index) => [list, revalidate, action.process][index] ?? action.process
    })
    const listed = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const controller = new AbortController()
    const pending = harness.registry.dispatch(
      'system.window-manager',
      { operation: 'act', action: 'activate', token: firstToken(listed) },
      controller.signal
    )
    await vi.waitFor(() => expect(action.process.wait).toHaveBeenCalledOnce())
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    await expect(harness.capability.close()).resolves.toBeUndefined()
    expect(action.process.kill).toHaveBeenCalledOnce()

    const revokeAction = controlledProcess()
    revokeAction.started.resolve()
    const revoked = createHarness({
      processFactory: (index) =>
        [completedProcess(INVENTORY), completedProcess(INVENTORY), revokeAction.process][index] ??
        revokeAction.process
    })
    const revokeList = await revoked.registry.dispatch('system.window-manager', {
      operation: 'list'
    })
    const revokePending = revoked.registry.dispatch('system.window-manager', {
      operation: 'act',
      action: 'activate',
      token: firstToken(revokeList)
    })
    await vi.waitFor(() => expect(revokeAction.process.wait).toHaveBeenCalledOnce())
    revoked.revoke()
    await expect(revokePending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    })
    await expect(revoked.capability.close()).resolves.toBeUndefined()
    expect(revokeAction.process.kill).toHaveBeenCalledOnce()
  })

  it('keeps reentrant close pending until a synchronously acquired process really exits', async () => {
    const started = deferred<void>()
    const exit = deferred<{ code: number | null; stdout: string }>()
    started.resolve()
    const actionProcess: PluginWindowManagerProcess = Object.freeze({
      started: vi.fn(() => started.promise),
      wait: vi.fn(() => exit.promise),
      kill: vi.fn(async () => undefined)
    })
    let closing: Promise<void> | undefined
    let harness!: ReturnType<typeof createHarness>
    harness = createHarness({
      processFactory: (index) => {
        if (index === 0 || index === 1) return completedProcess(INVENTORY)
        closing = harness.capability.close()
        return actionProcess
      }
    })
    const listed = await harness.registry.dispatch('system.window-manager', { operation: 'list' })
    const pending = harness.registry.dispatch('system.window-manager', {
      operation: 'act',
      action: 'activate',
      token: firstToken(listed)
    })
    const pendingResult = pending.catch((error: unknown) => error)
    await vi.waitFor(() => expect(actionProcess.kill).toHaveBeenCalledOnce())
    expect(closing).toBeDefined()

    let closeSettled = false
    void closing?.then(() => {
      closeSettled = true
    })
    await Promise.resolve()
    expect(closeSettled).toBe(false)

    exit.resolve({ code: null, stdout: '{"success":false}' })
    await expect(pendingResult).resolves.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    })
    await expect(closing).resolves.toBeUndefined()
    expect(actionProcess.kill).toHaveBeenCalledOnce()
  })

  it('fails closed on malformed, oversized and over-count native inventories', async () => {
    const overCount = JSON.stringify({
      windows: Array.from({ length: 129 }, (_, index) => ({
        name: 'App',
        title: `Window ${index}`,
        pid: index + 1,
        nativeId: String(index + 1),
        startTime: String(index + 1),
        appPath: `C:\\Apps\\app-${index}.exe`,
        topmost: false,
        isFront: false
      })),
      apps: []
    })
    for (const output of [
      '{"windows":[{"handle":"100"}],"apps":[]}',
      overCount,
      'x'.repeat(PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES + 1)
    ]) {
      const harness = createHarness({ outputs: [output] })
      await expect(
        harness.registry.dispatch('system.window-manager', { operation: 'list' })
      ).resolves.toEqual({ operation: 'list', status: 'failed', reason: 'list-failed' })
    }
  })

  it('rejects structural service copies and invalid Windows roots before host work', () => {
    const harness = createHarness()
    const base = {
      activation,
      platform: 'win32' as NodeJS.Platform,
      resolveCurrentActivation: () => activation,
      resolveHostGeneration: () => 7,
      authorizeShell: () => true,
      watchShellPermissionRevoked: () => () => undefined
    }
    expect(() =>
      createPluginWindowManagerCapabilities({
        ...base,
        service: { ...harness.service }
      } as never)
    ).toThrow('PLUGIN_WINDOW_MANAGER_INVALID')
    expect(() =>
      createPluginWindowManagerCapabilities({
        ...base,
        activation: { ...activation, name: 'touch-window-presets' },
        service: harness.service
      })
    ).toThrow('PLUGIN_WINDOW_MANAGER_INVALID')
    for (const windowsDirectory of ['\\\\server\\Windows', 'C:\\Temp', 'C:\\Windows\\..\\Temp']) {
      expect(() =>
        createFixedPluginWindowManagerService({
          platform: 'win32',
          windowsDirectory,
          spawn: () => completedProcess(INVENTORY)
        })
      ).toThrow('PLUGIN_WINDOW_MANAGER_INVALID')
    }
  })

  it('adapts output limits, kill requests and real exit as separate barriers', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid?: number
      stdout: EventEmitter
      kill: ReturnType<typeof vi.fn>
    }
    child.stdout = new EventEmitter()
    child.kill = vi.fn(() => true)
    const process = createPluginWindowManagerProcess(child as unknown as ChildProcess)
    child.emit('spawn')
    await process.started()
    child.stdout.emit('data', Buffer.alloc(PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES + 1, 65))
    expect(child.kill).toHaveBeenCalledOnce()
    const terminating = Promise.resolve(process.kill())
    let settled = false
    void terminating.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await Promise.resolve()
    expect(settled).toBe(false)
    child.emit('exit', null)
    await expect(terminating).rejects.toThrow('PLUGIN_WINDOW_MANAGER_PROCESS_OUTPUT_LIMIT')
    expect(child.kill).toHaveBeenCalledOnce()
  })
})
