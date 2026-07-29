import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createFixedPluginWindowPresetExecutor,
  createPluginWindowPresetCapabilities,
  createPluginWindowPresetProcess,
  PLUGIN_WINDOW_PRESET_ACTION_IDS,
  PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES,
  type PluginWindowPresetProcess
} from './plugin-window-preset-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-window-presets',
  pluginInstanceId: 'window-presets-instance',
  activationGeneration: 1,
  key: 'window-presets-key'
})

const WINDOWS = JSON.stringify([
  { name: 'WindowsTerminal', title: 'Terminal', pid: 11, handle: '100', isFront: true },
  { name: 'Chrome', title: 'Docs', pid: 22, handle: '200', isFront: false },
  { name: 'Code', title: 'Workspace', pid: 33, handle: '300', isFront: false }
])

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function completedProcess(stdout: string, code = 0): PluginWindowPresetProcess {
  return Object.freeze({
    started: async () => undefined,
    wait: async () => ({ code, stdout }),
    kill: async () => undefined
  })
}

function controlledProcess(stdout = '{"success":true,"affectedWindows":2}') {
  const started = deferred<void>()
  const exit = deferred<{ code: number | null; stdout: string }>()
  const process: PluginWindowPresetProcess = Object.freeze({
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
    platform?: NodeJS.Platform
    outputs?: readonly string[]
    processFactory?: (index: number) => PluginWindowPresetProcess
  } = {}
) {
  let current: PluginActivationIdentity | undefined = activation
  let hostGeneration = 7
  const revokeWatchers = new Set<() => void>()
  const outputs = [...(options.outputs ?? [WINDOWS, '{"success":true,"affectedWindows":2}'])]
  let index = 0
  const spawn = vi.fn((_executable: string, _args: readonly string[], _options: unknown) => {
    const currentIndex = index++
    return options.processFactory?.(currentIndex) ?? completedProcess(outputs[currentIndex] ?? '')
  })
  const executor = createFixedPluginWindowPresetExecutor({
    platform: options.platform ?? 'win32',
    windowsDirectory: 'C:\\Windows',
    spawn
  })
  const capability = createPluginWindowPresetCapabilities({
    activation,
    platform: options.platform ?? 'win32',
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    authorizeShell: () => options.allowed ?? true,
    watchShellPermissionRevoked: (_pluginName, onRevoke) => {
      revokeWatchers.add(onRevoke)
      return () => revokeWatchers.delete(onRevoke)
    },
    executor
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'window-presets-host', hostGeneration: 7 },
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

describe('isolated window preset capability', () => {
  it('reports only a bounded visible-window count and uses fixed PowerShell options', async () => {
    const harness = createHarness({ outputs: [WINDOWS] })

    const result = await harness.registry.dispatch('system.window-presets', { operation: 'status' })
    expect(result).toEqual({ operation: 'status', status: 'available', windowCount: 3 })
    expect(harness.spawn).toHaveBeenCalledExactlyOnceWith(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command']),
      {
        cwd: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
        env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' },
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      }
    )
    const args = harness.spawn.mock.calls[0]?.[1] as readonly string[]
    expect(args.at(-1)).toContain("$TuffWindowPresetOperation = 'list'")
    expect(JSON.stringify(result)).not.toMatch(/handle|title|pid|powershell/i)
  })

  it.each(PLUGIN_WINDOW_PRESET_ACTION_IDS)(
    'runs only fixed %s host algorithms',
    async (actionId) => {
      const affectedWindows = actionId === 'preset-clear-topmost' ? 3 : 2
      const harness = createHarness({
        outputs: [WINDOWS, JSON.stringify({ success: true, affectedWindows })]
      })

      await expect(
        harness.registry.dispatch('system.window-presets', { operation: 'run-action', actionId })
      ).resolves.toEqual({
        operation: 'run-action',
        actionId,
        status: 'completed',
        affectedWindows
      })
      expect(harness.spawn).toHaveBeenCalledTimes(2)
      const actionArgs = harness.spawn.mock.calls[1]?.[1] as readonly string[]
      const script = actionArgs.at(-1) ?? ''
      expect(script).toContain(
        actionId === 'preset-clear-topmost'
          ? "$TuffWindowPresetOperation = 'clear-topmost'"
          : "$TuffWindowPresetOperation = 'layout'"
      )
      expect(script).not.toContain('attacker')
    }
  )

  it('never interpolates enumerated process names or titles into mutation scripts', async () => {
    const marker = "'; Start-Process calc.exe; #'"
    const windows = JSON.stringify([
      { name: marker, title: marker, pid: 11, handle: '100', isFront: true },
      { name: 'Chrome', title: marker, pid: 22, handle: '200', isFront: false }
    ])
    const harness = createHarness({
      outputs: [windows, '{"success":true,"affectedWindows":2}']
    })

    await expect(
      harness.registry.dispatch('system.window-presets', {
        operation: 'run-action',
        actionId: 'preset-two-column'
      })
    ).resolves.toMatchObject({ status: 'completed', affectedWindows: 2 })
    const mutationScript = String(harness.spawn.mock.calls[1]?.[1]?.at(-1) ?? '')
    expect(mutationScript).not.toContain(marker)
    expect(mutationScript).toContain('$left = [IntPtr]100')
    expect(mutationScript).toContain('$right = [IntPtr]200')
  })

  it.each([
    { operation: 'run-action', actionId: 'preset-two-column', script: 'calc.exe' },
    { operation: 'run-action', actionId: 'preset-two-column', coordinates: [0, 0, 100, 100] },
    { operation: 'run-action', actionId: 'preset-two-column', windowIds: ['100', '200'] },
    { operation: 'run-action', actionId: 'restart' },
    { operation: 'status', command: 'Get-Process' }
  ])('rejects child-selected authority fields %#', async (request) => {
    const harness = createHarness()
    await expect(harness.registry.dispatch('system.window-presets', request)).rejects.toMatchObject(
      {
        code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
      }
    )
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('fails closed on malformed, oversized and over-count host status output', async () => {
    for (const output of [
      '{"handle":"100","title":"leak"}',
      JSON.stringify([
        {
          name: 'App',
          title: 'Title',
          pid: 1,
          handle: '1',
          isFront: false,
          path: 'C:\\secret'
        }
      ]),
      JSON.stringify(
        Array.from({ length: 129 }, (_, index) => ({
          name: 'App',
          title: `Window ${index}`,
          pid: index + 1,
          handle: String(index + 1),
          isFront: false
        }))
      ),
      'x'.repeat(256 * 1024 + 1)
    ]) {
      const harness = createHarness({ outputs: [output] })
      await expect(
        harness.registry.dispatch('system.window-presets', { operation: 'status' })
      ).resolves.toEqual({ operation: 'status', status: 'failed', reason: 'status-failed' })
    }
  })

  it('returns stable unsupported and permission results without spawning', async () => {
    const unsupported = createHarness({ platform: 'darwin' })
    await expect(
      unsupported.registry.dispatch('system.window-presets', { operation: 'status' })
    ).resolves.toEqual({
      operation: 'status',
      status: 'blocked',
      reason: 'platform-unsupported'
    })
    expect(unsupported.spawn).not.toHaveBeenCalled()

    const denied = createHarness({ allowed: false })
    await expect(
      denied.registry.dispatch('system.window-presets', { operation: 'status' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })
    expect(denied.spawn).not.toHaveBeenCalled()
  })

  it('rejects stale activation and host generations before host work', async () => {
    const stale = createHarness()
    stale.rotate()
    await expect(
      stale.registry.dispatch('system.window-presets', { operation: 'status' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })
    expect(stale.spawn).not.toHaveBeenCalled()

    const wrongHost = createHarness()
    wrongHost.rotateHost()
    await expect(
      wrongHost.registry.dispatch('system.window-presets', { operation: 'status' })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(wrongHost.spawn).not.toHaveBeenCalled()
  })

  it('rejects a cross-plugin authoritative context before status host work', async () => {
    const harness = createHarness()
    const definition = harness.capability.definitions[0]
    const otherActivation = Object.freeze({
      name: 'touch-system-actions',
      pluginInstanceId: activation.pluginInstanceId,
      activationGeneration: activation.activationGeneration,
      key: activation.key
    })

    await expect(
      definition.invoke(
        issuePluginSecurityContext(otherActivation, 'plugin-host', { hostGeneration: 7 }),
        { operation: 'status' },
        new AbortController().signal,
        { register: vi.fn() } as never
      )
    ).rejects.toThrow('PLUGIN_WINDOW_PRESET_INVALID')
    expect(harness.spawn).not.toHaveBeenCalled()
  })

  it('kills once and awaits the true exit barrier on caller cancellation', async () => {
    const list = completedProcess(WINDOWS)
    const action = controlledProcess()
    action.started.resolve()
    const harness = createHarness({
      processFactory: (index) => (index === 0 ? list : action.process)
    })
    const controller = new AbortController()
    const pending = harness.registry.dispatch(
      'system.window-presets',
      { operation: 'run-action', actionId: 'preset-two-column' },
      controller.signal
    )
    const cancelled = expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_CANCELLED'
    })
    await vi.waitFor(() => expect(action.process.wait).toHaveBeenCalledOnce())
    controller.abort()
    await vi.waitFor(() => expect(action.process.kill).toHaveBeenCalledOnce())
    await cancelled
    await expect(harness.capability.close()).resolves.toBeUndefined()
    expect(action.process.kill).toHaveBeenCalledOnce()
  })

  it('kills once and awaits the true exit barrier on revoke and close', async () => {
    const list = completedProcess(WINDOWS)
    const action = controlledProcess()
    action.started.resolve()
    const harness = createHarness({
      processFactory: (index) => (index === 0 ? list : action.process)
    })
    const pending = harness.registry.dispatch('system.window-presets', {
      operation: 'run-action',
      actionId: 'preset-two-column'
    })
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    })
    await vi.waitFor(() => expect(action.process.wait).toHaveBeenCalledOnce())
    harness.revoke()
    await vi.waitFor(() => expect(action.process.kill).toHaveBeenCalledOnce())
    await rejected
    await expect(harness.capability.close()).resolves.toBeUndefined()
    expect(action.process.kill).toHaveBeenCalledOnce()
  })

  it('keeps close pending when the fixed spawn seam re-enters teardown', async () => {
    const process = controlledProcess(WINDOWS)
    process.started.resolve()
    let capability!: ReturnType<typeof createPluginWindowPresetCapabilities>
    const closeCaptured = deferred<{ barrier: Promise<void> }>()
    const executor = createFixedPluginWindowPresetExecutor({
      platform: 'win32',
      windowsDirectory: 'C:\\Windows',
      spawn() {
        closeCaptured.resolve({ barrier: capability.close() })
        return process.process
      }
    })
    capability = createPluginWindowPresetCapabilities({
      activation,
      platform: 'win32',
      resolveCurrentActivation: () => activation,
      resolveHostGeneration: () => 7,
      authorizeShell: () => true,
      watchShellPermissionRevoked: () => () => undefined,
      executor
    })
    const context = issuePluginSecurityContext(activation, 'plugin-host', { hostGeneration: 7 })
    const invocation = capability.definitions[0].invoke(
      context,
      { operation: 'status' },
      new AbortController().signal,
      { register: vi.fn() } as never
    )

    const closeBarrier = (await closeCaptured.promise).barrier
    let closeSettled = false
    void closeBarrier.then(() => {
      closeSettled = true
    })
    await Promise.resolve()
    expect(closeSettled).toBe(false)
    await expect(invocation).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_CANCELLED'
    })
    await expect(closeBarrier).resolves.toBeUndefined()
    expect(process.process.kill).toHaveBeenCalledOnce()
  })

  it('rejects construction for another plugin, redirected Windows roots and structural executor copies', () => {
    for (const windowsDirectory of ['\\\\server\\Windows', 'C:\\Temp', 'C:\\Windows\\..\\Temp']) {
      expect(() =>
        createFixedPluginWindowPresetExecutor({
          platform: 'win32',
          windowsDirectory,
          spawn: () => completedProcess(WINDOWS)
        })
      ).toThrow('PLUGIN_WINDOW_PRESET_INVALID')
    }
    const executor = createFixedPluginWindowPresetExecutor({
      platform: 'win32',
      windowsDirectory: 'C:\\Windows',
      spawn: () => completedProcess(WINDOWS)
    })
    const base = {
      activation,
      platform: 'win32' as NodeJS.Platform,
      resolveCurrentActivation: () => activation,
      resolveHostGeneration: () => 7,
      authorizeShell: () => true,
      watchShellPermissionRevoked: () => () => undefined
    }
    expect(() =>
      createPluginWindowPresetCapabilities({
        ...base,
        activation: { ...activation, name: 'touch-system-actions' },
        executor
      })
    ).toThrow('PLUGIN_WINDOW_PRESET_INVALID')
    expect(() =>
      createPluginWindowPresetCapabilities({
        ...base,
        executor: { start: executor.start }
      } as never)
    ).toThrow('PLUGIN_WINDOW_PRESET_INVALID')
  })

  it('rejects cross-variant result fields before they reach the child', () => {
    const harness = createHarness()
    const validateResult = harness.capability.definitions[0]?.validateResult
    expect(() =>
      validateResult?.({
        operation: 'status',
        status: 'blocked',
        reason: 'permission-denied',
        affectedWindows: 2
      })
    ).toThrow('PLUGIN_WINDOW_PRESET_INVALID')
    expect(() =>
      validateResult?.({
        operation: 'run-action',
        actionId: 'preset-two-column',
        status: 'failed',
        reason: 'execution-failed',
        windowCount: 2
      })
    ).toThrow('PLUGIN_WINDOW_PRESET_INVALID')
  })

  it('adapts stdout, spawn, kill and real exit as separate barriers', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid?: number
      stdout: EventEmitter
      kill: ReturnType<typeof vi.fn>
    }
    child.stdout = new EventEmitter()
    child.kill = vi.fn(() => true)
    const process = createPluginWindowPresetProcess(child as unknown as ChildProcess)
    const started = process.started()
    child.emit('spawn')
    await started
    child.stdout.emit('data', Buffer.from('{"title":"'))
    const titleBytes = Buffer.from('窗口', 'utf8')
    child.stdout.emit('data', titleBytes.subarray(0, 1))
    child.stdout.emit('data', titleBytes.subarray(1, 4))
    child.stdout.emit('data', titleBytes.subarray(4))
    child.stdout.emit('data', Buffer.from('"}'))
    const terminating = Promise.resolve(process.kill())
    let settled = false
    void terminating.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    child.emit('exit', 0)
    await expect(terminating).resolves.toBeUndefined()
    await expect(process.wait()).resolves.toEqual({
      code: 0,
      stdout: '{"title":"窗口"}'
    })
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('bounds stdout before copying and still waits for exit after overflow', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid?: number
      stdout: EventEmitter
      kill: ReturnType<typeof vi.fn>
    }
    child.stdout = new EventEmitter()
    child.kill = vi.fn(() => true)
    const process = createPluginWindowPresetProcess(child as unknown as ChildProcess)
    child.emit('spawn')
    await process.started()
    child.stdout.emit('data', Buffer.alloc(PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES + 1, 65))
    expect(child.kill).toHaveBeenCalledOnce()
    let settled = false
    const waiting = process.wait().finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    child.emit('exit', null)
    await expect(waiting).rejects.toThrow('PLUGIN_WINDOW_PRESET_PROCESS_OUTPUT_LIMIT')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('issues only one kill when output overflow and explicit teardown overlap', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid?: number
      stdout: EventEmitter
      kill: ReturnType<typeof vi.fn>
    }
    child.stdout = new EventEmitter()
    child.kill = vi.fn(() => true)
    const process = createPluginWindowPresetProcess(child as unknown as ChildProcess)
    child.emit('spawn')
    await process.started()
    child.stdout.emit('data', Buffer.alloc(PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES + 1, 65))
    const terminating = Promise.resolve(process.kill())
    await Promise.resolve()
    expect(child.kill).toHaveBeenCalledOnce()
    child.emit('exit', null)
    await expect(terminating).rejects.toThrow('PLUGIN_WINDOW_PRESET_PROCESS_OUTPUT_LIMIT')
    expect(child.kill).toHaveBeenCalledOnce()
  })
})
