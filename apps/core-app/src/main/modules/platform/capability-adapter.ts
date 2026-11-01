import type { PlatformCapability, PlatformCapabilitySupportLevel } from '@talex-touch/utils'
import type { EverythingStatusResponse } from '../../../shared/events/everything'
import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { everythingProvider } from '../box-tool/addon/files/everything-provider'
import { isXdotoolAvailable } from '../system/linux-desktop-tools'
import { t } from '../../utils/i18n-helper'

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
    push('tuff.cmd')
    push('tuff.exe')
    push('tuff')
  } else {
    push('tuff')
  }

  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    push(
      path.resolve(
        process.cwd(),
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tuff.cmd' : 'tuff'
      )
    )
    push(process.execPath, [path.resolve(process.cwd(), 'packages', 'tuff-cli', 'bin', 'tuff.js')])
  }

  return entries
}

const TUFF_CLI_PROBE_CANDIDATES = buildTuffCliProbeCommands()

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

/*
 * Reasons and limitations are read from the renderer catalogs when a patch is built, so the
 * capability list a page asks for next is in the interface language. Issue codes stay as they are.
 */

function unsupportedOnPlatform(): PlatformCapabilityRuntimePatch {
  const reason = t('settings.settingPlatformCapabilities.issues.platformUnsupported', {
    platform: process.platform
  })
  return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
}

function xdotoolMissing(): PlatformCapabilityRuntimePatch {
  const reason = t('settings.settingPlatformCapabilities.issues.xdotoolMissing')
  return withLimitations('unsupported', reason, 'XDTOOL_MISSING', [reason])
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
      t('settings.settingPlatformCapabilities.items.activeApp.automationReason'),
      'AUTOMATION_PERMISSION',
      [t('settings.settingPlatformCapabilities.items.activeApp.automationLimit')]
    )
  }

  if (process.platform === 'win32') {
    return withLimitations(
      'best_effort',
      t('settings.settingPlatformCapabilities.items.activeApp.powershellReason'),
      'POWERSHELL_FOREGROUND_WINDOW',
      [t('settings.settingPlatformCapabilities.items.activeApp.powershellLimit')]
    )
  }

  if (process.platform === 'linux') {
    const available = await isXdotoolAvailable()
    if (available) {
      return withLimitations(
        'best_effort',
        t('settings.settingPlatformCapabilities.items.activeApp.xdotoolReason'),
        'XDTOOL_DEPENDENCY',
        [t('settings.settingPlatformCapabilities.items.activeApp.xdotoolLimit')]
      )
    }

    return xdotoolMissing()
  }

  return unsupportedOnPlatform()
}

export async function getSelectionCaptureCapabilityPatch(options?: {
  enabled?: boolean
}): Promise<PlatformCapabilityRuntimePatch> {
  if (options?.enabled === false) {
    const reason =
      process.platform === 'darwin'
        ? t('settings.settingPlatformCapabilities.items.selectionCapture.accessibilityRequired')
        : t('settings.settingPlatformCapabilities.items.selectionCapture.disabled')
    return withLimitations('unsupported', reason, 'DISABLED', [reason])
  }

  if (process.platform === 'darwin') {
    return withLimitations('supported')
  }

  if (process.platform === 'win32') {
    return withLimitations(
      'best_effort',
      t('settings.settingPlatformCapabilities.items.selectionCapture.simulatedCopyReason'),
      'SIMULATED_COPY',
      [t('settings.settingPlatformCapabilities.items.selectionCapture.simulatedCopyLimit')]
    )
  }

  if (process.platform === 'linux') {
    const available = await isXdotoolAvailable()
    if (!available) {
      return xdotoolMissing()
    }

    return withLimitations(
      'best_effort',
      t('settings.settingPlatformCapabilities.items.selectionCapture.xdotoolReason'),
      'SIMULATED_COPY',
      [t('settings.settingPlatformCapabilities.items.selectionCapture.xdotoolLimit')]
    )
  }

  return unsupportedOnPlatform()
}

export async function getAutoPasteCapabilityPatch(): Promise<PlatformCapabilityRuntimePatch> {
  if (process.platform === 'linux') {
    const available = await isXdotoolAvailable()
    if (!available) {
      return xdotoolMissing()
    }
  }

  if (
    process.platform === 'darwin' ||
    process.platform === 'win32' ||
    process.platform === 'linux'
  ) {
    return withLimitations(
      'best_effort',
      t('settings.settingPlatformCapabilities.items.autoPaste.simulatedPasteReason'),
      'SIMULATED_PASTE',
      [t('settings.settingPlatformCapabilities.items.autoPaste.simulatedPasteLimit')]
    )
  }

  return unsupportedOnPlatform()
}

export function getNativeShareCapabilityPatch(): PlatformCapabilityRuntimePatch {
  if (process.platform === 'darwin') {
    return withLimitations('supported')
  }

  const reason =
    process.platform === 'win32' || process.platform === 'linux'
      ? t('settings.settingPlatformCapabilities.items.nativeShare.mailOnly')
      : t('settings.settingPlatformCapabilities.items.nativeShare.unavailable')
  return withLimitations('unsupported', reason, 'MAIL_ONLY', [reason])
}

export function getPermissionDeepLinkCapabilityPatch(): PlatformCapabilityRuntimePatch {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return withLimitations('supported')
  }

  if (process.platform === 'linux') {
    return withLimitations(
      'best_effort',
      t('settings.settingPlatformCapabilities.items.permissionDeepLink.desktopEnvReason'),
      'DESKTOP_ENV',
      [t('settings.settingPlatformCapabilities.items.permissionDeepLink.desktopEnvLimit')]
    )
  }

  return unsupportedOnPlatform()
}

function getEverythingCapabilityPatchFromStatus(
  status: EverythingStatusResponse
): PlatformCapabilityRuntimePatch {
  if (process.platform !== 'win32') {
    const reason = t('settings.settingEverything.healthReasonUnsupported')
    return withLimitations('unsupported', reason, 'PLATFORM_UNSUPPORTED', [reason])
  }

  if (status.enabled && status.available) {
    return withLimitations('supported')
  }

  // Worded from the state, as the Everything settings page words it. Main's health reason is the
  // raw backend error when the backend failed; the settings page lists it under its error details.
  const reason = status.enabled
    ? t('settings.settingEverything.healthReasonNotReady')
    : t('settings.settingEverything.healthReasonDisabled')
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

  for (const candidate of TUFF_CLI_PROBE_CANDIDATES) {
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

  const reason = t('settings.settingPlatformCapabilities.items.tuffCli.notFound')
  return withLimitations('unsupported', reason, 'CLI_NOT_FOUND', [reason])
}
