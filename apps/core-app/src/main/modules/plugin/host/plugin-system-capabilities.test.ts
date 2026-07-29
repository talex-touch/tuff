import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import { PluginHostResourceRegistry } from './plugin-host-resources'
import {
  createFixedPluginSystemActionConfirmation,
  createFixedPluginSystemActionExecutor,
  createPluginSystemActionCapabilities,
  createPluginSystemActionProcess,
  PLUGIN_SYSTEM_ACTION_POLICIES,
  PLUGIN_SYSTEM_ACTION_TIMEOUT_MS,
  type PluginSystemActionId,
  type PluginSystemActionMessageBoxOptions,
  type PluginSystemActionProcess
} from './plugin-system-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-quick-actions',
  pluginInstanceId: 'quick-actions-instance',
  activationGeneration: 1,
  key: 'quick-actions-key'
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function controlledProcess() {
  const exit = deferred<{ code: number | null }>()
  const process: PluginSystemActionProcess = Object.freeze({
    wait: vi.fn(() => exit.promise),
    kill: vi.fn(async () => {
      exit.resolve({ code: null })
      await exit.promise
    })
  })
  return { exit, process }
}

function completedProcess(code = 0): PluginSystemActionProcess {
  return Object.freeze({
    wait: vi.fn(async () => ({ code })),
    kill: vi.fn(async () => undefined)
  })
}

function createHarness(
  options: {
    allowed?: boolean
    confirm?: (actionId: PluginSystemActionId, signal: AbortSignal) => Promise<boolean>
    hostGeneration?: number
    process?: PluginSystemActionProcess
    start?: (actionId: PluginSystemActionId) => PluginSystemActionProcess
    activation?: PluginActivationIdentity
    platform?: NodeJS.Platform
    showMainWindow?: (
      activation: PluginActivationIdentity,
      hostGeneration: number,
      signal: AbortSignal
    ) => Promise<void>
  } = {}
) {
  const expectedActivation = options.activation ?? activation
  let current: PluginActivationIdentity | undefined = expectedActivation
  let active = true
  const revokeWatchers = new Set<() => void>()
  const executor = Object.freeze({
    start: vi.fn((actionId: PluginSystemActionId) =>
      options.start ? options.start(actionId) : (options.process ?? completedProcess())
    )
  })
  const confirmation = Object.freeze({
    confirm: vi.fn(
      options.confirm ?? (async (_actionId: PluginSystemActionId, _signal: AbortSignal) => true)
    )
  })
  const system = createPluginSystemActionCapabilities({
    activation: expectedActivation,
    platform: options.platform ?? 'darwin',
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => options.hostGeneration ?? 7,
    executor,
    confirmation,
    authorizeShell: () => options.allowed ?? true,
    watchShellPermissionRevoked: (_pluginName, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    window: Object.freeze({
      showMainWindow:
        options.showMainWindow ??
        (async (
          _activation: PluginActivationIdentity,
          _hostGeneration: number,
          _signal: AbortSignal
        ) => undefined)
    })
  })
  const owner = {
    protocolVersion: 2 as const,
    activationHandle: 'quick-actions-host',
    hostGeneration: 7
  }
  const resources = new PluginHostResourceRegistry({
    owner,
    activation: expectedActivation,
    resolveCurrentActivation: () => current,
    isActive: () => active,
    createResourceId: () => 'quick-actions-process',
    watchPermissionRevoked: (_pluginName, _permissionId, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    }
  })
  const registry = new PluginHostCapabilityRegistry({
    owner,
    activation: expectedActivation,
    resolveCurrentActivation: () => current,
    authorize: () => options.allowed ?? true,
    watchPermissionRevoked: (_pluginName, _permissionId, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    resources,
    isActive: () => active,
    onFatalViolation() {}
  })
  registry.register(system.definitions[0])
  return {
    confirmation,
    executor,
    registry,
    resources,
    revoke() {
      for (const watcher of [...revokeWatchers]) watcher()
    },
    rotate() {
      current = { ...expectedActivation, activationGeneration: 2, key: 'rotated-key' }
    },
    async disable() {
      active = false
      registry.close()
      await resources.close()
    }
  }
}

describe('isolated Quick Actions system capability', () => {
  it.each([
    [
      'darwin',
      'restart',
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to restart']
    ],
    [
      'darwin',
      'shutdown',
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to shut down']
    ],
    ['darwin', 'lock-screen', '/usr/bin/pmset', ['displaysleepnow']],
    [
      'darwin',
      'volume-up',
      '/usr/bin/osascript',
      ['-e', 'set volume output volume (output volume of (get volume settings) + 10)']
    ],
    [
      'darwin',
      'volume-down',
      '/usr/bin/osascript',
      ['-e', 'set volume output volume (output volume of (get volume settings) - 10)']
    ],
    [
      'darwin',
      'mute-toggle',
      '/usr/bin/osascript',
      ['-e', 'set volume output muted not (output muted of (get volume settings))']
    ],
    ['darwin', 'focus-settings', '/usr/bin/open', ['x-apple.systempreferences:com.apple.Focus']],
    [
      'darwin',
      'notification-settings',
      '/usr/bin/open',
      ['x-apple.systempreferences:com.apple.preference.notifications']
    ],
    [
      'darwin',
      'sound-settings',
      '/usr/bin/open',
      ['x-apple.systempreferences:com.apple.preference.sound']
    ],
    [
      'darwin',
      'display-settings',
      '/usr/bin/open',
      ['x-apple.systempreferences:com.apple.preference.displays']
    ],
    [
      'darwin',
      'brightness-up',
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to key code 144']
    ],
    [
      'darwin',
      'brightness-down',
      '/usr/bin/osascript',
      ['-e', 'tell application "System Events" to key code 145']
    ],
    ['win32', 'restart', 'shutdown.exe', ['/r', '/t', '0']],
    ['win32', 'shutdown', 'shutdown.exe', ['/s', '/t', '0']],
    ['win32', 'lock-screen', 'rundll32.exe', ['user32.dll,LockWorkStation']],
    [
      'win32',
      'volume-up',
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]175)'
      ]
    ],
    [
      'win32',
      'volume-down',
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]174)'
      ]
    ],
    [
      'win32',
      'mute-toggle',
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]173)'
      ]
    ],
    ['win32', 'focus-settings', 'explorer.exe', ['ms-settings:quiethours']],
    ['win32', 'notification-settings', 'explorer.exe', ['ms-settings:notifications']],
    ['win32', 'sound-settings', 'explorer.exe', ['ms-settings:sound']],
    ['win32', 'display-settings', 'explorer.exe', ['ms-settings:display']]
  ] as const)(
    'maps %s %s to one fixed executable and argument vector',
    (platform, actionId, executable, args) => {
      const process = completedProcess()
      const spawn = vi.fn(() => process)
      const executor = createFixedPluginSystemActionExecutor({ platform, spawn })

      expect(executor.start(actionId)).toBe(process)
      expect(spawn).toHaveBeenCalledExactlyOnceWith(executable, args, {
        windowsHide: true,
        stdio: 'ignore'
      })
    }
  )

  it('opens the main window through the injected host service without shell permission or spawn', async () => {
    const systemActivation = Object.freeze({
      name: 'touch-system-actions',
      pluginInstanceId: 'system-actions-instance',
      activationGeneration: 1,
      key: 'system-actions-key'
    })
    const showMainWindow = vi.fn(
      async (
        _activation: PluginActivationIdentity,
        _hostGeneration: number,
        _signal: AbortSignal
      ) => undefined
    )
    const harness = createHarness({
      activation: systemActivation,
      allowed: false,
      showMainWindow
    })

    await expect(
      harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'open-main-window'
      })
    ).resolves.toEqual({ actionId: 'open-main-window', status: 'started' })
    expect(showMainWindow).toHaveBeenCalledExactlyOnceWith(
      systemActivation,
      7,
      expect.any(AbortSignal)
    )
    expect(harness.executor.start).not.toHaveBeenCalled()
    await harness.disable()
  })

  it('returns stable unsupported for platform-specific brightness without spawning', async () => {
    const systemActivation = Object.freeze({
      name: 'touch-system-actions',
      pluginInstanceId: 'system-actions-instance',
      activationGeneration: 1,
      key: 'system-actions-key'
    })
    const harness = createHarness({ activation: systemActivation, platform: 'win32' })

    await expect(
      harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'brightness-up'
      })
    ).resolves.toEqual({
      actionId: 'brightness-up',
      status: 'blocked',
      reason: 'platform-unsupported'
    })
    expect(harness.executor.start).not.toHaveBeenCalled()
    await harness.disable()
  })

  it('rejects fixed actions outside the authoritative plugin-specific allowlist', async () => {
    const quickActions = createHarness()
    await expect(
      quickActions.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'open-main-window'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(quickActions.executor.start).not.toHaveBeenCalled()
    await quickActions.disable()

    const systemActivation = Object.freeze({
      name: 'touch-system-actions',
      pluginInstanceId: 'system-actions-instance',
      activationGeneration: 1,
      key: 'system-actions-key'
    })
    const systemActions = createHarness({ activation: systemActivation })
    await expect(
      systemActions.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'focus-settings'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(systemActions.executor.start).not.toHaveBeenCalled()
    await systemActions.disable()
  })

  it('keeps destructive, immediate and settings policies explicit', () => {
    expect(PLUGIN_SYSTEM_ACTION_POLICIES.restart).toEqual({
      risk: 'destructive',
      confirmation: 'double'
    })
    expect(PLUGIN_SYSTEM_ACTION_POLICIES.shutdown).toEqual({
      risk: 'destructive',
      confirmation: 'double'
    })
    expect(PLUGIN_SYSTEM_ACTION_POLICIES['lock-screen']).toEqual({
      risk: 'immediate',
      confirmation: 'none'
    })
    expect(PLUGIN_SYSTEM_ACTION_POLICIES['mute-toggle']).toEqual({
      risk: 'immediate',
      confirmation: 'none'
    })
    for (const actionId of [
      'focus-settings',
      'notification-settings',
      'sound-settings',
      'display-settings'
    ] as const) {
      expect(PLUGIN_SYSTEM_ACTION_POLICIES[actionId]).toEqual({
        risk: 'settings',
        confirmation: 'none'
      })
    }
  })

  it('builds two fixed main-owned confirmations only for destructive actions', async () => {
    const showMessageBox = vi.fn(async (_options: PluginSystemActionMessageBoxOptions) => ({
      response: 1
    }))
    const confirmation = createFixedPluginSystemActionConfirmation({ showMessageBox })
    const signal = new AbortController().signal

    await expect(confirmation.confirm('restart', signal)).resolves.toBe(true)
    expect(showMessageBox).toHaveBeenCalledTimes(2)
    expect(showMessageBox.mock.calls[0]?.[0]).toEqual({
      type: 'warning',
      title: '确认重启',
      message: '确定要执行重启吗？',
      detail: '该操作会立即影响系统状态，请确认你已保存当前工作内容。',
      buttons: ['取消', '确定'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      signal
    })
    await expect(confirmation.confirm('lock-screen', signal)).resolves.toBe(true)
    expect(showMessageBox).toHaveBeenCalledTimes(2)
  })

  it('passes cancellation into a destructive native confirmation', async () => {
    const showMessageBox = vi.fn(
      async (options: PluginSystemActionMessageBoxOptions) =>
        await new Promise<{ response: number }>((resolve) => {
          options.signal.addEventListener('abort', () => resolve({ response: 0 }), { once: true })
        })
    )
    const confirmation = createFixedPluginSystemActionConfirmation({ showMessageBox })
    const controller = new AbortController()
    const pending = confirmation.confirm('shutdown', controller.signal)
    await vi.waitFor(() => expect(showMessageBox).toHaveBeenCalledOnce())

    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    expect(showMessageBox.mock.calls[0]?.[0].signal).toBe(controller.signal)
  })

  it('rejects hostile confirmation results without evaluating accessors', async () => {
    const response = vi.fn(() => 1)
    const hostile = {}
    Object.defineProperty(hostile, 'response', { enumerable: true, get: response })
    const confirmation = createFixedPluginSystemActionConfirmation({
      showMessageBox: vi.fn(async () => hostile as { response: number })
    })

    await expect(confirmation.confirm('restart', new AbortController().signal)).rejects.toThrow(
      'PLUGIN_SYSTEM_ACTION_INVALID'
    )
    expect(response).not.toHaveBeenCalled()
  })

  it('adapts a spawned process to one idempotent kill and exit barrier', async () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> }
    child.kill = vi.fn(() => {
      queueMicrotask(() => child.emit('exit', null))
      return true
    })
    const process = createPluginSystemActionProcess(child as unknown as ChildProcess)

    const first = process.kill()
    const second = process.kill()
    await Promise.all([first, second, process.wait()])

    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('does not treat a rejected kill request as a real process exit', async () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> }
    child.kill = vi.fn(() => false)
    Object.defineProperty(child, 'pid', { value: 321 })
    const process = createPluginSystemActionProcess(child as unknown as ChildProcess)
    const kill = Promise.resolve(process.kill())
    let settled = false
    void kill
      .finally(() => {
        settled = true
      })
      .catch(() => undefined)

    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    child.emit('exit', null)
    await expect(kill).rejects.toThrow('PLUGIN_SYSTEM_ACTION_KILL_FAILED')
    await expect(process.wait()).resolves.toEqual({ code: null })
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('waits for exit after a spawned child emits a non-terminal error', async () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> }
    child.kill = vi.fn(() => true)
    Object.defineProperty(child, 'pid', { value: 322 })
    const process = createPluginSystemActionProcess(child as unknown as ChildProcess)
    const wait = process.wait()
    let settled = false
    void wait.finally(() => {
      settled = true
    })

    child.emit('error', new Error('kill delivery failed'))
    await Promise.resolve()
    expect(settled).toBe(false)

    child.emit('exit', 0)
    await expect(wait).resolves.toEqual({ code: 0 })
  })

  it('reports a pre-spawn child error without claiming a successful exit', async () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> }
    child.kill = vi.fn(() => false)
    const process = createPluginSystemActionProcess(child as unknown as ChildProcess)
    const wait = process.wait()

    child.emit('error', new Error('spawn failed'))

    await expect(wait).rejects.toThrow('PLUGIN_SYSTEM_ACTION_SPAWN_FAILED')
  })

  it.each([
    null,
    {},
    { operation: 'run-action' },
    { operation: 'run-action', actionId: 'unknown' },
    { operation: 'run-action', actionId: 'lock-screen', command: 'rm -rf /' },
    { operation: 'run-action', actionId: 'lock-screen', args: ['--unsafe'] },
    { operation: 'run-action', actionId: 'lock-screen', env: { TOKEN: 'secret' } },
    { operation: 'run-action', actionId: 'lock-screen', cwd: '/tmp' },
    { operation: 'run-action', actionId: 'lock-screen', url: 'https://evil.test' },
    { operation: 'run-action', actionId: 'lock-screen', script: 'unsafe' }
  ])('rejects hostile or non-exact requests before execution: %j', async (request) => {
    const harness = createHarness()
    await expect(harness.registry.dispatch('system.invoke', request)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
    })
    expect(harness.executor.start).not.toHaveBeenCalled()
    await harness.disable()
  })

  it('rejects accessors and proxies without evaluating them', async () => {
    const getter = vi.fn(() => 'lock-screen')
    const request = { operation: 'run-action' }
    Object.defineProperty(request, 'actionId', { enumerable: true, get: getter })
    const harness = createHarness()

    await expect(harness.registry.dispatch('system.invoke', request)).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
    })
    await expect(
      harness.registry.dispatch(
        'system.invoke',
        new Proxy({ operation: 'run-action', actionId: 'lock-screen' }, { get: () => 'restart' })
      )
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST' })
    expect(getter).not.toHaveBeenCalled()
    expect(harness.executor.start).not.toHaveBeenCalled()
    await harness.disable()
  })

  it('executes a fixed safe action with no child-supplied process fields', async () => {
    const harness = createHarness()

    await expect(
      harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).resolves.toEqual({ actionId: 'lock-screen', status: 'started' })

    expect(harness.confirmation.confirm).not.toHaveBeenCalled()
    expect(harness.executor.start).toHaveBeenCalledExactlyOnceWith('lock-screen')
    expect(harness.resources.size).toBe(0)
    await harness.disable()
  })

  it('keeps destructive confirmation main-owned and stable on deny, approve and failure', async () => {
    const denied = createHarness({ confirm: async () => false })
    await expect(
      denied.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'shutdown'
      })
    ).resolves.toEqual({
      actionId: 'shutdown',
      status: 'blocked',
      reason: 'confirmation-denied'
    })
    expect(denied.executor.start).not.toHaveBeenCalled()
    await denied.disable()

    const approved = createHarness({ confirm: async () => true })
    await expect(
      approved.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'restart'
      })
    ).resolves.toEqual({ actionId: 'restart', status: 'started' })
    expect(approved.confirmation.confirm).toHaveBeenCalledExactlyOnceWith(
      'restart',
      expect.any(AbortSignal)
    )
    expect(approved.executor.start).toHaveBeenCalledExactlyOnceWith('restart')
    await approved.disable()

    const failed = createHarness({ confirm: async () => Promise.reject(new Error('/private')) })
    await expect(
      failed.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'shutdown'
      })
    ).resolves.toEqual({
      actionId: 'shutdown',
      status: 'blocked',
      reason: 'confirmation-unavailable'
    })
    expect(failed.executor.start).not.toHaveBeenCalled()
    await failed.disable()
  })

  it('rechecks the activation after destructive confirmation before spawning', async () => {
    const started = deferred<void>()
    const decision = deferred<boolean>()
    const harness = createHarness({
      confirm: async () => {
        started.resolve()
        return await decision.promise
      }
    })
    const pending = harness.registry.dispatch('system.invoke', {
      operation: 'run-action',
      actionId: 'restart'
    })
    await started.promise

    harness.rotate()
    decision.resolve(true)

    await expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    })
    expect(harness.executor.start).not.toHaveBeenCalled()
    await harness.disable()
  })

  it('kills a process when activation rotation wins during spawn', async () => {
    const controlled = controlledProcess()
    let harness!: ReturnType<typeof createHarness>
    harness = createHarness({
      start: () => {
        harness.rotate()
        return controlled.process
      }
    })

    await expect(
      harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(controlled.process.kill).toHaveBeenCalledOnce()
    await controlled.exit.promise
    await harness.disable()
  })

  it('contains spawn throws and malformed process adapters without reading accessors', async () => {
    const throwing = createHarness({
      start: () => {
        throw new Error('/private/spawn failure')
      }
    })
    await expect(
      throwing.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).resolves.toEqual({
      actionId: 'lock-screen',
      status: 'failed',
      reason: 'execution-failed'
    })
    await throwing.disable()

    const wait = vi.fn(async () => ({ code: 0 }))
    const hostile = { kill: vi.fn(async () => undefined) }
    Object.defineProperty(hostile, 'wait', { enumerable: true, get: wait })
    const malformed = createHarness({
      start: () => hostile as unknown as PluginSystemActionProcess
    })
    await expect(
      malformed.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).resolves.toEqual({
      actionId: 'lock-screen',
      status: 'failed',
      reason: 'execution-failed'
    })
    expect(wait).not.toHaveBeenCalled()
    await malformed.disable()
  })

  it('terminates process adapters whose wait result rejects or is forged', async () => {
    const rejectedKill = vi.fn(async () => undefined)
    const rejected = createHarness({
      process: Object.freeze({
        wait: vi.fn(async () => {
          throw new Error('forged wait failure')
        }),
        kill: rejectedKill
      })
    })
    await expect(
      rejected.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).resolves.toEqual({
      actionId: 'lock-screen',
      status: 'failed',
      reason: 'execution-failed'
    })
    expect(rejectedKill).toHaveBeenCalledOnce()
    await rejected.disable()

    const forgedKill = vi.fn(async () => undefined)
    const forged = createHarness({
      process: Object.freeze({
        wait: vi.fn(async () => ({ code: 0, extra: true }) as unknown as { code: number | null }),
        kill: forgedKill
      })
    })
    await expect(
      forged.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).resolves.toEqual({
      actionId: 'lock-screen',
      status: 'failed',
      reason: 'execution-failed'
    })
    expect(forgedKill).toHaveBeenCalledOnce()
    await forged.disable()
  })

  it('enforces one active system action before allocating another process resource', async () => {
    const controlled = controlledProcess()
    const harness = createHarness({ process: controlled.process })
    const controller = new AbortController()
    const first = harness.registry.dispatch(
      'system.invoke',
      { operation: 'run-action', actionId: 'mute-toggle' },
      controller.signal
    )
    await vi.waitFor(() => expect(harness.executor.start).toHaveBeenCalledOnce())

    await expect(
      harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CONCURRENCY_LIMIT' })
    expect(harness.executor.start).toHaveBeenCalledOnce()

    controller.abort()
    await expect(first).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' })
    await harness.disable()
  })

  it.each(['cancel', 'revoke', 'disable'] as const)(
    '%s aborts a pending destructive confirmation without starting a process',
    async (mode) => {
      const started = deferred<void>()
      const harness = createHarness({
        confirm: async (_actionId, signal) => {
          started.resolve()
          return await new Promise<boolean>((resolve) => {
            signal.addEventListener('abort', () => resolve(false), { once: true })
          })
        }
      })
      const controller = new AbortController()
      const pending = harness.registry.dispatch(
        'system.invoke',
        { operation: 'run-action', actionId: 'restart' },
        controller.signal
      )
      await started.promise

      if (mode === 'cancel') controller.abort()
      else if (mode === 'revoke') harness.revoke()
      else await harness.disable()

      if (mode === 'revoke') {
        await expect(pending).resolves.toEqual({
          actionId: 'restart',
          status: 'blocked',
          reason: 'permission-denied'
        })
      } else {
        await expect(pending).rejects.toMatchObject({
          code:
            mode === 'disable'
              ? 'PLUGIN_HOST_CAPABILITY_CLOSED'
              : 'PLUGIN_HOST_CAPABILITY_CANCELLED'
        })
      }
      expect(harness.executor.start).not.toHaveBeenCalled()
      expect(harness.resources.size).toBe(0)
      if (mode !== 'disable') await harness.disable()
    }
  )

  it('times out a pending destructive confirmation without starting a process', async () => {
    vi.useFakeTimers()
    try {
      const harness = createHarness({
        confirm: async (_actionId, signal) =>
          await new Promise<boolean>((resolve) => {
            signal.addEventListener('abort', () => resolve(false), { once: true })
          })
      })
      const pending = harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'shutdown'
      })
      const timedOut = expect(pending).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_TIMEOUT'
      })
      await vi.advanceTimersByTimeAsync(PLUGIN_SYSTEM_ACTION_TIMEOUT_MS)

      await timedOut
      expect(harness.executor.start).not.toHaveBeenCalled()
      expect(harness.resources.size).toBe(0)
      await harness.disable()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed on permission denial, stale activation and wrong host generation', async () => {
    const denied = createHarness({ allowed: false })
    await expect(
      denied.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).resolves.toEqual({
      actionId: 'lock-screen',
      status: 'blocked',
      reason: 'permission-denied'
    })
    expect(denied.executor.start).not.toHaveBeenCalled()
    await denied.disable()

    const stale = createHarness()
    stale.rotate()
    await expect(
      stale.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    expect(stale.executor.start).not.toHaveBeenCalled()
    await stale.disable()

    const wrongGeneration = createHarness({ hostGeneration: 8 })
    await expect(
      wrongGeneration.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'lock-screen'
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(wrongGeneration.executor.start).not.toHaveBeenCalled()
    await wrongGeneration.disable()
  })

  it.each(['cancel', 'revoke', 'disable'] as const)(
    '%s kills an in-flight process exactly once and awaits its exit barrier',
    async (mode) => {
      const controlled = controlledProcess()
      const harness = createHarness({ process: controlled.process })
      const controller = new AbortController()
      const pending = harness.registry.dispatch(
        'system.invoke',
        { operation: 'run-action', actionId: 'mute-toggle' },
        controller.signal
      )
      await vi.waitFor(() => expect(harness.executor.start).toHaveBeenCalledOnce())

      if (mode === 'cancel') controller.abort()
      else if (mode === 'revoke') harness.revoke()
      else await harness.disable()

      if (mode === 'revoke') {
        await expect(pending).resolves.toEqual({
          actionId: 'mute-toggle',
          status: 'blocked',
          reason: 'permission-denied'
        })
      } else {
        await expect(pending).rejects.toMatchObject({
          code:
            mode === 'disable'
              ? 'PLUGIN_HOST_CAPABILITY_CLOSED'
              : 'PLUGIN_HOST_CAPABILITY_CANCELLED'
        })
      }
      expect(controlled.process.kill).toHaveBeenCalledOnce()
      await controlled.exit.promise
      if (mode !== 'disable') await harness.disable()
      expect(controlled.process.kill).toHaveBeenCalledOnce()
    }
  )

  it('times out, kills and settles through the same process exit barrier', async () => {
    vi.useFakeTimers()
    try {
      const controlled = controlledProcess()
      const harness = createHarness({ process: controlled.process })
      const pending = harness.registry.dispatch('system.invoke', {
        operation: 'run-action',
        actionId: 'sound-settings'
      })
      const timedOut = expect(pending).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_TIMEOUT'
      })
      await vi.advanceTimersByTimeAsync(PLUGIN_SYSTEM_ACTION_TIMEOUT_MS)

      await timedOut
      expect(controlled.process.kill).toHaveBeenCalledOnce()
      await harness.disable()
      expect(controlled.process.kill).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
