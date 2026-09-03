import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { issuePluginSecurityContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'
import {
  createFixedPluginOrcaService,
  createPluginOrcaCapabilities,
  type TrustedPluginOrcaService
} from './plugin-orca-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-orca',
  pluginInstanceId: 'orca-instance',
  activationGeneration: 1,
  key: 'orca-key'
})
const error = (code: string) => expect.objectContaining({ code })
const envelope = (result: Record<string, unknown>) =>
  JSON.stringify({ id: 'safe', ok: true, result })

function service(
  execFile: (
    executable: string,
    args: readonly string[],
    options: { readonly timeout: number; readonly maxBuffer: number; readonly signal: AbortSignal }
  ) => Promise<{ stdout: string }>,
  openApplication = vi.fn(async (): Promise<void> => undefined)
): TrustedPluginOrcaService {
  return createFixedPluginOrcaService({
    platform: 'darwin',
    cliPath: '/opt/homebrew/bin/orca',
    applicationPath: '/Applications/Orca.app',
    execFile,
    openApplication
  })
}
function harness(orca: TrustedPluginOrcaService, allowed = true) {
  let current: PluginActivationIdentity | undefined = activation
  const revoked = new Set<() => void>()
  const watch = (_name: string, onRevoke: () => void) => {
    revoked.add(onRevoke)
    return () => revoked.delete(onRevoke)
  }
  const capability = createPluginOrcaCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => 7,
    authorizeApplications: () => allowed,
    watchApplicationsPermissionRevoked: watch,
    service: orca
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'orca-handle', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: () => allowed,
    watchPermissionRevoked: (_name, _permission, onRevoke) => watch(_name, onRevoke),
    onFatalViolation: () => undefined
  })
  registry.register(capability.definitions[0]!)
  return {
    capability,
    registry,
    revoke() {
      for (const callback of revoked) callback()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated' }
    }
  }
}

describe('orchestration.orca capability and fixed service', () => {
  it('runs only the four fixed JSON commands and projects counts without command output', async () => {
    const calls: Array<{ executable: string; args: readonly string[] }> = []
    const orca = service(async (executable, args) => {
      calls.push({ executable, args })
      const result =
        args[0] === 'status'
          ? { runtime: { state: 'ready', reachable: true } }
          : args[0] === 'worktree'
            ? { totalCount: 3, title: '/Users/private' }
            : args[0] === 'terminal'
              ? { totalCount: 2 }
              : { count: 4 }
      return { stdout: envelope(result) }
    })
    await expect(orca.snapshot(new AbortController().signal)).resolves.toEqual({
      status: 'ready',
      workspaces: 3,
      terminals: 2,
      tasks: 4,
      tasksAvailable: true,
      title: 'Orca ready'
    })
    expect(calls.map(({ args }) => args)).toEqual([
      ['status', '--json'],
      ['worktree', 'ps', '--limit', '1', '--json'],
      ['terminal', 'list', '--limit', '1', '--json'],
      ['orchestration', 'task-list', '--json']
    ])
    expect(calls.map(({ executable }) => executable)).toEqual([
      '/opt/homebrew/bin/orca',
      '/opt/homebrew/bin/orca',
      '/opt/homebrew/bin/orca',
      '/opt/homebrew/bin/orca'
    ])
  })

  it('keeps core Orca readiness when the optional task list is unavailable', async () => {
    const orca = service(async (_executable, args) => {
      if (args[0] === 'orchestration') throw new Error('task-list unavailable')
      const result =
        args[0] === 'status'
          ? { runtime: { state: 'ready', reachable: true } }
          : args[0] === 'worktree'
            ? { totalCount: 3 }
            : { totalCount: 2 }
      return { stdout: envelope(result) }
    })

    await expect(orca.snapshot(new AbortController().signal)).resolves.toEqual({
      status: 'ready',
      workspaces: 3,
      terminals: 2,
      tasks: 0,
      tasksAvailable: false,
      title: 'Orca ready'
    })
  })

  it('returns unsupported or degraded instead of forwarding arbitrary input', async () => {
    const linux = createFixedPluginOrcaService({
      platform: 'linux',
      execFile: vi.fn(async () => ({ stdout: '' })),
      openApplication: vi.fn(async (): Promise<void> => undefined)
    })
    await expect(linux.snapshot(new AbortController().signal)).resolves.toMatchObject({
      status: 'unsupported',
      reason: 'platform-unsupported'
    })
    await expect(linux.open(new AbortController().signal)).resolves.toMatchObject({
      status: 'unsupported',
      reason: 'platform-unsupported'
    })
    const invalid = service(vi.fn(async () => ({ stdout: '{"ok":true,"result":{}}' })))
    await expect(invalid.snapshot(new AbortController().signal)).resolves.toMatchObject({
      status: 'degraded',
      reason: 'invalid-response'
    })
  })

  it('aborts and awaits sibling commands when one fixed command fails', async () => {
    const siblingSignals: AbortSignal[] = []
    let settledSiblings = 0
    const orca = service(async (_executable, args, options) => {
      if (args[0] === 'status') throw new Error('invalid status')
      siblingSignals.push(options.signal)
      return await new Promise<{ stdout: string }>((resolve) =>
        options.signal.addEventListener(
          'abort',
          () => {
            settledSiblings += 1
            resolve({ stdout: '' })
          },
          { once: true }
        )
      )
    })

    await expect(orca.snapshot(new AbortController().signal)).resolves.toMatchObject({
      status: 'degraded',
      reason: 'invalid-response'
    })
    expect(siblingSignals).toHaveLength(3)
    expect(siblingSignals.every((signal) => signal.aborted)).toBe(true)
    expect(settledSiblings).toBe(3)
  })

  it('enforces literal holder, authority, permissions, schema and lifecycle', async () => {
    const orca = service(
      vi.fn(async (_executable, args) => ({
        stdout: envelope(
          args[0] === 'status'
            ? { runtime: { state: 'ready', reachable: true } }
            : { totalCount: 0, count: 0 }
        )
      }))
    )
    const h = harness(orca)
    await expect(
      h.registry.dispatch('orchestration.orca', { operation: 'snapshot' })
    ).resolves.toMatchObject({ status: 'ready' })
    expect(() =>
      createPluginOrcaCapabilities({
        activation: { ...activation, name: 'other' },
        resolveCurrentActivation: () => activation,
        resolveHostGeneration: () => 7,
        authorizeApplications: () => true,
        watchApplicationsPermissionRevoked: () => () => undefined,
        service: orca
      })
    ).toThrow(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    const definition = h.capability.definitions[0]!
    const forged = issuePluginSecurityContext(activation, 'plugin-host', { hostGeneration: 7 })
    await expect(
      definition.invoke(
        { ...forged, identity: { ...forged.identity } } as PluginSecurityContext,
        { operation: 'snapshot' },
        new AbortController().signal,
        {} as PluginHostCapabilityResourceContext
      )
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'))
    expect(() =>
      definition.validateRequest({ operation: 'exec', args: ['rm', '-rf', '/'] })
    ).toThrow()
    expect(() =>
      definition.validateResult({
        status: 'ready',
        workspaces: -1,
        terminals: 0,
        tasks: 0,
        tasksAvailable: true
      })
    ).toThrow()
    expect(() =>
      definition.validateResult({ status: 'ready', workspaces: 0, terminals: 0, tasks: 0 })
    ).toThrow()
    h.rotate()
    await expect(
      h.registry.dispatch('orchestration.orca', { operation: 'snapshot' })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION'))
    const denied = harness(orca, false)
    await expect(
      denied.registry.dispatch('orchestration.orca', { operation: 'snapshot' })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'))
  })

  it('preserves started after host open completes before synchronous abort and revocation', async () => {
    let completeOpen!: () => void
    const openApplication = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeOpen = resolve
        })
    )
    const h = harness(
      service(
        vi.fn(async () => ({ stdout: '' })),
        openApplication
      )
    )
    const controller = new AbortController()
    const call = h.registry.dispatch('orchestration.orca', { operation: 'open' }, controller.signal)

    await vi.waitFor(() => expect(openApplication).toHaveBeenCalledTimes(1))
    completeOpen()
    controller.abort()
    h.revoke()

    await expect(call).resolves.toEqual({ status: 'started' })
  })

  it('cancels and closes an in-flight fixed open operation', async () => {
    let aborted = false
    const openApplication = vi.fn(
      async (_path: string, signal: AbortSignal): Promise<void> =>
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => {
              aborted = true
              reject(new Error('open aborted'))
            },
            { once: true }
          )
        )
    )
    const h = harness(
      service(
        vi.fn(async () => ({ stdout: '' })),
        openApplication
      )
    )
    const controller = new AbortController()
    const call = h.registry.dispatch('orchestration.orca', { operation: 'open' }, controller.signal)
    await vi.waitFor(() => expect(openApplication).toHaveBeenCalledTimes(1))
    controller.abort()
    await expect(call).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    expect(aborted).toBe(true)
    await h.capability.close()
    h.registry.close()
    await expect(
      h.registry.dispatch('orchestration.orca', { operation: 'snapshot' })
    ).rejects.toMatchObject(error('PLUGIN_HOST_CAPABILITY_CLOSED'))
  })
})
