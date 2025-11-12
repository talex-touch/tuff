import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'

const execFileAsync = promisify(execFile)

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
  private readonly cacheTTL = 750
  private currentPlatform: Platform

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
   * macOS-specific: Use AppleScript to get active application info
   */
  private async resolveActiveWindowMacOS(): Promise<Partial<ActiveAppInfo> | null> {
    try {
      // Get active application name
      const { stdout: appName } = await execFileAsync('osascript', [
        '-e',
        'tell application "System Events" to get name of first application process whose frontmost is true'
      ])

      // Get active window title
      let windowTitle = ''
      try {
        const { stdout: title } = await execFileAsync('osascript', [
          '-e',
          `tell application "System Events" to get name of front window of application process "${appName.trim()}"`
        ])
        windowTitle = title.trim()
      } catch {
        // Some apps don't have window titles
      }

      // Get bundle ID and process ID using lsappinfo
      let bundleId: string | null = null
      let processId: number | null = null
      const executablePath: string | null = null

      try {
        const { stdout: processInfo } = await execFileAsync('sh', [
          '-c',
          `ps aux | grep -i "${appName.trim()}" | grep -v grep | head -n 1 | awk '{print $2}'`
        ])

        const pid = parseInt(processInfo.trim(), 10)
        if (!isNaN(pid)) {
          processId = pid

          // Try to get bundle ID using lsappinfo
          try {
            const { stdout: bundleInfo } = await execFileAsync('lsappinfo', [
              'info',
              '-only',
              'bundleid',
              `${pid}`
            ])
            const match = bundleInfo.match(/"CFBundleIdentifier"="([^"]+)"/)
            if (match) {
              bundleId = match[1]
            }
          } catch {
            // lsappinfo might not work for all processes
          }
        }
      } catch {
        // Process info retrieval failed
      }

      return {
        displayName: appName.trim(),
        windowTitle: windowTitle || null,
        bundleId,
        processId,
        executablePath,
        platform: 'macos'
      }
    } catch (error) {
      console.error('[ActiveApp] macOS resolution failed:', error)
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
      console.debug('[ActiveApp] Unable to read app icon:', error)
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
