import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'
import { app } from 'electron'
import { createLogger } from '../../utils/logger'

const execFileAsync = promisify(execFile)
const activeAppLog = createLogger('ActiveApp')
const MACOS_RESOLVE_RETRY_DELAY_MS = 80

function isEbadfError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const node = error as { code?: unknown; message?: unknown }
  return (
    node.code === 'EBADF' || (typeof node.message === 'string' && node.message.includes('EBADF'))
  )
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

class ActiveAppService {
  private cache: { info: ActiveAppInfo; expiresAt: number } | null = null
  private readonly cacheTTL = 3000
  private currentPlatform: Platform
  private macosResolveInFlight: Promise<Partial<ActiveAppInfo> | null> | null = null

  constructor() {
    this.currentPlatform = this.detectPlatform()
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
    if (this.macosResolveInFlight) {
      return this.macosResolveInFlight
    }

    const resolveTask = (async () => {
      try {
        return await this.resolveActiveWindowMacOSOnce()
      } catch (firstError) {
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
          return await this.resolveActiveWindowMacOSOnce()
        } catch (retryError) {
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
        // Windows implementation not yet available
        return null
      },
      linux: async () => {
        // Linux implementation not yet available
        return null
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

  /**
   * Public API: Get active application information
   */
  public async getActiveApp(forceRefresh = false): Promise<ActiveAppInfo | null> {
    // Return cached data if available and not expired
    if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.info
    }

    // Resolve active window information
    const activeWindow = await this.resolveActiveWindow()
    if (!activeWindow) {
      this.cache = null
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

    // Try to get application icon
    info.icon = await this.resolveIcon(info.executablePath)

    // Cache the result
    this.cache = {
      info,
      expiresAt: Date.now() + this.cacheTTL
    }

    return info
  }
}

export const activeAppService = new ActiveAppService()
