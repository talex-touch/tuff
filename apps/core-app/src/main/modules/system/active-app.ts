import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'
import { app } from 'electron'
import { createLogger } from '../../utils/logger'

const execFileAsync = promisify(execFile)
const activeAppLog = createLogger('ActiveApp')
const MACOS_RESOLVE_RETRY_DELAY_MS = 80
const MACOS_PERMISSION_BACKOFF_MS = 60_000
const ACTIVE_APP_COMMAND_TIMEOUT_MS = 1500

function isEbadfError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const node = error as { code?: unknown; message?: unknown }
  return (
    node.code === 'EBADF' || (typeof node.message === 'string' && node.message.includes('EBADF'))
  )
}

function isMissingCommandError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as { code?: unknown }).code === 'ENOENT'
}

function getErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const candidate = error as { message?: unknown; stderr?: unknown }
  return [candidate.message, candidate.stderr]
    .filter((value) => typeof value === 'string')
    .join('\n')
}

function isMacOSAutomationPermissionError(error: unknown): boolean {
  const text = getErrorText(error)
  if (!text) return false
  return (
    text.includes('(-1743)') ||
    text.includes('errAEEventNotPermitted') ||
    text.includes('Not authorized to send Apple events') ||
    text.includes('未获得授权将Apple事件发送给System Events')
  )
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function parseInteger(value: unknown): number | null {
  const normalized = typeof value === 'string' ? Number.parseInt(value.trim(), 10) : Number.NaN
  return Number.isFinite(normalized) ? normalized : null
}

export async function isActiveAppCapabilityAvailable(
  platform = process.platform
): Promise<boolean> {
  if (platform === 'darwin' || platform === 'win32') {
    return true
  }

  if (platform !== 'linux') {
    return false
  }

  try {
    await execFileAsync('xdotool', ['--version'], {
      timeout: ACTIVE_APP_COMMAND_TIMEOUT_MS
    })
    return true
  } catch (error) {
    if (!isMissingCommandError(error)) {
      activeAppLog.debug('Linux active-app capability probe failed', { error })
    }
    return false
  }
}

// Platform type for consistency
type Platform = 'macos' | 'windows' | 'linux'

// Interface for active window information
export interface ActiveAppInfo {
  identifier: string | null
  displayName: string | null
  bundleId: string | null
  processId: number | null
  executablePath: string | null
  platform: Platform | null
  windowTitle: string | null
  url?: string | null
  icon?: string | null
  lastUpdated: number
}

interface ActiveAppQueryOptions {
  forceRefresh?: boolean
  includeIcon?: boolean
}

interface ActiveAppCacheEntry {
  info: ActiveAppInfo
  expiresAt: number
}

class ActiveAppService {
  private cacheWithIcon: ActiveAppCacheEntry | null = null
  private cacheWithoutIcon: ActiveAppCacheEntry | null = null
  private readonly cacheTTL = 3000
  private currentPlatform: Platform
  private macosResolveInFlight: Promise<Partial<ActiveAppInfo> | null> | null = null
  private macosPermissionBackoffUntil = 0

  constructor() {
    this.currentPlatform = this.detectPlatform()
  }

  private handleMacOSPermissionDenied(error: unknown): null {
    activeAppLog.warn('macOS automation permission missing, active-app lookup suspended briefly', {
      meta: { backoffMs: MACOS_PERMISSION_BACKOFF_MS },
      error
    })
    this.macosPermissionBackoffUntil = Date.now() + MACOS_PERMISSION_BACKOFF_MS
    return null
  }

  private detectPlatform(): Platform {
    switch (process.platform) {
      case 'darwin':
        return 'macos'
      case 'win32':
        return 'windows'
      case 'linux':
        return 'linux'
      default:
        return 'linux'
    }
  }

  /**
   * macOS-specific: Use a single AppleScript call to get all active application info.
   * Previously used 3+ separate osascript/shell invocations which could take 1-3s total.
   */
  private async resolveActiveWindowMacOSOnce(): Promise<Partial<ActiveAppInfo> | null> {
    try {
      const script = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  set appPID to unix id of frontApp
  try
    set appID to bundle identifier of frontApp
  on error
    set appID to ""
  end try
  try
    set winTitle to name of front window of frontApp
  on error
    set winTitle to ""
  end try
  return appName & "||" & appID & "||" & (appPID as text) & "||" & winTitle
end tell`

      const { stdout } = await execFileAsync('osascript', ['-e', script])
      const parts = stdout.trim().split('||')
      const appName = parts[0] ?? ''
      const bundleId = parts[1] || null
      const pid = Number.parseInt(parts[2] ?? '', 10)
      const windowTitle = parts[3] || null

      return {
        displayName: appName || null,
        windowTitle,
        bundleId,
        processId: Number.isFinite(pid) ? pid : null,
        executablePath: null,
        platform: 'macos'
      }
    } catch (error) {
      throw error
    }
  }

  private async resolveActiveWindowMacOS(): Promise<Partial<ActiveAppInfo> | null> {
    if (Date.now() < this.macosPermissionBackoffUntil) {
      return null
    }

    if (this.macosResolveInFlight) {
      return this.macosResolveInFlight
    }

    const resolveTask = (async () => {
      try {
        const result = await this.resolveActiveWindowMacOSOnce()
        this.macosPermissionBackoffUntil = 0
        return result
      } catch (firstError) {
        if (isMacOSAutomationPermissionError(firstError)) {
          return this.handleMacOSPermissionDenied(firstError)
        }

        if (!isEbadfError(firstError)) {
          activeAppLog.error('macOS resolution failed', { error: firstError })
          return null
        }

        activeAppLog.warn('macOS resolution hit EBADF, retrying once', {
          meta: { delayMs: MACOS_RESOLVE_RETRY_DELAY_MS }
        })
        await new Promise<void>((resolve) => {
          setTimeout(resolve, MACOS_RESOLVE_RETRY_DELAY_MS)
        })

        try {
          const result = await this.resolveActiveWindowMacOSOnce()
          this.macosPermissionBackoffUntil = 0
          return result
        } catch (retryError) {
          if (isMacOSAutomationPermissionError(retryError)) {
            return this.handleMacOSPermissionDenied(retryError)
          }

          activeAppLog.error('macOS resolution failed after EBADF retry', { error: retryError })
          return null
        }
      }
    })()

    this.macosResolveInFlight = resolveTask
    try {
      return await resolveTask
    } finally {
      this.macosResolveInFlight = null
    }
  }

  private async resolveActiveWindowWindows(): Promise<Partial<ActiveAppInfo> | null> {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class TuffForegroundWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$handle = [TuffForegroundWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) {
  return ''
}
$processId = 0
[TuffForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$processId) | Out-Null
$titleBuilder = New-Object System.Text.StringBuilder 2048
[TuffForegroundWindow]::GetWindowText($handle, $titleBuilder, $titleBuilder.Capacity) | Out-Null
$windowTitle = $titleBuilder.ToString()
$displayName = ''
$executablePath = ''
try {
  $process = Get-Process -Id $processId -ErrorAction Stop
  $displayName = $process.ProcessName
  try {
    $executablePath = $process.Path
  } catch {
    $executablePath = ''
  }
} catch {}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
@{
  processId = [int]$processId
  displayName = $displayName
  executablePath = $executablePath
  windowTitle = $windowTitle
} | ConvertTo-Json -Compress
`

    try {
      const { stdout } = await execFileAsync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { timeout: ACTIVE_APP_COMMAND_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }
      )
      const normalized = stdout.trim()
      if (!normalized) {
        return null
      }

      const parsed = JSON.parse(normalized) as {
        processId?: number
        displayName?: string
        executablePath?: string
        windowTitle?: string
      }

      return {
        displayName: toOptionalString(parsed.displayName),
        windowTitle: toOptionalString(parsed.windowTitle),
        processId: typeof parsed.processId === 'number' ? parsed.processId : null,
        executablePath: toOptionalString(parsed.executablePath),
        platform: 'windows'
      }
    } catch (error) {
      if (!isMissingCommandError(error)) {
        activeAppLog.warn('Windows active-app resolution failed', { error })
      }
      return null
    }
  }

  private async resolveActiveWindowLinux(): Promise<Partial<ActiveAppInfo> | null> {
    try {
      const { stdout: windowIdOutput } = await execFileAsync('xdotool', ['getactivewindow'], {
        timeout: ACTIVE_APP_COMMAND_TIMEOUT_MS
      })
      const windowId = toOptionalString(windowIdOutput)
      if (!windowId) {
        return null
      }

      const { stdout: pidOutput } = await execFileAsync('xdotool', ['getwindowpid', windowId], {
        timeout: ACTIVE_APP_COMMAND_TIMEOUT_MS
      })
      const processId = parseInteger(pidOutput)
      if (!processId) {
        return null
      }

      let windowTitle: string | null = null
      try {
        const { stdout } = await execFileAsync('xdotool', ['getwindowname', windowId], {
          timeout: ACTIVE_APP_COMMAND_TIMEOUT_MS
        })
        windowTitle = toOptionalString(stdout)
      } catch (error) {
        if (!isMissingCommandError(error)) {
          activeAppLog.debug('Linux active-app window title lookup failed', { error })
        }
      }

      let displayName: string | null = null
      try {
        const { stdout } = await execFileAsync('ps', ['-p', String(processId), '-o', 'comm='], {
          timeout: ACTIVE_APP_COMMAND_TIMEOUT_MS
        })
        displayName = toOptionalString(stdout)
      } catch (error) {
        activeAppLog.debug('Linux active-app process lookup failed', { error })
      }

      let executablePath: string | null = null
      try {
        executablePath = toOptionalString(await fs.readlink(`/proc/${processId}/exe`))
      } catch (error) {
        activeAppLog.debug('Linux active-app executable lookup failed', { error })
      }

      if (!displayName && executablePath) {
        displayName = path.basename(executablePath)
      }

      return {
        displayName,
        windowTitle,
        processId,
        executablePath,
        platform: 'linux'
      }
    } catch (error) {
      if (!isMissingCommandError(error)) {
        activeAppLog.warn('Linux active-app resolution failed', { error })
      }
      return null
    }
  }

  /**
   * Main resolver: uses withOSAdapter to call platform-specific methods
   * Currently only macOS is implemented
   */
  private async resolveActiveWindow(): Promise<Partial<ActiveAppInfo> | null> {
    const result = await withOSAdapter<void, Promise<Partial<ActiveAppInfo> | null>>({
      darwin: async () => {
        return await this.resolveActiveWindowMacOS()
      },
      win32: async () => {
        return await this.resolveActiveWindowWindows()
      },
      linux: async () => {
        return await this.resolveActiveWindowLinux()
      }
    })

    return result ?? null
  }

  /**
   * Get application icon from executable path
   */
  private async resolveIcon(appPath: string | null): Promise<string | null> {
    if (!appPath) return null
    try {
      const icon = await app.getFileIcon(appPath, { size: 'small' })
      if (!icon || icon.isEmpty()) return null
      return icon.toDataURL()
    } catch (error) {
      activeAppLog.debug('Unable to read app icon', { error })
      return null
    }
  }

  private toCacheKey(includeIcon: boolean): 'withIcon' | 'withoutIcon' {
    return includeIcon ? 'withIcon' : 'withoutIcon'
  }

  private cloneWithoutIcon(info: ActiveAppInfo): ActiveAppInfo {
    if (!info.icon) {
      return info
    }
    return {
      ...info,
      icon: null
    }
  }

  private getCacheEntry(includeIcon: boolean): ActiveAppCacheEntry | null {
    const cache = includeIcon ? this.cacheWithIcon : this.cacheWithoutIcon
    if (cache && cache.expiresAt > Date.now()) {
      return cache
    }

    if (includeIcon) {
      this.cacheWithIcon = null
    } else {
      this.cacheWithoutIcon = null
    }
    return null
  }

  private setCacheEntry(info: ActiveAppInfo, includeIcon: boolean): void {
    const expiresAt = Date.now() + this.cacheTTL
    if (includeIcon) {
      this.cacheWithIcon = { info, expiresAt }
      this.cacheWithoutIcon = { info: this.cloneWithoutIcon(info), expiresAt }
      return
    }

    this.cacheWithoutIcon = { info: this.cloneWithoutIcon(info), expiresAt }
  }

  private normalizeQueryOptions(
    forceRefreshOrOptions: boolean | ActiveAppQueryOptions
  ): Required<ActiveAppQueryOptions> {
    if (typeof forceRefreshOrOptions === 'boolean') {
      return {
        forceRefresh: forceRefreshOrOptions,
        includeIcon: true
      }
    }

    return {
      forceRefresh: forceRefreshOrOptions.forceRefresh === true,
      includeIcon: forceRefreshOrOptions.includeIcon !== false
    }
  }

  /**
   * Public API: Get active application information
   */
  public async getActiveApp(
    forceRefreshOrOptions: boolean | ActiveAppQueryOptions = false
  ): Promise<ActiveAppInfo | null> {
    const { forceRefresh, includeIcon } = this.normalizeQueryOptions(forceRefreshOrOptions)
    const cacheKey = this.toCacheKey(includeIcon)

    // Return cached data if available and not expired
    if (!forceRefresh) {
      const cached = this.getCacheEntry(includeIcon)
      if (cached) {
        return cached.info
      }

      if (!includeIcon) {
        const iconCache = this.getCacheEntry(true)
        if (iconCache) {
          const normalized = this.cloneWithoutIcon(iconCache.info)
          this.setCacheEntry(normalized, false)
          return normalized
        }
      }
    }

    // Resolve active window information
    const activeWindow = await this.resolveActiveWindow()
    if (!activeWindow) {
      this.cacheWithIcon = null
      this.cacheWithoutIcon = null
      return null
    }

    // Build the complete info object
    const info: ActiveAppInfo = {
      identifier:
        activeWindow.identifier || activeWindow.executablePath || activeWindow.displayName || null,
      displayName: activeWindow.displayName || null,
      bundleId: activeWindow.bundleId || null,
      executablePath: activeWindow.executablePath || null,
      processId: activeWindow.processId || null,
      platform: activeWindow.platform || this.currentPlatform,
      windowTitle: activeWindow.windowTitle || null,
      url: activeWindow.url || null,
      icon: null,
      lastUpdated: Date.now()
    }

    if (includeIcon) {
      // Try to get application icon only when caller explicitly needs it.
      info.icon = await this.resolveIcon(info.executablePath)
    }

    // Cache the result
    this.setCacheEntry(info, includeIcon)

    if (cacheKey === 'withoutIcon') {
      return this.cloneWithoutIcon(info)
    }
    return info
  }
}

export const activeAppService = new ActiveAppService()
