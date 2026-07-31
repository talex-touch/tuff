import type { ChildProcess } from 'node:child_process'
import type { PluginActivationIdentity, PluginSecurityContext } from '@talex-touch/utils/transport'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { types as utilTypes } from 'node:util'
import {
  PluginHostCapabilityError,
  type PluginHostCapabilityDefinition
} from './plugin-host-capabilities'

export const PLUGIN_WINDOW_MANAGER_ACTION_IDS = Object.freeze([
  'activate',
  'snap-left',
  'snap-right',
  'topmost-toggle',
  'close',
  'hide',
  'quit',
  'launch'
] as const)

export type PluginWindowManagerActionId = (typeof PLUGIN_WINDOW_MANAGER_ACTION_IDS)[number]

export const PLUGIN_WINDOW_MANAGER_TIMEOUT_MS = 30_000
export const PLUGIN_WINDOW_MANAGER_MAX_WINDOWS = 128
export const PLUGIN_WINDOW_MANAGER_MAX_APPS = 64
export const PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES = 256 * 1024
export const PLUGIN_WINDOW_MANAGER_TOKEN_TTL_MS = 10_000

export interface PluginWindowManagerProcessExit {
  readonly code: number | null
  readonly stdout: string
}

export interface PluginWindowManagerProcess {
  started(): Promise<void>
  wait(): Promise<PluginWindowManagerProcessExit>
  kill(): void | Promise<void>
}

export interface PluginWindowManagerSpawnOptions {
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly shell: false
  readonly stdio: readonly ['ignore', 'pipe', 'ignore']
  readonly windowsHide: true
}

interface NativeWindowTarget {
  readonly kind: 'window'
  readonly name: string
  readonly title: string
  readonly pid: number
  readonly nativeId: string
  readonly startTime: string
  readonly appPath: string | null
  readonly topmost: boolean
  readonly isFront: boolean
}

interface NativeAppTarget {
  readonly kind: 'app'
  readonly name: string
  readonly pid: number
  readonly nativeId: string
  readonly startTime: string
  readonly appPath: string
  readonly running: boolean
}

type NativeTarget = NativeWindowTarget | NativeAppTarget

interface NativeInventory {
  readonly windows: readonly NativeWindowTarget[]
  readonly apps: readonly NativeAppTarget[]
}

interface TrustedPluginWindowManagerService {
  readonly platform: NodeJS.Platform
  startList(): PluginWindowManagerProcess
  startAction(action: PluginWindowManagerActionId, target: NativeTarget): PluginWindowManagerProcess
  parseInventory(stdout: string): NativeInventory
  parseAction(stdout: string): void
}

export interface FixedPluginWindowManagerServiceOptions {
  readonly platform: NodeJS.Platform
  readonly windowsDirectory: string
  spawn(
    executable: string,
    args: readonly string[],
    options: PluginWindowManagerSpawnOptions
  ): PluginWindowManagerProcess
}

export interface PluginWindowManagerCapabilitiesOptions {
  readonly activation: PluginActivationIdentity
  readonly platform: NodeJS.Platform
  resolveCurrentActivation(pluginName: string): PluginActivationIdentity | undefined
  resolveHostGeneration(activation: PluginActivationIdentity): number | undefined
  authorizeShell(pluginName: string): boolean
  watchShellPermissionRevoked(pluginName: string, onRevoke: () => void): () => void
  readonly service: TrustedPluginWindowManagerService
}

export interface PluginWindowManagerCapabilities {
  readonly definitions: readonly PluginHostCapabilityDefinition[]
  close(): Promise<void>
}

type WindowManagerRequest =
  | { readonly operation: 'list' }
  | {
      readonly operation: 'act'
      readonly action: PluginWindowManagerActionId
      readonly token: string
    }

interface WindowDisplayItem {
  readonly kind: 'window'
  readonly token: string
  readonly name: string
  readonly title: string
  readonly isFront: boolean
  readonly topmost: boolean
  readonly actions: readonly PluginWindowManagerActionId[]
}

interface AppDisplayItem {
  readonly kind: 'app'
  readonly token: string
  readonly name: string
  readonly running: boolean
  readonly actions: readonly ['launch']
}

type WindowManagerDisplayItem = WindowDisplayItem | AppDisplayItem

type WindowManagerResult =
  | {
      readonly operation: 'list'
      readonly status: 'available'
      readonly platform: 'win32' | 'darwin'
      readonly items: readonly WindowManagerDisplayItem[]
    }
  | {
      readonly operation: 'list'
      readonly status: 'blocked'
      readonly reason: 'platform-unsupported'
    }
  | { readonly operation: 'list'; readonly status: 'failed'; readonly reason: 'list-failed' }
  | {
      readonly operation: 'act'
      readonly action: PluginWindowManagerActionId
      readonly status: 'completed'
    }
  | {
      readonly operation: 'act'
      readonly action: PluginWindowManagerActionId
      readonly status: 'blocked'
      readonly reason:
        | 'token-invalid'
        | 'token-expired'
        | 'token-replayed'
        | 'native-replaced'
        | 'action-unsupported'
        | 'platform-unsupported'
    }
  | {
      readonly operation: 'act'
      readonly action: PluginWindowManagerActionId
      readonly status: 'failed'
      readonly reason: 'action-failed'
    }

interface TokenRecord {
  readonly epoch: number
  readonly expiresAt: number
  readonly target: NativeTarget
}

interface OwnedProcess {
  readonly wait: Promise<PluginWindowManagerProcessExit>
  terminate(): Promise<void>
}

const WINDOWS_ACTIONS = Object.freeze(
  PLUGIN_WINDOW_MANAGER_ACTION_IDS.filter((action) => action !== 'launch')
)
const MAC_WINDOW_ACTIONS = Object.freeze<readonly PluginWindowManagerActionId[]>([
  'activate',
  'close',
  'hide',
  'quit'
])
const APP_ACTIONS = Object.freeze(['launch'] as const)
const TOKEN_PATTERN = /^wm_[A-Za-z0-9_-]{32}$/
const TRUSTED_SERVICES = new WeakSet<object>()
const TRUSTED_PROCESSES = new WeakSet<object>()
const TRUSTED_TARGETS = new WeakSet<object>()

const WINDOWS_LIST_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
$TuffWindowManagerOperation = 'list'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class TuffWindowManagerWinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern IntPtr GetWindowLongPtr32(IntPtr hWnd, int nIndex);
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, nIndex) : GetWindowLongPtr32(hWnd, nIndex);
  }
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
$foreground = [TuffWindowManagerWinApi]::GetForegroundWindow().ToInt64()
$windows = @()
$apps = @()
$seenApps = @{}
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } | Select-Object -First 129 | ForEach-Object {
  try {
    $handle = [Int64]$_.MainWindowHandle
    $style = [TuffWindowManagerWinApi]::GetWindowLongPtr([IntPtr]$handle, -20).ToInt64()
    $startTime = [string]$_.StartTime.ToUniversalTime().Ticks
    $appPath = [string]$_.Path
    $windows += [pscustomobject]@{
      name = [string]$_.ProcessName
      title = [string]$_.MainWindowTitle
      pid = [int]$_.Id
      nativeId = [string]$handle
      startTime = $startTime
      appPath = $appPath
      topmost = [bool]($style -band 0x00000008)
      isFront = ($handle -eq $foreground)
    }
    if ($appPath -and -not $seenApps.ContainsKey($appPath) -and $apps.Count -lt 65) {
      $seenApps[$appPath] = $true
      $apps += [pscustomobject]@{
        name = [string]$_.ProcessName
        pid = [int]$_.Id
        nativeId = [string]$_.Id
        startTime = $startTime
        appPath = $appPath
        running = $true
      }
    }
  } catch {}
}
[pscustomobject]@{ windows = $windows; apps = $apps } | ConvertTo-Json -Depth 4 -Compress`

const MAC_LIST_SCRIPT = String.raw`ObjC.import('AppKit');
const TuffWindowManagerOperation = 'list';
const systemEvents = Application('System Events');
const processes = systemEvents.applicationProcesses.whose({ backgroundOnly: false })();
const windows = [];
const apps = [];
for (let index = 0; index < processes.length && windows.length < 129; index += 1) {
  try {
    const target = processes[index];
    const pid = Number(target.unixId());
    const name = String(target.name());
    const appPath = String(target.applicationFile().posixPath());
    const running = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
    const launchTime = Number(running.launchDate.timeIntervalSince1970);
    if (!Number.isFinite(launchTime)) continue;
    const bundleValue = running.bundleIdentifier;
    const bundleId = bundleValue ? String(ObjC.unwrap(bundleValue)) : '';
    const titles = target.windows().map((entry) => String(entry.name() || '')).filter(Boolean);
    const title = titles[0] || name;
    const startTime = String(Math.trunc(launchTime * 1000));
    windows.push({ name, title, pid, nativeId: String(pid), startTime, appPath, topmost: false, isFront: Boolean(target.frontmost()) });
    if (bundleId && apps.length < 65 && !apps.some((entry) => entry.appPath === appPath)) {
      apps.push({ name, pid, nativeId: bundleId, startTime, appPath, running: true });
    }
  } catch {}
}
JSON.stringify({ windows, apps });`

function windowsActionScript(action: PluginWindowManagerActionId): string {
  if (action === 'launch') {
    return String.raw`$ErrorActionPreference = 'Stop'
$TuffWindowManagerOperation = 'act:launch'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class TuffWindowManagerLaunchWinApi {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
$expectedPid = [int]$args[0]
$expectedStartTime = [string]$args[1]
$target = Get-Process -Id $expectedPid -ErrorAction Stop
if ([string]$target.StartTime.ToUniversalTime().Ticks -ne $expectedStartTime) { throw 'native identity changed' }
$hWnd = [IntPtr][Int64]$target.MainWindowHandle
$ok = ($hWnd -ne [IntPtr]::Zero) -and [TuffWindowManagerLaunchWinApi]::ShowWindowAsync($hWnd, 9) -and [TuffWindowManagerLaunchWinApi]::SetForegroundWindow($hWnd)
[pscustomobject]@{ success = [bool]$ok } | ConvertTo-Json -Compress`
  }
  const operation = `act:${action}`
  const body =
    action === 'activate'
      ? '$ok = [TuffWindowManagerWinApi]::ShowWindowAsync($hWnd, 9) -and [TuffWindowManagerWinApi]::SetForegroundWindow($hWnd)'
      : action === 'snap-left' || action === 'snap-right'
        ? String.raw`Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::FromHandle($hWnd)
$area = $screen.WorkingArea
$width = [Math]::Floor($area.Width / 2)
$x = if ($args[3] -eq 'left') { $area.Left } else { $area.Left + $width }
[TuffWindowManagerWinApi]::ShowWindowAsync($hWnd, 9) | Out-Null
$ok = [TuffWindowManagerWinApi]::SetWindowPos($hWnd, [IntPtr]::Zero, $x, $area.Top, $width, $area.Height, 0x0040)`
        : action === 'topmost-toggle'
          ? String.raw`$insertAfter = if ($args[3] -eq 'topmost') { [IntPtr](-1) } else { [IntPtr](-2) }
$ok = [TuffWindowManagerWinApi]::SetWindowPos($hWnd, $insertAfter, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040)`
          : action === 'hide'
            ? '$ok = [TuffWindowManagerWinApi]::ShowWindowAsync($hWnd, 0)'
            : '$ok = [TuffWindowManagerWinApi]::PostMessage($hWnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)'
  return String.raw`$ErrorActionPreference = 'Stop'
$TuffWindowManagerOperation = '${operation}'
$code = @"
using System;
using System.Runtime.InteropServices;
public static class TuffWindowManagerWinApi {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
Add-Type -TypeDefinition $code -ErrorAction Stop | Out-Null
$expectedHandle = [string]$args[0]
$expectedPid = [int]$args[1]
$expectedStartTime = [string]$args[2]
$target = Get-Process -Id $expectedPid -ErrorAction Stop
if ([string]$target.StartTime.ToUniversalTime().Ticks -ne $expectedStartTime) { throw 'native identity changed' }
if ([string][Int64]$target.MainWindowHandle -ne $expectedHandle) { throw 'native identity changed' }
$hWnd = [IntPtr][Int64]::Parse($expectedHandle)
${body}
[pscustomobject]@{ success = [bool]$ok } | ConvertTo-Json -Compress`
}

function macActionScript(action: PluginWindowManagerActionId): string {
  const operation = `act:${action}`
  const statement =
    action === 'activate' || action === 'launch'
      ? String.raw`if (!Boolean(running.activateWithOptions($.NSApplicationActivateIgnoringOtherApps)))
  throw new Error('activation unavailable');`
      : action === 'quit'
        ? String.raw`if (!Boolean(running.terminate))
  throw new Error('termination unavailable');`
        : action === 'hide'
          ? 'target.visible = false;'
          : String.raw`const windows = target.windows();
if (windows.length < 1) throw new Error('window unavailable');
const close = windows[0].actions.byName('AXClose');
if (!close.exists()) throw new Error('close unavailable');
close.perform();`
  return String.raw`ObjC.import('AppKit');
const TuffWindowManagerOperation = '${operation}';
function run(argv) {
  const pid = Number(argv[0]);
  const expectedStartTime = String(argv[1]);
  const expectedBundleId = String(argv[2] || '');
  const running = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
  const launchTime = Number(running.launchDate.timeIntervalSince1970);
  const bundleValue = running.bundleIdentifier;
  const bundleId = bundleValue ? String(ObjC.unwrap(bundleValue)) : '';
  if (!Number.isFinite(launchTime) || String(Math.trunc(launchTime * 1000)) !== expectedStartTime)
    throw new Error('native identity changed');
  if (expectedBundleId && bundleId !== expectedBundleId)
    throw new Error('native identity changed');
  const matches = Application('System Events').applicationProcesses.whose({ unixId: pid })();
  if (matches.length !== 1) throw new Error('process unavailable');
  const target = matches[0];
  ${statement}
  return JSON.stringify({ success: true });
}`
}

function invalid(): never {
  throw new TypeError('PLUGIN_WINDOW_MANAGER_INVALID')
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

function snapshotArray(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) invalid()
  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    invalid()
  }
  const lengthDescriptor = descriptors.length
  const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1
  if (!Number.isSafeInteger(length) || Number(length) < 0 || Number(length) > maximum) invalid()
  const allowedKeys = new Set<PropertyKey>(['length'])
  const output: unknown[] = []
  for (let index = 0; index < Number(length); index += 1) {
    const key = String(index)
    allowedKeys.add(key)
    const descriptor = descriptors[key]
    if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
    output.push(descriptor.value)
  }
  if (Reflect.ownKeys(descriptors).some((key) => !allowedKeys.has(key))) invalid()
  return output
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

function dataMethod<T extends (...args: never[]) => unknown>(value: unknown, key: string): T {
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) invalid()
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key)
  } catch {
    invalid()
  }
  if (!descriptor?.enumerable || !('value' in descriptor)) invalid()
  const method = descriptor.value
  if (typeof method !== 'function' || utilTypes.isProxy(method)) invalid()
  return method as T
}

function isAction(value: unknown): value is PluginWindowManagerActionId {
  return (
    typeof value === 'string' &&
    PLUGIN_WINDOW_MANAGER_ACTION_IDS.includes(value as PluginWindowManagerActionId)
  )
}

function validateToken(value: unknown): string {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) invalid()
  return value
}

function validateRequest(value: unknown): WindowManagerRequest {
  const record = exactRecord(value, ['operation', 'action', 'token'], ['operation'])
  if (
    record.operation === 'list' &&
    !Object.hasOwn(record, 'action') &&
    !Object.hasOwn(record, 'token')
  ) {
    return Object.freeze({ operation: 'list' })
  }
  if (
    record.operation === 'act' &&
    Object.hasOwn(record, 'action') &&
    Object.hasOwn(record, 'token') &&
    isAction(record.action)
  ) {
    return Object.freeze({
      operation: 'act',
      action: record.action,
      token: validateToken(record.token)
    })
  }
  invalid()
}

function snapshotString(value: unknown, maxChars: number, maxBytes: number): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maxChars ||
    Buffer.byteLength(value, 'utf8') > maxBytes ||
    /[\0\r\n]/.test(value)
  ) {
    invalid()
  }
  return value
}

function snapshotDisplayActions(
  value: unknown,
  allowed: readonly PluginWindowManagerActionId[]
): readonly PluginWindowManagerActionId[] {
  const entries = snapshotArray(value, allowed.length)
  if (entries.length !== allowed.length) invalid()
  const actions = entries.map((entry) => {
    if (!isAction(entry)) invalid()
    return entry
  })
  if (actions.some((entry, index) => entry !== allowed[index])) invalid()
  return Object.freeze(actions)
}

function snapshotDisplayItem(
  value: unknown,
  platform: 'win32' | 'darwin'
): WindowManagerDisplayItem {
  const record = exactRecord(
    value,
    ['kind', 'token', 'name', 'title', 'isFront', 'topmost', 'running', 'actions'],
    ['kind', 'token', 'name', 'actions']
  )
  const token = validateToken(record.token)
  const name = snapshotString(record.name, 128, 512)
  if (
    record.kind === 'window' &&
    typeof record.isFront === 'boolean' &&
    typeof record.topmost === 'boolean' &&
    !Object.hasOwn(record, 'running')
  ) {
    return Object.freeze({
      kind: 'window',
      token,
      name,
      title: snapshotString(record.title, 256, 1024),
      isFront: record.isFront,
      topmost: record.topmost,
      actions: snapshotDisplayActions(
        record.actions,
        platform === 'darwin' ? MAC_WINDOW_ACTIONS : WINDOWS_ACTIONS
      )
    })
  }
  if (
    record.kind === 'app' &&
    record.running === true &&
    !Object.hasOwn(record, 'title') &&
    !Object.hasOwn(record, 'isFront') &&
    !Object.hasOwn(record, 'topmost')
  ) {
    const actions = snapshotDisplayActions(record.actions, APP_ACTIONS)
    return Object.freeze({
      kind: 'app',
      token,
      name,
      running: true,
      actions: actions as ['launch']
    })
  }
  invalid()
}

function validateResult(value: unknown): WindowManagerResult {
  const record = exactRecord(
    value,
    ['operation', 'action', 'status', 'platform', 'items', 'reason'],
    ['operation', 'status']
  )
  if (record.operation === 'list') {
    if (
      record.status === 'available' &&
      (record.platform === 'win32' || record.platform === 'darwin') &&
      !Object.hasOwn(record, 'action') &&
      !Object.hasOwn(record, 'reason')
    ) {
      const resultPlatform = record.platform
      const items = Object.freeze(
        snapshotArray(
          record.items,
          PLUGIN_WINDOW_MANAGER_MAX_WINDOWS + PLUGIN_WINDOW_MANAGER_MAX_APPS
        ).map((item) => snapshotDisplayItem(item, resultPlatform))
      )
      return Object.freeze({
        operation: 'list',
        status: 'available',
        platform: resultPlatform,
        items
      })
    }
    if (
      record.status === 'blocked' &&
      record.reason === 'platform-unsupported' &&
      !Object.hasOwn(record, 'action') &&
      !Object.hasOwn(record, 'platform') &&
      !Object.hasOwn(record, 'items')
    ) {
      return Object.freeze({ operation: 'list', status: 'blocked', reason: 'platform-unsupported' })
    }
    if (
      record.status === 'failed' &&
      record.reason === 'list-failed' &&
      !Object.hasOwn(record, 'action') &&
      !Object.hasOwn(record, 'platform') &&
      !Object.hasOwn(record, 'items')
    ) {
      return Object.freeze({ operation: 'list', status: 'failed', reason: 'list-failed' })
    }
    invalid()
  }
  if (record.operation !== 'act' || !isAction(record.action)) invalid()
  if (
    record.status === 'completed' &&
    !Object.hasOwn(record, 'platform') &&
    !Object.hasOwn(record, 'items') &&
    !Object.hasOwn(record, 'reason')
  ) {
    return Object.freeze({ operation: 'act', action: record.action, status: 'completed' })
  }
  const blockedReasons = new Set([
    'token-invalid',
    'token-expired',
    'token-replayed',
    'native-replaced',
    'action-unsupported',
    'platform-unsupported'
  ])
  if (
    record.status === 'blocked' &&
    typeof record.reason === 'string' &&
    blockedReasons.has(record.reason) &&
    !Object.hasOwn(record, 'platform') &&
    !Object.hasOwn(record, 'items')
  ) {
    return Object.freeze({
      operation: 'act',
      action: record.action,
      status: 'blocked',
      reason: record.reason
    }) as WindowManagerResult
  }
  if (
    record.status === 'failed' &&
    record.reason === 'action-failed' &&
    !Object.hasOwn(record, 'platform') &&
    !Object.hasOwn(record, 'items')
  ) {
    return Object.freeze({
      operation: 'act',
      action: record.action,
      status: 'failed',
      reason: 'action-failed'
    })
  }
  invalid()
}

function safeNativeId(value: unknown): string {
  return snapshotString(value, 128, 512)
}

function safeWindowNativeId(value: unknown, platform: NodeJS.Platform, pid: number): string {
  const nativeId = safeNativeId(value)
  if (platform === 'win32') {
    if (!/^[1-9][0-9]{0,19}$/.test(nativeId)) invalid()
    try {
      if (BigInt(nativeId) > 18_446_744_073_709_551_615n) invalid()
    } catch {
      invalid()
    }
    return nativeId
  }
  if (platform === 'darwin' && nativeId === String(pid)) return nativeId
  invalid()
}

function safeStartTime(value: unknown): string {
  return snapshotString(value, 512, 2048)
}

function safePid(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2_147_483_647) invalid()
  return Number(value)
}

function safeAppPath(value: unknown, platform: NodeJS.Platform, optional = false): string | null {
  if (optional && (value === null || value === '')) return null
  const target = snapshotString(value, 1024, 4096)
  if (platform === 'win32') {
    if (
      !path.win32.isAbsolute(target) ||
      path.win32.normalize(target) !== target ||
      !/\.exe$/i.test(target) ||
      /["'<>|\0\r\n]/.test(target)
    ) {
      invalid()
    }
    return target
  }
  if (platform === 'darwin') {
    const normalized = path.posix.normalize(target)
    if (
      normalized !== target ||
      !path.posix.isAbsolute(target) ||
      !/\.app(?:\/.*)?$/i.test(target) ||
      (!target.startsWith('/Applications/') && !target.startsWith('/System/Applications/'))
    ) {
      invalid()
    }
    const appIndex = target.toLowerCase().indexOf('.app')
    return target.slice(0, appIndex + 4)
  }
  invalid()
}

function trustTarget<T extends NativeTarget>(target: T): T {
  TRUSTED_TARGETS.add(target)
  return target
}

function snapshotNativeWindow(value: unknown, platform: NodeJS.Platform): NativeWindowTarget {
  const record = exactRecord(value, [
    'name',
    'title',
    'pid',
    'nativeId',
    'startTime',
    'appPath',
    'topmost',
    'isFront'
  ])
  if (typeof record.topmost !== 'boolean' || typeof record.isFront !== 'boolean') invalid()
  const pid = safePid(record.pid)
  return trustTarget(
    Object.freeze({
      kind: 'window',
      name: snapshotString(record.name, 128, 512),
      title: snapshotString(record.title, 256, 1024),
      pid,
      nativeId: safeWindowNativeId(record.nativeId, platform, pid),
      startTime: safeStartTime(record.startTime),
      appPath: safeAppPath(record.appPath, platform, true),
      topmost: record.topmost,
      isFront: record.isFront
    })
  )
}

function snapshotNativeApp(value: unknown, platform: NodeJS.Platform): NativeAppTarget {
  const record = exactRecord(value, ['name', 'pid', 'nativeId', 'startTime', 'appPath', 'running'])
  if (record.running !== true) invalid()
  const appPath = safeAppPath(record.appPath, platform)
  if (!appPath) invalid()
  return trustTarget(
    Object.freeze({
      kind: 'app',
      name: snapshotString(record.name, 128, 512),
      pid: safePid(record.pid),
      nativeId: safeNativeId(record.nativeId),
      startTime: safeStartTime(record.startTime),
      appPath,
      running: true
    })
  )
}

function parseInventory(stdout: string, platform: NodeJS.Platform): NativeInventory {
  if (Buffer.byteLength(stdout, 'utf8') > PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES) invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    invalid()
  }
  const record = exactRecord(parsed, ['windows', 'apps'])
  const windowEntries = snapshotArray(record.windows, PLUGIN_WINDOW_MANAGER_MAX_WINDOWS)
  const appEntries = snapshotArray(record.apps, PLUGIN_WINDOW_MANAGER_MAX_APPS)
  const windows = windowEntries.map((entry) => snapshotNativeWindow(entry, platform))
  const apps = appEntries.map((entry) => snapshotNativeApp(entry, platform))
  const windowIds = new Set<string>()
  for (const entry of windows) {
    const key = `${entry.pid}:${entry.nativeId}`
    if (windowIds.has(key)) invalid()
    windowIds.add(key)
  }
  const appIds = new Set<string>()
  for (const entry of apps) {
    const key = `${entry.nativeId}:${entry.appPath}`
    if (appIds.has(key)) invalid()
    appIds.add(key)
  }
  return Object.freeze({ windows: Object.freeze(windows), apps: Object.freeze(apps) })
}

function parseAction(stdout: string): void {
  if (Buffer.byteLength(stdout, 'utf8') > PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES) invalid()
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    invalid()
  }
  const record = exactRecord(parsed, ['success'])
  if (record.success !== true) invalid()
}

function snapshotProcessShape(value: unknown): PluginWindowManagerProcess {
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
  const started = record.started as PluginWindowManagerProcess['started']
  const wait = record.wait as PluginWindowManagerProcess['wait']
  const kill = record.kill as PluginWindowManagerProcess['kill']
  return Object.freeze({
    started: () => started.call(value),
    wait: () => wait.call(value),
    kill: () => kill.call(value)
  })
}

function trustProcess(value: unknown): PluginWindowManagerProcess {
  const process = snapshotProcessShape(value)
  TRUSTED_PROCESSES.add(process)
  return process
}

function snapshotProcess(value: unknown): PluginWindowManagerProcess {
  if (!value || typeof value !== 'object' || !TRUSTED_PROCESSES.has(value)) invalid()
  return value as PluginWindowManagerProcess
}

function snapshotExit(value: unknown): PluginWindowManagerProcessExit {
  const record = exactRecord(value, ['code', 'stdout'])
  if (
    (record.code !== null && !Number.isSafeInteger(record.code)) ||
    typeof record.stdout !== 'string' ||
    Buffer.byteLength(record.stdout, 'utf8') > PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES
  ) {
    invalid()
  }
  return Object.freeze({
    code: record.code === null ? null : Number(record.code),
    stdout: record.stdout
  })
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
  const parsed = path.win32.parse(value)
  if (
    !/^[A-Za-z]:\\/.test(value) ||
    parsed.root.length !== 3 ||
    path.win32.relative(parsed.root, value).toLowerCase() !== 'windows'
  ) {
    invalid()
  }
  return value
}

function fixedSpawnOptions(
  cwd: string,
  env: Readonly<Record<string, string>>
): PluginWindowManagerSpawnOptions {
  return Object.freeze({
    cwd,
    env,
    shell: false,
    stdio: Object.freeze(['ignore', 'pipe', 'ignore']) as readonly ['ignore', 'pipe', 'ignore'],
    windowsHide: true
  })
}

export function createFixedPluginWindowManagerService(
  rawOptions: FixedPluginWindowManagerServiceOptions
): TrustedPluginWindowManagerService {
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
  const spawn = options.spawn as FixedPluginWindowManagerServiceOptions['spawn']
  const windowsExecutableDirectory = path.win32.join(
    windowsDirectory,
    'System32',
    'WindowsPowerShell',
    'v1.0'
  )
  const windowsExecutable = path.win32.join(windowsExecutableDirectory, 'powershell.exe')
  const windowsEnvironment = Object.freeze({
    SystemRoot: windowsDirectory,
    WINDIR: windowsDirectory
  })
  const macExecutable = '/usr/bin/osascript'
  const macEnvironment = Object.freeze({ PATH: '/usr/bin:/bin' })

  const start = (
    executable: string,
    args: readonly string[],
    cwd: string,
    env: Readonly<Record<string, string>>
  ) =>
    trustProcess(
      spawn.call(rawOptions, executable, Object.freeze([...args]), fixedSpawnOptions(cwd, env))
    )

  const service = Object.freeze({
    platform,
    startList(): PluginWindowManagerProcess {
      if (platform === 'win32') {
        return start(
          windowsExecutable,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            WINDOWS_LIST_SCRIPT
          ],
          windowsExecutableDirectory,
          windowsEnvironment
        )
      }
      if (platform === 'darwin') {
        return start(
          macExecutable,
          ['-l', 'JavaScript', '-e', MAC_LIST_SCRIPT],
          '/usr/bin',
          macEnvironment
        )
      }
      invalid()
    },
    startAction(
      action: PluginWindowManagerActionId,
      rawTarget: NativeTarget
    ): PluginWindowManagerProcess {
      if (
        !isAction(action) ||
        !rawTarget ||
        typeof rawTarget !== 'object' ||
        !TRUSTED_TARGETS.has(rawTarget)
      )
        invalid()
      const target = rawTarget
      if (target.kind === 'app' && action !== 'launch') invalid()
      if (target.kind === 'window' && action === 'launch') invalid()
      if (platform === 'win32') {
        const script = windowsActionScript(action)
        const argumentsAfterScript =
          action === 'launch'
            ? target.kind === 'app'
              ? [String(target.pid), target.startTime]
              : invalid()
            : target.kind === 'window'
              ? action === 'snap-left'
                ? [target.nativeId, String(target.pid), target.startTime, 'left']
                : action === 'snap-right'
                  ? [target.nativeId, String(target.pid), target.startTime, 'right']
                  : action === 'topmost-toggle'
                    ? [
                        target.nativeId,
                        String(target.pid),
                        target.startTime,
                        target.topmost ? 'normal' : 'topmost'
                      ]
                    : [target.nativeId, String(target.pid), target.startTime]
              : invalid()
        if (argumentsAfterScript.some((entry) => typeof entry !== 'string' || entry.length < 1))
          invalid()
        return start(
          windowsExecutable,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            script,
            ...argumentsAfterScript
          ],
          windowsExecutableDirectory,
          windowsEnvironment
        )
      }
      if (platform === 'darwin') {
        if (target.kind === 'app' && !/^[A-Za-z0-9][A-Za-z0-9.-]{1,254}$/.test(target.nativeId)) {
          invalid()
        }
        if (!MAC_WINDOW_ACTIONS.includes(action) && action !== 'launch') invalid()
        return start(
          macExecutable,
          [
            '-l',
            'JavaScript',
            '-e',
            macActionScript(action),
            String(target.pid),
            target.startTime,
            target.kind === 'app' ? target.nativeId : ''
          ],
          '/usr/bin',
          macEnvironment
        )
      }
      invalid()
    },
    parseInventory(stdout: string): NativeInventory {
      return parseInventory(stdout, platform)
    },
    parseAction(stdout: string): void {
      parseAction(stdout)
    }
  }) as TrustedPluginWindowManagerService
  TRUSTED_SERVICES.add(service)
  return service
}

function sameNativeTarget(left: NativeTarget, right: NativeTarget): boolean {
  return (
    left.kind === right.kind &&
    left.pid === right.pid &&
    left.nativeId === right.nativeId &&
    left.startTime === right.startTime &&
    left.appPath === right.appPath
  )
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

export function createPluginWindowManagerCapabilities(
  rawOptions: PluginWindowManagerCapabilitiesOptions
): PluginWindowManagerCapabilities {
  const options = exactRecord(rawOptions, [
    'activation',
    'platform',
    'resolveCurrentActivation',
    'resolveHostGeneration',
    'authorizeShell',
    'watchShellPermissionRevoked',
    'service'
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
    !options.service ||
    typeof options.service !== 'object' ||
    !TRUSTED_SERVICES.has(options.service)
  ) {
    invalid()
  }
  const expectedActivation = snapshotActivation(options.activation)
  if (expectedActivation.name !== 'touch-window-manager') invalid()
  const platform = options.platform as NodeJS.Platform
  const service = options.service as TrustedPluginWindowManagerService
  if (service.platform !== platform) invalid()
  const startList = dataMethod<TrustedPluginWindowManagerService['startList']>(service, 'startList')
  const startAction = dataMethod<TrustedPluginWindowManagerService['startAction']>(
    service,
    'startAction'
  )
  const parseServiceInventory = dataMethod<TrustedPluginWindowManagerService['parseInventory']>(
    service,
    'parseInventory'
  )
  const parseServiceAction = dataMethod<TrustedPluginWindowManagerService['parseAction']>(
    service,
    'parseAction'
  )
  const resolveCurrentActivation =
    options.resolveCurrentActivation as PluginWindowManagerCapabilitiesOptions['resolveCurrentActivation']
  const resolveHostGeneration =
    options.resolveHostGeneration as PluginWindowManagerCapabilitiesOptions['resolveHostGeneration']
  const authorizeShell =
    options.authorizeShell as PluginWindowManagerCapabilitiesOptions['authorizeShell']
  const watchShellPermissionRevoked =
    options.watchShellPermissionRevoked as PluginWindowManagerCapabilitiesOptions['watchShellPermissionRevoked']
  const owned = new Set<OwnedProcess>()
  const tokens = new Map<string, TokenRecord>()
  const retiredTokens = new Map<string, number>()
  let listEpoch = 0
  let closed = false
  let revoked = false
  let closePromise: Promise<void> | null = null
  let activeOperations = 0
  const operationIdleWaiters = new Set<() => void>()
  let permissionDisposer: (() => void) | null = null
  let permissionWatcherAvailable = true

  const trimRetiredTokens = (): void => {
    while (retiredTokens.size > 1024) {
      const oldest = retiredTokens.keys().next().value
      if (typeof oldest !== 'string') break
      retiredTokens.delete(oldest)
    }
  }
  const retireToken = (token: string): void => {
    retiredTokens.set(token, Date.now())
    trimRetiredTokens()
  }
  const retireAllTokens = (): void => {
    for (const token of tokens.keys()) retireToken(token)
    tokens.clear()
  }
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
      throw new Error('PLUGIN_WINDOW_MANAGER_TEARDOWN_FAILED')
    }
  }

  try {
    const disposer = watchShellPermissionRevoked.call(rawOptions, expectedActivation.name, () => {
      revoked = true
      retireAllTokens()
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
    const current = resolveCurrentActivation.call(rawOptions, identity.pluginName)
    if (
      !current ||
      !sameActivation(snapshotActivation(current), expectedActivation) ||
      resolveHostGeneration.call(rawOptions, expectedActivation) !== identity.hostGeneration
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

  const ownProcess = (process: PluginWindowManagerProcess): OwnedProcess => {
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
      wait,
      terminate(): Promise<void> {
        if (terminatePromise) return terminatePromise
        terminatePromise = Promise.resolve().then(async () => {
          if (!exited) {
            try {
              await process.kill()
            } catch {
              // The native exit event remains the barrier.
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

  const runProcess = async (
    start: () => PluginWindowManagerProcess,
    context: PluginSecurityContext,
    signal: AbortSignal
  ): Promise<string> => {
    assertAdmission(context, signal)
    const finishOperation = beginOperation()
    try {
      let process: PluginWindowManagerProcess
      try {
        process = snapshotProcess(start())
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

  const listNative = async (
    context: PluginSecurityContext,
    signal: AbortSignal
  ): Promise<NativeInventory> => {
    const stdout = await runProcess(() => startList.call(service), context, signal)
    return parseServiceInventory.call(service, stdout)
  }

  const createToken = (target: NativeTarget, epoch: number): string => {
    let token = ''
    do {
      token = `wm_${randomBytes(24).toString('base64url')}`
    } while (tokens.has(token) || retiredTokens.has(token))
    tokens.set(
      token,
      Object.freeze({ epoch, expiresAt: Date.now() + PLUGIN_WINDOW_MANAGER_TOKEN_TTL_MS, target })
    )
    return token
  }

  const consumeToken = (
    token: string
  ): {
    readonly target?: NativeTarget
    readonly reason?: 'token-invalid' | 'token-expired' | 'token-replayed'
  } => {
    if (retiredTokens.has(token)) return Object.freeze({ reason: 'token-replayed' })
    const record = tokens.get(token)
    if (!record) return Object.freeze({ reason: 'token-invalid' })
    tokens.delete(token)
    retireToken(token)
    if (record.epoch !== listEpoch) return Object.freeze({ reason: 'token-replayed' })
    if (Date.now() >= record.expiresAt) return Object.freeze({ reason: 'token-expired' })
    return Object.freeze({ target: record.target })
  }

  const actionsForWindow = (): readonly PluginWindowManagerActionId[] =>
    platform === 'darwin' ? MAC_WINDOW_ACTIONS : WINDOWS_ACTIONS

  const definition: PluginHostCapabilityDefinition = Object.freeze({
    id: 'system.window-manager',
    permission: 'system.shell',
    timeoutMs: PLUGIN_WINDOW_MANAGER_TIMEOUT_MS,
    maxConcurrency: 1,
    callbackLifetime: 'transient',
    callbackFields: Object.freeze([]),
    validateRequest,
    validateResult,
    async invoke(context, request, signal) {
      assertAuthority(context)
      assertSignal(signal)
      if (closed) throw new PluginHostCapabilityError('PLUGIN_HOST_CAPABILITY_CANCELLED')
      const normalized = request as WindowManagerRequest
      if (platform !== 'win32' && platform !== 'darwin') {
        return normalized.operation === 'list'
          ? Object.freeze({ operation: 'list', status: 'blocked', reason: 'platform-unsupported' })
          : Object.freeze({
              operation: 'act',
              action: normalized.action,
              status: 'blocked',
              reason: 'platform-unsupported'
            })
      }

      if (normalized.operation === 'list') {
        listEpoch += 1
        retireAllTokens()
        let inventory: NativeInventory
        try {
          inventory = await listNative(context, signal)
        } catch (error) {
          if (error instanceof PluginHostCapabilityError) throw error
          return Object.freeze({ operation: 'list', status: 'failed', reason: 'list-failed' })
        }
        assertAdmission(context, signal)
        const epoch = listEpoch
        const windowActions = actionsForWindow()
        const items: WindowManagerDisplayItem[] = [
          ...inventory.windows.map((entry) =>
            Object.freeze({
              kind: 'window' as const,
              token: createToken(entry, epoch),
              name: entry.name,
              title: entry.title,
              isFront: entry.isFront,
              topmost: entry.topmost,
              actions: windowActions
            })
          ),
          ...inventory.apps.map((entry) =>
            Object.freeze({
              kind: 'app' as const,
              token: createToken(entry, epoch),
              name: entry.name,
              running: entry.running,
              actions: APP_ACTIONS
            })
          )
        ]
        return Object.freeze({
          operation: 'list',
          status: 'available',
          platform,
          items: Object.freeze(items)
        })
      }

      assertAdmission(context, signal)
      const consumed = consumeToken(normalized.token)
      if (!consumed.target) {
        return Object.freeze({
          operation: 'act',
          action: normalized.action,
          status: 'blocked',
          reason: consumed.reason ?? 'token-invalid'
        })
      }
      const target = consumed.target
      const allowedActions = target.kind === 'app' ? APP_ACTIONS : actionsForWindow()
      if (!allowedActions.includes(normalized.action as never)) {
        return Object.freeze({
          operation: 'act',
          action: normalized.action,
          status: 'blocked',
          reason: 'action-unsupported'
        })
      }

      let inventory: NativeInventory
      try {
        inventory = await listNative(context, signal)
      } catch (error) {
        if (error instanceof PluginHostCapabilityError) throw error
        return Object.freeze({
          operation: 'act',
          action: normalized.action,
          status: 'failed',
          reason: 'action-failed'
        })
      }
      const currentTargets = target.kind === 'window' ? inventory.windows : inventory.apps
      const current = currentTargets.find((entry) => sameNativeTarget(entry, target))
      if (!current) {
        return Object.freeze({
          operation: 'act',
          action: normalized.action,
          status: 'blocked',
          reason: 'native-replaced'
        })
      }
      assertAdmission(context, signal)
      try {
        const stdout = await runProcess(
          () => startAction.call(service, normalized.action, current),
          context,
          signal
        )
        parseServiceAction.call(service, stdout)
        assertAdmission(context, signal)
        return Object.freeze({
          operation: 'act',
          action: normalized.action,
          status: 'completed'
        })
      } catch (error) {
        if (error instanceof PluginHostCapabilityError) throw error
        return Object.freeze({
          operation: 'act',
          action: normalized.action,
          status: 'failed',
          reason: 'action-failed'
        })
      }
    }
  })

  return Object.freeze({
    definitions: Object.freeze([definition]),
    close(): Promise<void> {
      if (closePromise) return closePromise
      closed = true
      retireAllTokens()
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

export function createPluginWindowManagerProcess(child: ChildProcess): PluginWindowManagerProcess {
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
  let resolveExit!: (exit: PluginWindowManagerProcessExit) => void
  let rejectExit!: (error: Error) => void
  const started = new Promise<void>((resolve, reject) => {
    resolveStarted = resolve
    rejectStarted = reject
  })
  const exit = new Promise<PluginWindowManagerProcessExit>((resolve, reject) => {
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
    const error = new Error('PLUGIN_WINDOW_MANAGER_PROCESS_SPAWN_FAILED')
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
      if (child.kill() !== true)
        killRequestError = new Error('PLUGIN_WINDOW_MANAGER_PROCESS_KILL_FAILED')
    } catch {
      killRequestError = new Error('PLUGIN_WINDOW_MANAGER_PROCESS_KILL_FAILED')
    }
  }
  const onStdout = (chunk: unknown): void => {
    if (settled || overflow) return
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    stdoutBytes += bytes.byteLength
    if (stdoutBytes > PLUGIN_WINDOW_MANAGER_MAX_STDOUT_BYTES) {
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
      const error = new Error('PLUGIN_WINDOW_MANAGER_PROCESS_SPAWN_FAILED')
      rejectStarted(error)
      rejectExit(error)
      return
    }
    if (overflow) {
      rejectExit(new Error('PLUGIN_WINDOW_MANAGER_PROCESS_OUTPUT_LIMIT'))
      return
    }
    stdout += stdoutDecoder.end()
    resolveExit(Object.freeze({ code: Number.isSafeInteger(code) ? Number(code) : null, stdout }))
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
