import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

// Type definition for get-windows result (similar to active-win)
interface GetWindowsResult {
  platform: Platform
  title: string
  id: number
  owner: {
    name: string
    processId: number
    path: string
    bundleId?: string
  }
  url?: string
  bounds?: {
    x: number
    y: number
    width: number
    height: number
  }
}

class ActiveAppService {
  private cache: { info: ActiveAppInfo; expiresAt: number } | null = null
  private getWindowsModule: any = null
  private readonly cacheTTL = 750
  private importFailed = false
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
   * Try to get active window using get-windows library (successor to active-win)
   */
  private async resolveActiveWindowViaGetWindows(): Promise<GetWindowsResult | undefined> {
    if (this.importFailed) return undefined

    try {
      if (!this.getWindowsModule) {
        this.getWindowsModule = await import('get-windows')
      }

      const windows = await this.getWindowsModule.getWindows({
        accessibilityPermission: true,
        screenRecordingPermission: true
      })

      // Get the first active/focused window
      const activeWindow = windows.find((win: any) => win.focused) || windows[0]
      return activeWindow
    } catch (error) {
      if (!this.importFailed) {
        console.warn('[ActiveApp] Failed to resolve active window via get-windows:', error)
        console.warn('[ActiveApp] Falling back to platform-specific methods...')
      }
      this.importFailed = true
      return undefined
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
      let executablePath: string | null = null

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
      console.error('[ActiveApp] macOS fallback failed:', error)
      return null
    }
  }

  /**
   * Windows-specific: Use PowerShell to get active window info
   */
  private async resolveActiveWindowWindows(): Promise<Partial<ActiveAppInfo> | null> {
    try {
      // PowerShell script to get active window information
      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          using System.Text;
          public class WindowHelper {
            [DllImport("user32.dll")]
            public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll", CharSet = CharSet.Unicode)]
            public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
            [DllImport("user32.dll")]
            public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
          }
"@
        $hwnd = [WindowHelper]::GetForegroundWindow()
        $sb = New-Object System.Text.StringBuilder 256
        [void][WindowHelper]::GetWindowText($hwnd, $sb, $sb.Capacity)
        $title = $sb.ToString()
        $processId = 0
        [void][WindowHelper]::GetWindowThreadProcessId($hwnd, [ref]$processId)
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
          $json = @{
            title = $title
            processId = $processId
            processName = $process.ProcessName
            executablePath = $process.Path
          } | ConvertTo-Json -Compress
          Write-Output $json
        }
      `

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        script
      ])

      const result = JSON.parse(stdout.trim())

      return {
        displayName: result.processName,
        windowTitle: result.title || null,
        processId: result.processId,
        executablePath: result.executablePath || null,
        bundleId: null,
        platform: 'windows'
      }
    } catch (error) {
      console.error('[ActiveApp] Windows fallback failed:', error)
      return null
    }
  }

  /**
   * Linux-specific: Use xdotool and xprop to get active window info
   */
  private async resolveActiveWindowLinux(): Promise<Partial<ActiveAppInfo> | null> {
    try {
      // Get active window ID
      const { stdout: windowId } = await execFileAsync('xdotool', ['getactivewindow'])
      const winId = windowId.trim()

      // Get window title
      const { stdout: title } = await execFileAsync('xdotool', ['getwindowname', winId])

      // Get window properties using xprop
      const { stdout: props } = await execFileAsync('xprop', ['-id', winId])

      // Parse WM_CLASS to get application name
      let displayName: string | null = null
      const wmClassMatch = props.match(/WM_CLASS\(STRING\)\s*=\s*"[^"]*",\s*"([^"]+)"/)
      if (wmClassMatch) {
        displayName = wmClassMatch[1]
      }

      // Get PID
      let processId: number | null = null
      const pidMatch = props.match(/_NET_WM_PID\(CARDINAL\)\s*=\s*(\d+)/)
      if (pidMatch) {
        processId = parseInt(pidMatch[1], 10)
      }

      // Try to get executable path from /proc
      let executablePath: string | null = null
      if (processId) {
        try {
          const { stdout: exePath } = await execFileAsync('readlink', [
            '-f',
            `/proc/${processId}/exe`
          ])
          executablePath = exePath.trim()
        } catch {
          // Failed to read executable path
        }
      }

      return {
        displayName,
        windowTitle: title.trim() || null,
        processId,
        executablePath,
        bundleId: null,
        platform: 'linux'
      }
    } catch (error) {
      console.error('[ActiveApp] Linux fallback failed:', error)
      return null
    }
  }

  /**
   * Main resolver: tries get-windows first, then falls back to platform-specific methods
   */
  private async resolveActiveWindow(): Promise<Partial<ActiveAppInfo> | null> {
    // Try get-windows first
    const getWindowsResult = await this.resolveActiveWindowViaGetWindows()
    if (getWindowsResult) {
      return {
        identifier: getWindowsResult.owner.bundleId || getWindowsResult.owner.path || getWindowsResult.owner.name,
        displayName: getWindowsResult.owner.name,
        bundleId: getWindowsResult.owner.bundleId ?? null,
        processId: getWindowsResult.owner.processId,
        executablePath: getWindowsResult.owner.path,
        platform: getWindowsResult.platform,
        windowTitle: getWindowsResult.title,
        url: getWindowsResult.url ?? null
      }
    }

    // Fall back to platform-specific methods
    switch (this.currentPlatform) {
      case 'macos':
        return await this.resolveActiveWindowMacOS()
      case 'windows':
        return await this.resolveActiveWindowWindows()
      case 'linux':
        return await this.resolveActiveWindowLinux()
      default:
        return null
    }
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
      identifier: activeWindow.identifier || activeWindow.executablePath || activeWindow.displayName || null,
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
