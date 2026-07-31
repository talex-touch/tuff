import type { ChildProcess } from 'node:child_process'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export const PLUGIN_WINDOW_PRESET_ACTION_IDS = Object.freeze([
  'preset-two-column',
  'preset-dev-split',
  'preset-clear-topmost'
] as const)

export type PluginWindowPresetActionId = (typeof PLUGIN_WINDOW_PRESET_ACTION_IDS)[number]

export const PLUGIN_WINDOW_PRESET_TIMEOUT_MS = 30_000
export const PLUGIN_WINDOW_PRESET_MAX_WINDOWS = 128
export const PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES = 256 * 1024

export interface PluginWindowPresetProcessExit {
  readonly code: number | null
  readonly stdout: string
}

export interface PluginWindowPresetProcess {
  started(): Promise<void>
  wait(): Promise<PluginWindowPresetProcessExit>
  kill(): void | Promise<void>
}

interface ListWindowsCommand {
  readonly operation: 'list-windows'
}

interface LayoutWindowsCommand {
  readonly operation: 'layout-windows'
  readonly leftHandle: string
  readonly rightHandle: string
}

interface ClearTopmostCommand {
  readonly operation: 'clear-topmost'
  readonly handles: readonly string[]
}

type PluginWindowPresetExecutorCommand =
  | ListWindowsCommand
  | LayoutWindowsCommand
  | ClearTopmostCommand

export interface PluginWindowPresetExecutor {
  start(command: PluginWindowPresetExecutorCommand): PluginWindowPresetProcess
}

declare const TRUSTED_WINDOW_PRESET_EXECUTOR_TYPE: unique symbol

interface TrustedPluginWindowPresetExecutor extends PluginWindowPresetExecutor {
  readonly [TRUSTED_WINDOW_PRESET_EXECUTOR_TYPE]: true
}

export interface PluginWindowPresetSpawnOptions {
  readonly cwd: string
  readonly env: Readonly<{ SystemRoot: string; WINDIR: string }>
  readonly shell: false
  readonly stdio: readonly ['ignore', 'pipe', 'ignore']
  readonly windowsHide: true
}

export interface FixedPluginWindowPresetExecutorOptions {
  readonly platform: NodeJS.Platform
  readonly windowsDirectory: string
  spawn(
    executable: string,
    args: readonly string[],
    options: PluginWindowPresetSpawnOptions
  ): PluginWindowPresetProcess
}

export interface PluginWindowPresetCapabilitiesOptions {
  readonly activation: PluginActivationIdentity
  readonly platform: NodeJS.Platform
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeShell(pluginName: string): boolean
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly executor: TrustedPluginWindowPresetExecutor
}

export interface PluginWindowPresetCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

type WindowPresetRequest =
  | { readonly operation: 'status' }
  | { readonly operation: 'run-action'; readonly actionId: PluginWindowPresetActionId }

type WindowPresetResult =
  | { readonly operation: 'status'; readonly status: 'available'; readonly windowCount: number }
  | {
      readonly operation: 'status'
      readonly status: 'blocked'
      readonly reason: 'permission-denied' | 'permission-unavailable' | 'platform-unsupported'
    }
  | { readonly operation: 'status'; readonly status: 'failed'; readonly reason: 'status-failed' }
  | {
      readonly operation: 'run-action'
      readonly actionId: PluginWindowPresetActionId
      readonly status: 'completed'
      readonly affectedWindows: number
    }
  | {
      readonly operation: 'run-action'
      readonly actionId: PluginWindowPresetActionId
      readonly status: 'blocked'
      readonly reason:
        | 'insufficient-windows'
        | 'permission-denied'
        | 'permission-unavailable'
        | 'platform-unsupported'
    }
  | {
      readonly operation: 'run-action'
      readonly actionId: PluginWindowPresetActionId
      readonly status: 'failed'
      readonly reason: 'execution-failed'
    }

interface WindowRecord {
  readonly name: string
  readonly title: string
  readonly pid: number
  readonly handle: string
  readonly isFront: boolean
}

interface OwnedProcess {
  readonly process: PluginWindowPresetProcess
  readonly wait: Promise<PluginWindowPresetProcessExit>
  readonly terminate: () => Promise<void>
}

const LIST_WINDOWS_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$TuffWindowPresetOperation = 'list'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class TuffWindowPresetWinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
$foreground = [TuffWindowPresetWinApi]::GetForegroundWindow().ToInt64()
$items = @(Get-Process |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } |
  Select-Object -First 129 |
  ForEach-Object {
    $handle = [Int64]$_.MainWindowHandle
    [pscustomobject]@{
      name = [string]$_.ProcessName
      title = [string]$_.MainWindowTitle
      pid = [int]$_.Id
      handle = [string]$handle
      isFront = ($handle -eq $foreground)
    }
  })
ConvertTo-Json -InputObject $items -Depth 3 -Compress`

function layoutWindowsScript(leftHandle: string, rightHandle: string): string {
  return String.raw`$ErrorActionPreference = 'Stop'
$TuffWindowPresetOperation = 'layout'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class TuffWindowPresetWinApi {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
Add-Type -AssemblyName System.Windows.Forms
$left = [IntPtr]${leftHandle}
$right = [IntPtr]${rightHandle}
$screen = [System.Windows.Forms.Screen]::FromHandle($left)
$area = $screen.WorkingArea
$leftWidth = [Math]::Floor($area.Width / 2)
$rightWidth = $area.Width - $leftWidth
[TuffWindowPresetWinApi]::ShowWindowAsync($left, 9) | Out-Null
[TuffWindowPresetWinApi]::ShowWindowAsync($right, 9) | Out-Null
$leftOk = [TuffWindowPresetWinApi]::SetWindowPos($left, [IntPtr]::Zero, $area.Left, $area.Top, $leftWidth, $area.Height, 0x0040)
$rightOk = [TuffWindowPresetWinApi]::SetWindowPos($right, [IntPtr]::Zero, ($area.Left + $leftWidth), $area.Top, $rightWidth, $area.Height, 0x0040)
$frontOk = [TuffWindowPresetWinApi]::SetForegroundWindow($left)
$success = [bool]($leftOk -and $rightOk -and $frontOk)
[pscustomobject]@{ success = $success; affectedWindows = 2 } | ConvertTo-Json -Compress`
}

function clearTopmostScript(handles: readonly string[]): string {
  const values = handles.map((handle) => `'${handle}'`).join(',')
  return String.raw`$ErrorActionPreference = 'Stop'
$TuffWindowPresetOperation = 'clear-topmost'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class TuffWindowPresetWinApi {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
$handles = @(${values})
$affected = 0
$success = $true
foreach ($value in $handles) {
  $handle = [IntPtr][Int64]::Parse($value)
  $flags = 0x0001 -bor 0x0002 -bor 0x0010 -bor 0x0040
  if ([TuffWindowPresetWinApi]::SetWindowPos($handle, [IntPtr](-2), 0, 0, 0, 0, $flags)) { $affected += 1 } else { $success = $false }
}
[pscustomobject]@{ success = [bool]$success; affectedWindows = [int]$affected } | ConvertTo-Json -Compress`
}

const TRUSTED_EXECUTORS = new WeakSet<object>()
const TRUSTED_PROCESSES = new WeakSet<object>()

function invalid(): never {
  throw new TypeError('PLUGIN_WINDOW_PRESET_INVALID')
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

function isActionId(value: unknown): value is PluginWindowPresetActionId {
  return (
    typeof value === 'string' &&
    PLUGIN_WINDOW_PRESET_ACTION_IDS.includes(value as PluginWindowPresetActionId)
  )
}

function validateRequest(value: unknown): WindowPresetRequest {
  const operation = exactRecord(value, ['operation', 'actionId'], ['operation'])
  if (operation.operation === 'status' && !Object.hasOwn(operation, 'actionId')) {
    return Object.freeze({ operation: 'status' })
  }
  if (operation.operation === 'run-action' && isActionId(operation.actionId)) {
    return Object.freeze({ operation: 'run-action', actionId: operation.actionId })
  }
  invalid()
}

function validateResult(value: unknown): WindowPresetResult {
  const record = exactRecord(
    value,
    ['operation', 'actionId', 'status', 'windowCount', 'affectedWindows', 'reason'],
    ['operation', 'status']
  )
  if (record.operation === 'status') {
    if (
      record.status === 'available' &&
      Number.isSafeInteger(record.windowCount) &&
      Number(record.windowCount) >= 0 &&
      Number(record.windowCount) <= PLUGIN_WINDOW_PRESET_MAX_WINDOWS &&
      !Object.hasOwn(record, 'actionId') &&
      !Object.hasOwn(record, 'affectedWindows') &&
      !Object.hasOwn(record, 'reason')
    ) {
      return Object.freeze({
        operation: 'status',
        status: 'available',
        windowCount: Number(record.windowCount)
      })
    }
    if (
      record.status === 'blocked' &&
      !Object.hasOwn(record, 'actionId') &&
      !Object.hasOwn(record, 'windowCount') &&
      !Object.hasOwn(record, 'affectedWindows') &&
      (record.reason === 'permission-denied' ||
        record.reason === 'permission-unavailable' ||
        record.reason === 'platform-unsupported')
    ) {
      return Object.freeze({ operation: 'status', status: 'blocked', reason: record.reason })
    }
    if (
      record.status === 'failed' &&
      record.reason === 'status-failed' &&
      !Object.hasOwn(record, 'actionId') &&
      !Object.hasOwn(record, 'windowCount') &&
      !Object.hasOwn(record, 'affectedWindows')
    ) {
      return Object.freeze({ operation: 'status', status: 'failed', reason: 'status-failed' })
    }
    invalid()
  }
  if (record.operation !== 'run-action' || !isActionId(record.actionId)) invalid()
  if (
    record.status === 'completed' &&
    Number.isSafeInteger(record.affectedWindows) &&
    Number(record.affectedWindows) >= 1 &&
    Number(record.affectedWindows) <= PLUGIN_WINDOW_PRESET_MAX_WINDOWS &&
    !Object.hasOwn(record, 'reason') &&
    !Object.hasOwn(record, 'windowCount')
  ) {
    return Object.freeze({
      operation: 'run-action',
      actionId: record.actionId,
      status: 'completed',
      affectedWindows: Number(record.affectedWindows)
    })
  }
  if (
    record.status === 'blocked' &&
    !Object.hasOwn(record, 'windowCount') &&
    !Object.hasOwn(record, 'affectedWindows') &&
    (record.reason === 'insufficient-windows' ||
      record.reason === 'permission-denied' ||
      record.reason === 'permission-unavailable' ||
      record.reason === 'platform-unsupported')
  ) {
    return Object.freeze({
      operation: 'run-action',
      actionId: record.actionId,
      status: 'blocked',
      reason: record.reason
    })
  }
  if (
    record.status === 'failed' &&
    record.reason === 'execution-failed' &&
    !Object.hasOwn(record, 'windowCount') &&
    !Object.hasOwn(record, 'affectedWindows')
  ) {
    return Object.freeze({
      operation: 'run-action',
      actionId: record.actionId,
      status: 'failed',
      reason: 'execution-failed'
    })
  }
  invalid()
}

function assertSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

async function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  assertSignal(signal)
  let dispose = (): void => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void =>
      reject(new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED'))
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

function safeHandle(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value)) invalid()
  try {
    if (BigInt(value) < 1n || BigInt(value) > 18_446_744_073_709_551_615n) invalid()
  } catch {
    invalid()
  }
  return value
}

function snapshotProcessShape(value: unknown): PluginWindowPresetProcess {
  const record = exactRecord(value, ['started', 'wait', 'kill'])
  if (
    typeof record.started !== 'function' ||
    utilTypes.isProxy(record.started) ||
    typeof record.wait !== 'function' ||
    utilTypes.isProxy(record.wait) ||
    typeof record.kill !== 'function' ||
    utilTypes.isProxy(record.kill)
  ) {
    invalid()
  }
  const started = record.started as PluginWindowPresetProcess['started']
  const wait = record.wait as PluginWindowPresetProcess['wait']
  const kill = record.kill as PluginWindowPresetProcess['kill']
  return Object.freeze({
    started: () => started.call(value),
    wait: () => wait.call(value),
    kill: () => kill.call(value)
  })
}

function trustProcess(value: unknown): PluginWindowPresetProcess {
  const process = snapshotProcessShape(value)
  TRUSTED_PROCESSES.add(process)
  return process
}

function snapshotProcess(value: unknown): PluginWindowPresetProcess {
  if (!value || typeof value !== 'object' || !TRUSTED_PROCESSES.has(value)) invalid()
  return value as PluginWindowPresetProcess
}

function snapshotExit(value: unknown): PluginWindowPresetProcessExit {
  const record = exactRecord(value, ['code', 'stdout'])
  if (
    (record.code !== null && !Number.isSafeInteger(record.code)) ||
    typeof record.stdout !== 'string' ||
    Buffer.byteLength(record.stdout, 'utf8') > PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES
  ) {
    invalid()
  }
  return Object.freeze({
    code: record.code === null ? null : Number(record.code),
    stdout: record.stdout
  })
}

function snapshotWindow(value: unknown): WindowRecord {
  const record = exactRecord(value, ['name', 'title', 'pid', 'handle', 'isFront'])
  if (
    typeof record.name !== 'string' ||
    record.name.length < 1 ||
    record.name.length > 128 ||
    Buffer.byteLength(record.name, 'utf8') > 512 ||
    typeof record.title !== 'string' ||
    record.title.length < 1 ||
    record.title.length > 256 ||
    Buffer.byteLength(record.title, 'utf8') > 1024 ||
    !Number.isSafeInteger(record.pid) ||
    Number(record.pid) < 1 ||
    Number(record.pid) > 2_147_483_647 ||
    typeof record.isFront !== 'boolean'
  ) {
    invalid()
  }
  return Object.freeze({
    name: record.name,
    title: record.title,
    pid: Number(record.pid),
    handle: safeHandle(record.handle),
    isFront: record.isFront
  })
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function parseWindows(stdout: string): readonly WindowRecord[] {
  if (Buffer.byteLength(stdout, 'utf8') > PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES) invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    invalid()
  }
  if (
    !Array.isArray(parsed) ||
    utilTypes.isProxy(parsed) ||
    parsed.length > PLUGIN_WINDOW_PRESET_MAX_WINDOWS
  ) {
    invalid()
  }
  const seen = new Set<string>()
  const windows = parsed.map((entry) => {
    const window = snapshotWindow(entry)
    if (seen.has(window.handle)) invalid()
    seen.add(window.handle)
    return window
  })
  windows.sort((left, right) => {
    if (left.isFront !== right.isFront) return left.isFront ? -1 : 1
    return compareText(left.name, right.name) || compareText(left.title, right.title)
  })
  return Object.freeze(windows)
}

function parseActionResult(stdout: string, expectedAffected: number): void {
  if (Buffer.byteLength(stdout, 'utf8') > PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES) invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    invalid()
  }
  const record = exactRecord(parsed, ['success', 'affectedWindows'])
  if (
    record.success !== true ||
    !Number.isSafeInteger(record.affectedWindows) ||
    Number(record.affectedWindows) !== expectedAffected
  ) {
    invalid()
  }
}

function selectLayoutPair(
  windows: readonly WindowRecord[],
  actionId: 'preset-two-column' | 'preset-dev-split'
): readonly [WindowRecord, WindowRecord] | null {
  if (windows.length < 2) return null
  if (actionId === 'preset-two-column') return Object.freeze([windows[0], windows[1]])
  const terminalPattern = /terminal|powershell|cmd|iterm|warp/i
  const browserPattern = /chrome|edge|firefox|brave|opera|safari/i
  const terminal =
    windows.find(
      (entry) => terminalPattern.test(entry.name) || terminalPattern.test(entry.title)
    ) ?? windows[0]
  const browser =
    windows.find(
      (entry) =>
        entry.handle !== terminal.handle &&
        (browserPattern.test(entry.name) || browserPattern.test(entry.title))
    ) ?? windows.find((entry) => entry.handle !== terminal.handle)
  return browser ? Object.freeze([terminal, browser]) : null
}

function snapshotWindowsDirectory(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 3 ||
    value.length > 260 ||
    /[\0\r\n"']/.test(value) ||
    !path.win32.isAbsolute(value) ||
    path.win32.normalize(value) !== value
  ) {
    invalid()
  }
  const normalized = path.win32.normalize(value)
  const parsed = path.win32.parse(normalized)
  if (
    !/^[A-Za-z]:\\/.test(normalized) ||
    parsed.root.length !== 3 ||
    path.win32.relative(parsed.root, normalized).toLowerCase() !== 'windows'
  ) {
    invalid()
  }
  return normalized
}

function snapshotCommand(value: unknown): PluginWindowPresetExecutorCommand {
  const record = exactRecord(
    value,
    ['operation', 'leftHandle', 'rightHandle', 'handles'],
    ['operation']
  )
  if (
    record.operation === 'list-windows' &&
    !Object.hasOwn(record, 'leftHandle') &&
    !Object.hasOwn(record, 'rightHandle') &&
    !Object.hasOwn(record, 'handles')
  ) {
    return Object.freeze({ operation: 'list-windows' })
  }
  if (
    record.operation === 'layout-windows' &&
    !Object.hasOwn(record, 'handles') &&
    Object.hasOwn(record, 'leftHandle') &&
    Object.hasOwn(record, 'rightHandle')
  ) {
    const leftHandle = safeHandle(record.leftHandle)
    const rightHandle = safeHandle(record.rightHandle)
    if (leftHandle === rightHandle) invalid()
    return Object.freeze({ operation: 'layout-windows', leftHandle, rightHandle })
  }
  if (
    record.operation === 'clear-topmost' &&
    !Object.hasOwn(record, 'leftHandle') &&
    !Object.hasOwn(record, 'rightHandle') &&
    Array.isArray(record.handles) &&
    !utilTypes.isProxy(record.handles) &&
    record.handles.length >= 1 &&
    record.handles.length <= PLUGIN_WINDOW_PRESET_MAX_WINDOWS
  ) {
    const handles = record.handles.map(safeHandle)
    if (new Set(handles).size !== handles.length) invalid()
    return Object.freeze({ operation: 'clear-topmost', handles: Object.freeze(handles) })
  }
  invalid()
}

export function createFixedPluginWindowPresetExecutor(
  rawOptions: FixedPluginWindowPresetExecutorOptions
): TrustedPluginWindowPresetExecutor {
  const options = exactRecord(rawOptions, ['platform', 'windowsDirectory', 'spawn'])
  if (
    typeof options.platform !== 'string' ||
    typeof options.spawn !== 'function' ||
    utilTypes.isProxy(options.spawn)
  ) {
    invalid()
  }
  const platform = options.platform as NodeJS.Platform
  const windowsDirectory = snapshotWindowsDirectory(options.windowsDirectory)
  const executableDirectory = path.win32.join(
    windowsDirectory,
    'System32',
    'WindowsPowerShell',
    'v1.0'
  )
  const executable = path.win32.join(executableDirectory, 'powershell.exe')
  const environment = Object.freeze({ SystemRoot: windowsDirectory, WINDIR: windowsDirectory })
  const spawn = options.spawn as FixedPluginWindowPresetExecutorOptions['spawn']
  const executor = Object.freeze({
    start(rawCommand: PluginWindowPresetExecutorCommand): PluginWindowPresetProcess {
      if (platform !== 'win32') invalid()
      const command = snapshotCommand(rawCommand)
      const script =
        command.operation === 'list-windows'
          ? LIST_WINDOWS_SCRIPT
          : command.operation === 'layout-windows'
            ? layoutWindowsScript(command.leftHandle, command.rightHandle)
            : clearTopmostScript(command.handles)
      return trustProcess(
        spawn.call(
          rawOptions,
          executable,
          Object.freeze([
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            script
          ]),
          Object.freeze({
            cwd: executableDirectory,
            env: environment,
            shell: false,
            stdio: Object.freeze(['ignore', 'pipe', 'ignore']) as readonly [
              'ignore',
              'pipe',
              'ignore'
            ],
            windowsHide: true
          })
        )
      )
    }
  }) as TrustedPluginWindowPresetExecutor
  TRUSTED_EXECUTORS.add(executor)
  return executor
}

export function createPluginWindowPresetCapabilities(
  rawOptions: PluginWindowPresetCapabilitiesOptions
): PluginWindowPresetCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'platform',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeShell',
    'watchShellPermissionRevoked',
    'executor'
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
    utilTypes.isProxy(options.watchShellPermissionRevoked) ||
    !options.executor ||
    typeof options.executor !== 'object' ||
    !TRUSTED_EXECUTORS.has(options.executor)
  ) {
    invalid()
  }
  const expectedActivation = snapshotActivation(options.activation)
  if (expectedActivation.name !== 'touch-window-presets') invalid()
  const platform = options.platform as NodeJS.Platform
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginWindowPresetCapabilitiesOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginWindowPresetCapabilitiesOptions['resolveHostGeneration']
  const authorizeShell =
    options.authorizeShell as PluginWindowPresetCapabilitiesOptions['authorizeShell']
  const watchShellPermissionRevoked =
    options.watchShellPermissionRevoked as PluginWindowPresetCapabilitiesOptions['watchShellPermissionRevoked']
  const start = dataMethod<PluginWindowPresetExecutor['start']>(options.executor, 'start')
  const owned = new Set<OwnedProcess>()
  let closed = false
  let revoked = false
  let closePromise: Promise<void> | null = null
  let activeOperations = 0
  const operationIdleWaiters = new Set<() => void>()
  let permissionDisposer: (() => void) | null = null
  let permissionWatcherAvailable = true

  const beginOperation = (): (() => void) => {
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    activeOperations += 1
    let finished = false
    return () => {
      if (finished) return
      finished = true
      activeOperations -= 1
      if (activeOperations !== 0) return
      for (const resolve of operationIdleWaiters) resolve()
      operationIdleWaiters.clear()
    }
  }
  const waitForOperationsIdle = (): Promise<void> => {
    if (activeOperations === 0) return Promise.resolve()
    return new Promise((resolve) => operationIdleWaiters.add(resolve))
  }

  const terminateAll = async (): Promise<void> => {
    const results = await Promise.allSettled([...owned].map((record) => record.terminate()))
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('PLUGIN_WINDOW_PRESET_TEARDOWN_FAILED')
    }
  }
  try {
    const disposer = watchShellPermissionRevoked.call(rawOptions, expectedActivation.name, () => {
      revoked = true
      void terminateAll().catch(() => undefined)
    })
    if (typeof disposer !== 'function' || utilTypes.isProxy(disposer)) invalid()
    permissionDisposer = disposer
  } catch {
    permissionWatcherAvailable = false
  }

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
    const current = resolveCurrentActivation(identity.pluginName)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expectedActivation) ||
      resolveHostGeneration(expectedActivation) !== identity.hostGeneration
    ) {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION')
    }
    return Number(identity.hostGeneration)
  }

  const permissionResult = (): 'allowed' | 'denied' | 'unavailable' => {
    if (!permissionWatcherAvailable) return 'unavailable'
    if (revoked) return 'denied'
    try {
      const result = authorizeShell.call(rawOptions, expectedActivation.name)
      return typeof result !== 'boolean' ? 'unavailable' : result ? 'allowed' : 'denied'
    } catch {
      return 'unavailable'
    }
  }

  const assertAdmission = (context: PluginSecurityContext, signal: AbortSignal): void => {
    assertSignal(signal)
    assertAuthority(context)
    if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
    const permission = permissionResult()
    if (permission === 'denied') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    }
    if (permission === 'unavailable') {
      throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    }
  }

  const ownProcess = (process: PluginWindowPresetProcess): OwnedProcess => {
    let exited = false
    let terminatePromise: Promise<void> | null = null
    const wait = Promise.resolve()
      .then(() => process.wait())
      .then((value) => {
        const exit = snapshotExit(value)
        exited = true
        return exit
      })
    void wait.catch(() => undefined)
    const record: OwnedProcess = {
      process,
      wait,
      terminate: () => {
        if (terminatePromise) return terminatePromise
        terminatePromise = Promise.resolve().then(async () => {
          if (!exited) {
            try {
              await process.kill()
            } catch {
              // The real process exit remains the teardown barrier.
            }
          }
          await wait.catch(() => undefined)
        })
        return terminatePromise
      }
    }
    owned.add(record)
    void wait.finally(() => owned.delete(record)).catch(() => undefined)
    return record
  }

  const runCommand = async (
    command: PluginWindowPresetExecutorCommand,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): Promise<string> => {
    assertAdmission(context, signal)
    const finishOperation = beginOperation()
    try {
      let process: PluginWindowPresetProcess
      try {
        process = snapshotProcess(start.call(options.executor, command))
      } catch {
        invalid()
      }
      const record = ownProcess(process)
      assertAdmission(context, signal)
      try {
        await awaitWithAbort(
          Promise.resolve().then(() => process.started()),
          signal
        )
        assertAdmission(context, signal)
        const exit = await awaitWithAbort(record.wait, signal)
        assertAdmission(context, signal)
        if (exit.code !== 0) invalid()
        return exit.stdout
      } catch (error) {
        await record.terminate()
        throw error
      }
    } finally {
      finishOperation()
    }
  }

  const listWindows = async (
    context: PluginSecurityContext,
    signal: AbortSignal
  ): Promise<readonly WindowRecord[]> => {
    const stdout = await runCommand(Object.freeze({ operation: 'list-windows' }), context, signal)
    return parseWindows(stdout)
  }

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'system.window-presets',
    permission: 'system.shell',
    timeoutMs: PLUGIN_WINDOW_PRESET_TIMEOUT_MS,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    async invoke(context, request, signal) {
      assertAuthority(context)
      assertSignal(signal)
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      const normalized = request as WindowPresetRequest
      if (platform !== 'win32') {
        return normalized.operation === 'status'
          ? Object.freeze({
              operation: 'status',
              status: 'blocked',
              reason: 'platform-unsupported'
            })
          : Object.freeze({
              operation: 'run-action',
              actionId: normalized.actionId,
              status: 'blocked',
              reason: 'platform-unsupported'
            })
      }

      let windows: readonly WindowRecord[]
      try {
        windows = await listWindows(context, signal)
      } catch (error) {
        if (error instanceof PluginHostCapabilityError) throw error
        return normalized.operation === 'status'
          ? Object.freeze({ operation: 'status', status: 'failed', reason: 'status-failed' })
          : Object.freeze({
              operation: 'run-action',
              actionId: normalized.actionId,
              status: 'failed',
              reason: 'execution-failed'
            })
      }
      if (normalized.operation === 'status') {
        return Object.freeze({
          operation: 'status',
          status: 'available',
          windowCount: windows.length
        })
      }

      let command: PluginWindowPresetExecutorCommand
      let affectedWindows: number
      if (normalized.actionId === 'preset-clear-topmost') {
        if (windows.length < 1) {
          return Object.freeze({
            operation: 'run-action',
            actionId: normalized.actionId,
            status: 'blocked',
            reason: 'insufficient-windows'
          })
        }
        affectedWindows = windows.length
        command = Object.freeze({
          operation: 'clear-topmost',
          handles: Object.freeze(windows.map((entry) => entry.handle))
        })
      } else {
        const pair = selectLayoutPair(windows, normalized.actionId)
        if (!pair) {
          return Object.freeze({
            operation: 'run-action',
            actionId: normalized.actionId,
            status: 'blocked',
            reason: 'insufficient-windows'
          })
        }
        affectedWindows = 2
        command = Object.freeze({
          operation: 'layout-windows',
          leftHandle: pair[0].handle,
          rightHandle: pair[1].handle
        })
      }

      try {
        const stdout = await runCommand(command, context, signal)
        parseActionResult(stdout, affectedWindows)
        assertAdmission(context, signal)
        return Object.freeze({
          operation: 'run-action',
          actionId: normalized.actionId,
          status: 'completed',
          affectedWindows
        })
      } catch (error) {
        if (error instanceof PluginHostCapabilityError) throw error
        return Object.freeze({
          operation: 'run-action',
          actionId: normalized.actionId,
          status: 'failed',
          reason: 'execution-failed'
        })
      }
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      try {
        permissionDisposer?.()
      } catch {
        // Activation authority is already closed.
      }
      permissionDisposer = null
      closePromise = (async () => {
        await terminateAll()
        await waitForOperationsIdle()
        await terminateAll()
      })()
      return closePromise
    }
  })
}

export function createPluginWindowPresetProcess(child: ChildProcess): PluginWindowPresetProcess {
  let spawned = typeof child.pid === 'number'
  let settled = false
  let overflow = false
  let stdout = ''
  let stdoutBytes = 0
  let killRequested = false
  let killRequestError: Error | null = null
  const stdoutDecoder = new StringDecoder('utf8')
  let killPromise: Promise<void> | null = null
  let resolveStarted!: () => void
  let rejectStarted!: (error: Error) => void
  let resolveExit!: (exit: PluginWindowPresetProcessExit) => void
  let rejectExit!: (error: Error) => void
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve
    rejectStarted = reject
  })
  const exit = new Promise<PluginWindowPresetProcessExit>((resolve, reject) => {
    resolveExit = resolve
    rejectExit = reject
  })
  const stdoutStream = child.stdout
  if (!stdoutStream || typeof stdoutStream.on !== 'function') invalid()
  const cleanup = (): void => {
    child.removeListener('spawn', onSpawn)
    child.removeListener('error', onError)
    child.removeListener('exit', onExit)
    stdoutStream.removeListener('data', onStdout)
  }
  const failSpawn = (): void => {
    if (settled) return
    settled = true
    cleanup()
    const error = new Error('PLUGIN_WINDOW_PRESET_PROCESS_SPAWN_FAILED')
    rejectStarted(error)
    rejectExit(error)
  }
  const onSpawn = (): void => {
    if (settled) return
    spawned = true
    resolveStarted()
  }
  const onError = (): void => {
    if (!spawned) failSpawn()
  }
  const requestKill = (): void => {
    if (settled || killRequested) return
    killRequested = true
    try {
      if (child.kill() !== true) {
        killRequestError = new Error('PLUGIN_WINDOW_PRESET_PROCESS_KILL_FAILED')
      }
    } catch {
      killRequestError = new Error('PLUGIN_WINDOW_PRESET_PROCESS_KILL_FAILED')
    }
  }
  const onStdout = (chunk: unknown): void => {
    if (settled || overflow) return
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    stdoutBytes += bytes.byteLength
    if (stdoutBytes > PLUGIN_WINDOW_PRESET_MAX_STDOUT_BYTES) {
      overflow = true
      requestKill()
      return
    }
    stdout += stdoutDecoder.write(bytes)
  }
  const onExit = (code: number | null): void => {
    if (settled) return
    settled = true
    cleanup()
    if (!spawned) {
      const error = new Error('PLUGIN_WINDOW_PRESET_PROCESS_SPAWN_FAILED')
      rejectStarted(error)
      rejectExit(error)
      return
    }
    if (overflow) {
      rejectExit(new Error('PLUGIN_WINDOW_PRESET_PROCESS_OUTPUT_LIMIT'))
      return
    }
    stdout += stdoutDecoder.end()
    resolveExit(
      Object.freeze({
        code: Number.isSafeInteger(code) ? Number(code) : null,
        stdout
      })
    )
  }
  child.once('spawn', onSpawn)
  child.once('error', onError)
  child.once('exit', onExit)
  stdoutStream.on('data', onStdout)
  if (spawned) resolveStarted()
  void started.catch(() => undefined)
  void exit.catch(() => undefined)

  return trustProcess(
    Object.freeze({
      started: () => started,
      wait: () => exit,
      kill: (): Promise<void> => {
        if (killPromise) return killPromise
        killPromise = Promise.resolve().then(async () => {
          requestKill()
          let exitError: unknown
          try {
            await exit
          } catch (error) {
            exitError = error
          }
          if (killRequestError) throw killRequestError
          if (exitError) throw exitError
        })
        return killPromise
      }
    })
  )
}
