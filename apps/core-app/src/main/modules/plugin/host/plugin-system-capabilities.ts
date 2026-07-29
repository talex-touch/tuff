import type { ChildProcess } from 'node:child_process'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'
import type { PluginHostCapabilityResourceContext } from './plugin-host-resources'

export const PLUGIN_SYSTEM_ACTION_IDS = Object.freeze([
  'restart',
  'shutdown',
  'lock-screen',
  'mute-toggle',
  'volume-up',
  'volume-down',
  'brightness-up',
  'brightness-down',
  'open-main-window',
  'focus-settings',
  'notification-settings',
  'sound-settings',
  'display-settings'
] as const)

export type PluginSystemActionId = (typeof PLUGIN_SYSTEM_ACTION_IDS)[number]
export type PluginSystemActionRisk = 'destructive' | 'immediate' | 'settings'

export interface PluginSystemActionPolicy {
  readonly risk: PluginSystemActionRisk
  readonly confirmation: 'none' | 'double'
}

export const PLUGIN_SYSTEM_ACTION_POLICIES: Readonly<
  Record<PluginSystemActionId, PluginSystemActionPolicy>
> = Object.freeze({
  restart: Object.freeze({ risk: 'destructive', confirmation: 'double' }),
  shutdown: Object.freeze({ risk: 'destructive', confirmation: 'double' }),
  'lock-screen': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'mute-toggle': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'volume-up': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'volume-down': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'brightness-up': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'brightness-down': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'open-main-window': Object.freeze({ risk: 'immediate', confirmation: 'none' }),
  'focus-settings': Object.freeze({ risk: 'settings', confirmation: 'none' }),
  'notification-settings': Object.freeze({ risk: 'settings', confirmation: 'none' }),
  'sound-settings': Object.freeze({ risk: 'settings', confirmation: 'none' }),
  'display-settings': Object.freeze({ risk: 'settings', confirmation: 'none' })
})

export const PLUGIN_SYSTEM_ACTION_TIMEOUT_MS = 15_000
const SYSTEM_ACTION_PLUGIN_NAMES = new Set(['touch-quick-actions', 'touch-system-actions'])
const SYSTEM_WINDOW_ACTION = 'open-main-window' satisfies PluginSystemActionId
const QUICK_ACTION_IDS = new Set<PluginSystemActionId>([
  'restart',
  'shutdown',
  'lock-screen',
  'mute-toggle',
  'focus-settings',
  'notification-settings',
  'sound-settings',
  'display-settings'
])
const ADVANCED_SYSTEM_ACTION_IDS = new Set<PluginSystemActionId>([
  'restart',
  'shutdown',
  'lock-screen',
  'mute-toggle',
  'volume-up',
  'volume-down',
  'brightness-up',
  'brightness-down',
  'open-main-window'
])
const DARWIN_ONLY_ACTIONS = new Set<PluginSystemActionId>(['brightness-up', 'brightness-down'])

export interface PluginSystemActionProcessExit {
  readonly code: number | null
}

export interface PluginSystemActionProcess {
  wait(): Promise<PluginSystemActionProcessExit>
  kill(): void | Promise<void>
}

export interface PluginSystemActionExecutor {
  start(actionId: PluginSystemActionId): PluginSystemActionProcess
}

export interface PluginSystemActionConfirmationService {
  confirm(actionId: PluginSystemActionId, signal: AbortSignal): Promise<boolean>
}

export interface PluginSystemActionWindowService {
  showMainWindow(
    activation: PluginActivationIdentity,
    hostGeneration: number,
    signal: AbortSignal
  ): Promise<void>
}

export interface PluginSystemActionCapabilitiesOptions {
  readonly activation: PluginActivationIdentity
  readonly platform: NodeJS.Platform
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeShell(pluginName: string): boolean
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly executor: PluginSystemActionExecutor
  readonly confirmation: PluginSystemActionConfirmationService
  readonly window: PluginSystemActionWindowService
}

export interface PluginSystemActionCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
}

export interface PluginSystemActionSpawnOptions {
  readonly windowsHide: true
  readonly stdio: 'ignore'
}

export interface FixedPluginSystemActionExecutorOptions {
  readonly platform: NodeJS.Platform
  spawn(
    executable: string,
    args: readonly string[],
    options: PluginSystemActionSpawnOptions
  ): PluginSystemActionProcess
}

export interface PluginSystemActionMessageBoxOptions {
  readonly type: 'warning'
  readonly title: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly ['取消', '确定']
  readonly defaultId: 0
  readonly cancelId: 0
  readonly noLink: true
  readonly signal: AbortSignal
}

export interface FixedPluginSystemActionConfirmationOptions {
  showMessageBox(
    options: PluginSystemActionMessageBoxOptions
  ): Promise<{ readonly response: number }>
}

type SystemActionRequest = {
  readonly operation: 'run-action'
  readonly actionId: PluginSystemActionId
}

type SystemActionResult =
  | { readonly actionId: PluginSystemActionId; readonly status: 'started' }
  | {
      readonly actionId: PluginSystemActionId
      readonly status: 'blocked'
      readonly reason:
        | 'confirmation-denied'
        | 'confirmation-unavailable'
        | 'permission-denied'
        | 'permission-unavailable'
        | 'platform-unsupported'
    }
  | {
      readonly actionId: PluginSystemActionId
      readonly status: 'failed'
      readonly reason: 'execution-failed'
    }

interface FixedSystemCommand {
  readonly executable: string
  readonly args: readonly string[]
}

const DARWIN_COMMANDS: Readonly<Partial<Record<PluginSystemActionId, FixedSystemCommand>>> =
  Object.freeze({
    restart: Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze(['-e', 'tell application "System Events" to restart'])
    }),
    shutdown: Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze(['-e', 'tell application "System Events" to shut down'])
    }),
    'lock-screen': Object.freeze({
      executable: '/usr/bin/pmset',
      args: Object.freeze(['displaysleepnow'])
    }),
    'volume-up': Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze([
        '-e',
        'set volume output volume (output volume of (get volume settings) + 10)'
      ])
    }),
    'volume-down': Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze([
        '-e',
        'set volume output volume (output volume of (get volume settings) - 10)'
      ])
    }),
    'mute-toggle': Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze([
        '-e',
        'set volume output muted not (output muted of (get volume settings))'
      ])
    }),
    'focus-settings': Object.freeze({
      executable: '/usr/bin/open',
      args: Object.freeze(['x-apple.systempreferences:com.apple.Focus'])
    }),
    'notification-settings': Object.freeze({
      executable: '/usr/bin/open',
      args: Object.freeze(['x-apple.systempreferences:com.apple.preference.notifications'])
    }),
    'sound-settings': Object.freeze({
      executable: '/usr/bin/open',
      args: Object.freeze(['x-apple.systempreferences:com.apple.preference.sound'])
    }),
    'display-settings': Object.freeze({
      executable: '/usr/bin/open',
      args: Object.freeze(['x-apple.systempreferences:com.apple.preference.displays'])
    }),
    'brightness-up': Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze(['-e', 'tell application "System Events" to key code 144'])
    }),
    'brightness-down': Object.freeze({
      executable: '/usr/bin/osascript',
      args: Object.freeze(['-e', 'tell application "System Events" to key code 145'])
    })
  })

const WINDOWS_COMMANDS: Readonly<Partial<Record<PluginSystemActionId, FixedSystemCommand>>> =
  Object.freeze({
    restart: Object.freeze({
      executable: 'shutdown.exe',
      args: Object.freeze(['/r', '/t', '0'])
    }),
    shutdown: Object.freeze({
      executable: 'shutdown.exe',
      args: Object.freeze(['/s', '/t', '0'])
    }),
    'lock-screen': Object.freeze({
      executable: 'rundll32.exe',
      args: Object.freeze(['user32.dll,LockWorkStation'])
    }),
    'volume-up': Object.freeze({
      executable: 'powershell.exe',
      args: Object.freeze([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]175)'
      ])
    }),
    'volume-down': Object.freeze({
      executable: 'powershell.exe',
      args: Object.freeze([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]174)'
      ])
    }),
    'mute-toggle': Object.freeze({
      executable: 'powershell.exe',
      args: Object.freeze([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]173)'
      ])
    }),
    'focus-settings': Object.freeze({
      executable: 'explorer.exe',
      args: Object.freeze(['ms-settings:quiethours'])
    }),
    'notification-settings': Object.freeze({
      executable: 'explorer.exe',
      args: Object.freeze(['ms-settings:notifications'])
    }),
    'sound-settings': Object.freeze({
      executable: 'explorer.exe',
      args: Object.freeze(['ms-settings:sound'])
    }),
    'display-settings': Object.freeze({
      executable: 'explorer.exe',
      args: Object.freeze(['ms-settings:display'])
    })
  })

const ACTION_LABELS: Readonly<Record<'restart' | 'shutdown', string>> = Object.freeze({
  restart: '重启',
  shutdown: '关机'
})

function invalid(): never {
  throw new TypeError('PLUGIN_SYSTEM_ACTION_INVALID')
}

function exactRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    invalid()
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const allowed = new Set(allowedKeys)
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      !allowed.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      invalid()
    }
    output[key] = descriptor.value
  }
  for (const key of requiredKeys) if (!Object.hasOwn(descriptors, key)) invalid()
  return output
}

function dataMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  const record = exactRecord(value, [key])
  const method = record[key]
  if (typeof method !== 'function' || utilTypes.isProxy(method)) invalid()
  return method as T
}

function isActionId(value: unknown): value is PluginSystemActionId {
  return (
    typeof value === 'string' && PLUGIN_SYSTEM_ACTION_IDS.includes(value as PluginSystemActionId)
  )
}

function isActionAllowedForPlugin(pluginName: string, actionId: PluginSystemActionId): boolean {
  return pluginName === 'touch-quick-actions'
    ? QUICK_ACTION_IDS.has(actionId)
    : pluginName === 'touch-system-actions' && ADVANCED_SYSTEM_ACTION_IDS.has(actionId)
}

function isShellAction(actionId: PluginSystemActionId): boolean {
  return actionId !== SYSTEM_WINDOW_ACTION
}

function isActionSupported(actionId: PluginSystemActionId, platform: NodeJS.Platform): boolean {
  if (actionId === SYSTEM_WINDOW_ACTION) return true
  if (DARWIN_ONLY_ACTIONS.has(actionId)) return platform === 'darwin'
  return platform === 'darwin' || platform === 'win32'
}

function validateRequest(value: unknown): SystemActionRequest {
  const record = exactRecord(value, ['operation', 'actionId'])
  if (record.operation !== 'run-action' || !isActionId(record.actionId)) invalid()
  return Object.freeze({ operation: 'run-action', actionId: record.actionId })
}

function validateResult(value: unknown): SystemActionResult {
  const record = exactRecord(value, ['actionId', 'status', 'reason'], ['actionId', 'status'])
  const hasReason = Object.hasOwn(record, 'reason')
  if (!isActionId(record.actionId)) invalid()
  if (record.status === 'started' && !hasReason) {
    return Object.freeze({ actionId: record.actionId, status: 'started' })
  }
  if (
    record.status === 'blocked' &&
    (record.reason === 'confirmation-denied' ||
      record.reason === 'confirmation-unavailable' ||
      record.reason === 'permission-denied' ||
      record.reason === 'permission-unavailable' ||
      record.reason === 'platform-unsupported')
  ) {
    return Object.freeze({
      actionId: record.actionId,
      status: 'blocked',
      reason: record.reason
    })
  }
  if (record.status === 'failed' && record.reason === 'execution-failed') {
    return Object.freeze({
      actionId: record.actionId,
      status: 'failed',
      reason: 'execution-failed'
    })
  }
  invalid()
}

function snapshotActivation(value: unknown): PluginActivationIdentity {
  const record = exactRecord(value, ['name', 'pluginInstanceId', 'activationGeneration', 'key'])
  if (
    typeof record.name !== 'string' ||
    record.name.length < 1 ||
    typeof record.pluginInstanceId !== 'string' ||
    record.pluginInstanceId.length < 1 ||
    !Number.isSafeInteger(record.activationGeneration) ||
    Number(record.activationGeneration) < 1 ||
    typeof record.key !== 'string' ||
    record.key.length < 1
  ) {
    invalid()
  }
  return Object.freeze({
    name: record.name,
    pluginInstanceId: record.pluginInstanceId,
    activationGeneration: Number(record.activationGeneration),
    key: record.key
  })
}

function sameActivation(left: PluginActivationIdentity, right: PluginActivationIdentity): boolean {
  return (
    left.name === right.name &&
    left.pluginInstanceId === right.pluginInstanceId &&
    left.activationGeneration === right.activationGeneration &&
    left.key === right.key
  )
}

function assertSignal(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
  }
}

async function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  assertSignal(signal)
  let dispose = (): void => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void => {
      reject(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
    }
    dispose = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  void operation.catch(() => undefined)
  try {
    return await Promise.race([operation, aborted])
  } finally {
    dispose()
  }
}

function snapshotProcess(value: unknown): PluginSystemActionProcess {
  const record = exactRecord(value, ['wait', 'kill'])
  if (
    typeof record.wait !== 'function' ||
    utilTypes.isProxy(record.wait) ||
    typeof record.kill !== 'function' ||
    utilTypes.isProxy(record.kill)
  ) {
    invalid()
  }
  const wait = record.wait as PluginSystemActionProcess['wait']
  const kill = record.kill as PluginSystemActionProcess['kill']
  return Object.freeze({
    wait: () => wait.call(value),
    kill: () => kill.call(value)
  })
}

function snapshotExit(value: unknown): PluginSystemActionProcessExit {
  const record = exactRecord(value, ['code'])
  if (record.code !== null && !Number.isSafeInteger(record.code)) invalid()
  return Object.freeze({ code: record.code === null ? null : Number(record.code) })
}

async function executeProcess(
  executor: PluginSystemActionExecutor,
  actionId: PluginSystemActionId,
  signal: AbortSignal,
  resources: PluginHostCapabilityResourceContext,
  assertCurrent: () => void
): Promise<SystemActionResult> {
  assertSignal(signal)
  assertCurrent()
  let process: PluginSystemActionProcess
  try {
    process = snapshotProcess(executor.start(actionId))
  } catch {
    return Object.freeze({ actionId, status: 'failed', reason: 'execution-failed' })
  }

  let exited = false
  const exitPromise = Promise.resolve()
    .then(() => process.wait())
    .then((value) => {
      const exit = snapshotExit(value)
      exited = true
      return exit
    })
  void exitPromise.catch(() => undefined)
  let terminatePromise: Promise<void> | null = null
  const terminate = (): Promise<void> => {
    if (terminatePromise) return terminatePromise
    terminatePromise = Promise.resolve().then(async () => {
      if (!exited) {
        try {
          await process.kill()
        } catch {
          // The exit barrier below remains authoritative.
        }
      }
      await exitPromise.catch(() => undefined)
    })
    return terminatePromise
  }

  try {
    assertSignal(signal)
    assertCurrent()
  } catch (error) {
    await terminate()
    throw error
  }

  try {
    resources.register('process', terminate)
  } catch {
    await terminate()
    return Object.freeze({ actionId, status: 'failed', reason: 'execution-failed' })
  }

  const onAbort = (): void => {
    void terminate()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  try {
    let exit: PluginSystemActionProcessExit
    try {
      exit = await exitPromise
    } catch {
      if (signal.aborted) {
        await terminate()
        throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      }
      await terminate()
      return Object.freeze({ actionId, status: 'failed', reason: 'execution-failed' })
    }
    if (signal.aborted) {
      await terminate()
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    }
    assertCurrent()
    return exit.code === 0
      ? Object.freeze({ actionId, status: 'started' })
      : Object.freeze({ actionId, status: 'failed', reason: 'execution-failed' })
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export function createPluginSystemActionCapabilities(
  rawOptions: PluginSystemActionCapabilitiesOptions
): PluginSystemActionCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'platform',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeShell',
    'watchShellPermissionRevoked',
    'executor',
    'confirmation',
    'window'
  ])
  if (
    typeof options.platform !== 'string' ||
    typeof options.resolveCurrentActivation !== 'function' ||
    utilTypes.isProxy(options.resolveCurrentActivation) ||
    typeof options.resolveHostGeneration !== 'function' ||
    utilTypes.isProxy(options.resolveHostGeneration) ||
    typeof options.authorizeShell !== 'function' ||
    utilTypes.isProxy(options.authorizeShell) ||
    typeof options.watchShellPermissionRevoked !== 'function' ||
    utilTypes.isProxy(options.watchShellPermissionRevoked)
  ) {
    invalid()
  }
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginSystemActionCapabilitiesOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginSystemActionCapabilitiesOptions['resolveHostGeneration']
  const authorizeShell =
    options.authorizeShell as PluginSystemActionCapabilitiesOptions['authorizeShell']
  const watchShellPermissionRevoked =
    options.watchShellPermissionRevoked as PluginSystemActionCapabilitiesOptions['watchShellPermissionRevoked']
  const start = dataMethod<PluginSystemActionExecutor['start']>(options.executor, 'start')
  const confirm = dataMethod<PluginSystemActionConfirmationService['confirm']>(
    options.confirmation,
    'confirm'
  )
  const showMainWindow = dataMethod<PluginSystemActionWindowService['showMainWindow']>(
    options.window,
    'showMainWindow'
  )
  const executor: PluginSystemActionExecutor = Object.freeze({
    start: (actionId) => start.call(options.executor, actionId)
  })
  const confirmation: PluginSystemActionConfirmationService = Object.freeze({
    confirm: (actionId, signal) => confirm.call(options.confirmation, actionId, signal)
  })
  const windowService: PluginSystemActionWindowService = Object.freeze({
    showMainWindow: (activation, hostGeneration, signal) =>
      Promise.resolve(showMainWindow.call(options.window, activation, hostGeneration, signal))
  })
  const platform = options.platform as NodeJS.Platform
  const expectedActivation = snapshotActivation(options.activation)
  if (!SYSTEM_ACTION_PLUGIN_NAMES.has(expectedActivation.name)) invalid()

  const assertAuthority = (context: PluginSecurityContext): number => {
    if (!isAuthoritativePluginContext(context)) invalid()
    const identity = context.identity
    if (
      identity.authority !== 'plugin-host' ||
      identity.pluginName !== expectedActivation.name ||
      context.name !== expectedActivation.name ||
      identity.pluginInstanceId !== expectedActivation.pluginInstanceId ||
      identity.activationGeneration !== expectedActivation.activationGeneration ||
      context.uniqueKey !== expectedActivation.key ||
      !Number.isSafeInteger(identity.hostGeneration) ||
      Number(identity.hostGeneration) < 1
    ) {
      invalid()
    }
    const current = snapshotActivation(resolveCurrentActivation(identity.pluginName))
    if (
      !sameActivation(current, expectedActivation) ||
      resolveHostGeneration(current) !== identity.hostGeneration
    ) {
      invalid()
    }
    return Number(identity.hostGeneration)
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'system.invoke',
    timeoutMs: PLUGIN_SYSTEM_ACTION_TIMEOUT_MS,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest(value) {
      const request = validateRequest(value)
      if (!isActionAllowedForPlugin(expectedActivation.name, request.actionId)) invalid()
      return request
    },
    validateResult,
    async invoke(context, request, signal, resources) {
      const hostGeneration = assertAuthority(context)
      assertSignal(signal)
      const normalized = request as SystemActionRequest
      if (!isActionSupported(normalized.actionId, platform)) {
        return Object.freeze({
          actionId: normalized.actionId,
          status: 'blocked',
          reason: 'platform-unsupported'
        })
      }

      if (!isShellAction(normalized.actionId)) {
        try {
          const result = await awaitWithAbort(
            Promise.resolve().then(() =>
              windowService.showMainWindow(expectedActivation, hostGeneration, signal)
            ),
            signal
          )
          if (result !== undefined) invalid()
          assertSignal(signal)
          assertAuthority(context)
          return Object.freeze({ actionId: normalized.actionId, status: 'started' })
        } catch {
          if (signal.aborted) {
            throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
          }
          return Object.freeze({
            actionId: normalized.actionId,
            status: 'failed',
            reason: 'execution-failed'
          })
        }
      }

      let revoked = false
      let revokeDisposer: (() => void) | null = null
      const shellController = new AbortController()
      const abortShell = (): void => shellController.abort()
      signal.addEventListener('abort', abortShell, { once: true })
      if (signal.aborted) abortShell()
      try {
        try {
          const disposer = watchShellPermissionRevoked.call(
            rawOptions,
            expectedActivation.name,
            () => {
              revoked = true
              shellController.abort()
            }
          )
          if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
          revokeDisposer = disposer
        } catch {
          if (signal.aborted) {
            throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
          }
          return Object.freeze({
            actionId: normalized.actionId,
            status: 'blocked',
            reason: 'permission-unavailable'
          })
        }

        let allowed: unknown
        try {
          allowed = authorizeShell.call(rawOptions, expectedActivation.name)
        } catch {
          if (signal.aborted) {
            throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
          }
          return Object.freeze({
            actionId: normalized.actionId,
            status: 'blocked',
            reason: 'permission-unavailable'
          })
        }
        if (typeof allowed !== 'boolean') {
          return Object.freeze({
            actionId: normalized.actionId,
            status: 'blocked',
            reason: 'permission-unavailable'
          })
        }
        if (!allowed || revoked) {
          return Object.freeze({
            actionId: normalized.actionId,
            status: 'blocked',
            reason: 'permission-denied'
          })
        }

        assertSignal(signal)
        assertAuthority(context)
        const shellSignal = shellController.signal
        if (PLUGIN_SYSTEM_ACTION_POLICIES[normalized.actionId].confirmation === 'double') {
          let approved: boolean
          try {
            approved = await awaitWithAbort(
              Promise.resolve().then(() => confirmation.confirm(normalized.actionId, shellSignal)),
              shellSignal
            )
          } catch {
            if (signal.aborted) {
              throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
            }
            if (revoked) {
              return Object.freeze({
                actionId: normalized.actionId,
                status: 'blocked',
                reason: 'permission-denied'
              })
            }
            return Object.freeze({
              actionId: normalized.actionId,
              status: 'blocked',
              reason: 'confirmation-unavailable'
            })
          }
          if (!approved) {
            return Object.freeze({
              actionId: normalized.actionId,
              status: 'blocked',
              reason: 'confirmation-denied'
            })
          }
        }
        assertSignal(signal)
        assertAuthority(context)
        try {
          return await executeProcess(executor, normalized.actionId, shellSignal, resources, () => {
            assertSignal(signal)
            assertSignal(shellSignal)
            assertAuthority(context)
          })
        } catch (error) {
          if (signal.aborted) throw error
          if (revoked) {
            return Object.freeze({
              actionId: normalized.actionId,
              status: 'blocked',
              reason: 'permission-denied'
            })
          }
          throw error
        }
      } finally {
        signal.removeEventListener('abort', abortShell)
        try {
          revokeDisposer?.()
        } catch {
          // Permission authority has already been released for this call.
        }
      }
    }
  })

  return Object.freeze({ definitions: Object.freeze([definition]) })
}

function fixedCommands(
  platform: NodeJS.Platform
): Readonly<Partial<Record<PluginSystemActionId, FixedSystemCommand>>> | null {
  if (platform === 'darwin') return DARWIN_COMMANDS
  if (platform === 'win32') return WINDOWS_COMMANDS
  return null
}

export function createFixedPluginSystemActionExecutor(
  rawOptions: FixedPluginSystemActionExecutorOptions
): PluginSystemActionExecutor {
  const options = exactRecord(rawOptions, ['platform', 'spawn'])
  if (
    typeof options.platform !== 'string' ||
    typeof options.spawn !== 'function' ||
    utilTypes.isProxy(options.spawn)
  ) {
    invalid()
  }
  const commands = fixedCommands(options.platform as NodeJS.Platform)
  const spawn = options.spawn as FixedPluginSystemActionExecutorOptions['spawn']
  return Object.freeze({
    start(actionId: PluginSystemActionId): PluginSystemActionProcess {
      if (!isActionId(actionId) || !commands || !isShellAction(actionId)) invalid()
      const command = commands[actionId]
      if (!command) invalid()
      return spawn.call(
        rawOptions,
        command.executable,
        Object.freeze([...command.args]),
        Object.freeze({ windowsHide: true, stdio: 'ignore' })
      )
    }
  })
}

export function createPluginSystemActionProcess(child: ChildProcess): PluginSystemActionProcess {
  let settled = false
  let spawned = typeof child.pid === 'number'
  let killPromise: Promise<void> | null = null
  let settleExit!: (exit: PluginSystemActionProcessExit) => void
  let rejectExit!: (error: Error) => void
  const exit = new Promise<PluginSystemActionProcessExit>((resolve, reject) => {
    settleExit = resolve
    rejectExit = reject
  })
  const cleanup = (): void => {
    child.removeListener('spawn', onSpawn)
    child.removeListener('error', onError)
    child.removeListener('exit', onExit)
  }
  const settle = (code: number | null): void => {
    if (settled) return
    settled = true
    cleanup()
    settleExit(Object.freeze({ code: Number.isSafeInteger(code) ? Number(code) : null }))
  }
  const failSpawn = (): void => {
    if (settled) return
    settled = true
    cleanup()
    rejectExit(new Error('PLUGIN_SYSTEM_ACTION_SPAWN_FAILED'))
  }
  const onSpawn = (): void => {
    spawned = true
  }
  const onError = (): void => {
    if (!spawned) failSpawn()
  }
  const onExit = (code: number | null): void => settle(code)
  child.once('spawn', onSpawn)
  child.once('error', onError)
  child.once('exit', onExit)

  return Object.freeze({
    wait: () => exit,
    kill: (): Promise<void> => {
      if (killPromise) return killPromise
      killPromise = Promise.resolve().then(async () => {
        let killError: Error | null = null
        if (!settled) {
          try {
            if (child.kill() !== true) {
              killError = new Error('PLUGIN_SYSTEM_ACTION_KILL_FAILED')
            }
          } catch {
            killError = new Error('PLUGIN_SYSTEM_ACTION_KILL_FAILED')
          }
        }
        let exitError: unknown
        try {
          await exit
        } catch (error) {
          exitError = error
        }
        if (killError) throw killError
        if (exitError) throw exitError
      })
      return killPromise
    }
  })
}

export function createFixedPluginSystemActionConfirmation(
  rawOptions: FixedPluginSystemActionConfirmationOptions
): PluginSystemActionConfirmationService {
  const showMessageBox = dataMethod<FixedPluginSystemActionConfirmationOptions['showMessageBox']>(
    rawOptions,
    'showMessageBox'
  )
  return Object.freeze({
    async confirm(actionId: PluginSystemActionId, signal: AbortSignal): Promise<boolean> {
      assertSignal(signal)
      if (actionId !== 'restart' && actionId !== 'shutdown') return true
      const actionName = ACTION_LABELS[actionId]
      for (let step = 1; step <= 2; step += 1) {
        assertSignal(signal)
        const options: PluginSystemActionMessageBoxOptions = Object.freeze({
          type: 'warning',
          title: `确认${actionName}`,
          message: step === 1 ? `确定要执行${actionName}吗？` : `请再次确认执行${actionName}`,
          detail: '该操作会立即影响系统状态，请确认你已保存当前工作内容。',
          buttons: Object.freeze(['取消', '确定']) as readonly ['取消', '确定'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          signal
        })
        const result = exactRecord(await showMessageBox.call(rawOptions, options), ['response'])
        assertSignal(signal)
        if (!Number.isSafeInteger(result.response)) invalid()
        if (result.response !== 1) return false
      }
      return true
    }
  })
}
