import type { PlatformCapability, PlatformCapabilitySupportLevel } from '@talex-touch/utils'
import type { EverythingStatusResponse } from '../../../shared/events/everything'
import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { everythingProvider } from '../box-tool/addon/files/everything-provider'
import { getXdotoolUnavailableReason, isXdotoolAvailable } from '../system/linux-desktop-tools'

const execFileAsync = promisify(execFile)
const TUFF_CLI_DETECT_CACHE_TTL_MS = 60_000
const TUFF_CLI_DETECT_TIMEOUT_MS = 1_500

interface TuffCliProbeCommand {
  command: string
  args: string[]
}

export interface PlatformCapabilityRuntimePatch {
  supportLevel: PlatformCapabilitySupportLevel
  issueCode?: string
  reason?: string
  limitations?: string[]
}

let tuffCliDetectionCache: { available: boolean; checkedAt: number } | null = null

function buildTuffCliProbeCommands(): TuffCliProbeCommand[] {
  const entries: TuffCliProbeCommand[] = []
  const seen = new Set<string>()

  const push = (command: string, args: string[] = []) => {
    const key = JSON.stringify([command, args])
    if (seen.has(key)) return
    seen.add(key)
    entries.push({ command, args })
  }

  if (process.platform === 'win32') {
    push('tuffcli.cmd')
    push('tuffcli.exe')
    push('tuffcli')
  } else {
    push('tuffcli')
  }

  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    push(
      path.resolve(
        process.cwd(),
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tuffcli.cmd' : 'tuffcli'
      )
    )
    push(process.execPath, [
      path.resolve(process.cwd(), 'packages', 'tuff-cli', 'bin', 'tuffcli.js')
    ])
  }

  return entries
}

const TUFF_CLI_COMMAND_CANDIDATES = buildTuffCliProbeCommands()

function withLimitations(
  supportLevel: PlatformCapabilitySupportLevel,
  reason?: string,
  issueCode?: string,
  limitations?: string[]
): PlatformCapabilityRuntimePatch {
  return {
    supportLevel,
    ...(issueCode ? { issueCode } : {}),
    ...(reason ? { reason } : {}),
    ...(limitations && limitations.length > 0 ? { limitations } : {})
  }
}

export function applyCapabilityRuntimePatch(
  capability: PlatformCapability,
  patch?: PlatformCapabilityRuntimePatch | null
): PlatformCapability {
  if (!patch) {
    return {
      ...capability,
      supportLevel: capability.supportLevel ?? 'supported',
      limitations: capability.limitations ? [...capability.limitations] : undefined
    }
  }

  return {
    ...capability,
    supportLevel: patch.supportLevel,
    issueCode: patch.issueCode,
    reason: patch.reason,
    limitations:
      patch.limitations && patch.limitations.length > 0 ? [...patch.limitations] : undefined
  }
}

export async function getActiveAppCapabilityPatch(): Promise<PlatformCapabilityRuntimePatch> {
  if (process.platform === 'darwin') {
    return withLimitations(
      'best_effort',
      'Foreground application inspection depends on macOS Automation permission.',
      'AUTOMATION_PERMISSION',
      [
        'Requires Automation permission for System Events and may return empty during permission backoff.'
      ]
    )
  }

  if (process.platform === 'win32') {
    return withLimitations(
      'best_effort',
      'Foreground application inspection depends on PowerShell and Win32 foreground-window APIs.',
      'POWERSHELL_FOREGROUND_WINDOW',
      ['Requires PowerShell availability and access to foreground process metadata.']
    )
  }

  if (process.platform === 'linux') {
    const available = await isXdotoolAvailable()
    if (available) {
      return withLimitations(
        'best_effort',
        'Linux foreground app inspection depends on desktop automation tooling.',
        'XDTOOL_DEPENDENCY',
        ['Requires xdotool and a compatible desktop session.']
      )
    }

    const reason = getXdotoolUnavailableReason()
    return withLimitations('unsupported', reason, 'XDTOOL_MISSING', [reason])
  }

  const reason = `Foreground application inspection is unsupported on platform: ${process.platform}`
  return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
}

export async function getSelectionCaptureCapabilityPatch(options?: {
  enabled?: boolean
}): Promise<PlatformCapabilityRuntimePatch> {
  if (options?.enabled === false) {
    const reason =
      process.platform === 'darwin'
        ? 'Selection capture requires macOS Accessibility permission.'
        : 'Selection capture is disabled in the current runtime.'
    return withLimitations('unsupported', reason, 'DISABLED', [reason])
  }

  if (process.platform === 'darwin') {
    return withLimitations('supported')
  }

  if (process.platform === 'win32') {
    return withLimitations(
      'best_effort',
      'Selection capture depends on the active app accepting simulated Ctrl+C.',
      'SIMULATED_COPY',
      ['Selected text is captured through simulated Ctrl+C and clipboard timing.']
    )
  }

  if (process.platform === 'linux') {
    const available = await isXdotoolAvailable()
    if (!available) {
      const reason = getXdotoolUnavailableReason()
      return withLimitations('unsupported', reason, 'XDTOOL_MISSING', [reason])
    }

    return withLimitations(
      'best_effort',
      'Selection capture depends on xdotool desktop automation and clipboard timing.',
      'SIMULATED_COPY',
      ['Requires xdotool and a focused app that accepts Ctrl+C.']
    )
  }

  const reason = `Selection capture is unsupported on platform: ${process.platform}`
  return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
}

export async function getAutoPasteCapabilityPatch(): Promise<PlatformCapabilityRuntimePatch> {
  if (process.platform === 'linux') {
    const available = await isXdotoolAvailable()
    if (!available) {
      const reason = getXdotoolUnavailableReason()
      return withLimitations('unsupported', reason, 'XDTOOL_MISSING', [reason])
    }
  }

  if (
    process.platform === 'darwin' ||
    process.platform === 'win32' ||
    process.platform === 'linux'
  ) {
    return withLimitations(
      'best_effort',
      'Auto paste depends on focused-window keyboard automation.',
      'SIMULATED_PASTE',
      ['The target app must keep focus and accept the simulated paste shortcut.']
    )
  }

  const reason = `Auto paste is unsupported on platform: ${process.platform}`
  return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
}

export function getNativeShareCapabilityPatch(): PlatformCapabilityRuntimePatch {
  if (process.platform === 'darwin') {
    return withLimitations('supported')
  }

  const reason =
    process.platform === 'win32' || process.platform === 'linux'
      ? 'Native system share is unavailable on this platform; explicit mail target remains available.'
      : 'Native share is unavailable on the current platform.'
  return withLimitations('unsupported', reason, 'MAIL_ONLY', [reason])
}

export function getPermissionDeepLinkCapabilityPatch(): PlatformCapabilityRuntimePatch {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return withLimitations('supported')
  }

  if (process.platform === 'linux') {
    return withLimitations(
      'best_effort',
      'Permission deep-links depend on the current Linux desktop environment.',
      'DESKTOP_ENV',
      ['Launcher availability varies across desktop environments.']
    )
  }

  const reason = `Permission deep-link is unsupported on platform: ${process.platform}`
  return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
}

function getEverythingCapabilityPatchFromStatus(
  status: EverythingStatusResponse
): PlatformCapabilityRuntimePatch {
  if (process.platform !== 'win32') {
    const reason = 'Everything file search is only available on Windows.'
    return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
  }

  if (status.enabled && status.available) {
    return withLimitations('supported')
  }

  const reason =
    status.healthReason ||
    status.error ||
    'Windows file search is unavailable because the Everything backend is not ready.'
  return withLimitations('unsupported', reason, status.errorCode || 'EVERYTHING_UNAVAILABLE', [
    reason
  ])
}

export function getEverythingCapabilityPatch(): PlatformCapabilityRuntimePatch {
  return getEverythingCapabilityPatchFromStatus(everythingProvider.getStatusSnapshot())
}

export async function detectTuffCliAvailability(): Promise<boolean> {
  const now = Date.now()
  if (
    tuffCliDetectionCache &&
    now - tuffCliDetectionCache.checkedAt <= TUFF_CLI_DETECT_CACHE_TTL_MS
  ) {
    return tuffCliDetectionCache.available
  }

  for (const candidate of TUFF_CLI_COMMAND_CANDIDATES) {
    try {
      await execFileAsync(candidate.command, [...candidate.args, '--version'], {
        timeout: TUFF_CLI_DETECT_TIMEOUT_MS,
        windowsHide: true
      })
      tuffCliDetectionCache = { available: true, checkedAt: now }
      return true
    } catch {
      // best-effort probe
    }
  }

  tuffCliDetectionCache = { available: false, checkedAt: now }
  return false
}

export async function getTuffCliCapabilityPatch(): Promise<PlatformCapabilityRuntimePatch> {
  const available = await detectTuffCliAvailability()
  if (available) {
    return withLimitations('supported')
  }

  const reason = 'CLI binary `tuffcli` was not detected in PATH or known install locations.'
  return withLimitations('unsupported', reason, 'CLI_NOT_FOUND', [reason])
}
