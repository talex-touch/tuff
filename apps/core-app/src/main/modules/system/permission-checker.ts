import { systemPreferences, app, shell } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { ModuleKey } from '@talex-touch/utils'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export enum PermissionType {
  ACCESSIBILITY = 'accessibility',
  NOTIFICATIONS = 'notifications',
  ADMIN_PRIVILEGES = 'adminPrivileges',
  FILE_ACCESS = 'fileAccess'
}

export enum PermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  NOT_DETERMINED = 'notDetermined',
  UNSUPPORTED = 'unsupported'
}

interface PermissionCheckResult {
  status: PermissionStatus
  canRequest: boolean
  message?: string
}

export class PermissionChecker {
  private static instance: PermissionChecker

  private constructor() {}

  public static getInstance(): PermissionChecker {
    if (!PermissionChecker.instance) {
      PermissionChecker.instance = new PermissionChecker()
    }
    return PermissionChecker.instance
  }

  /**
   * Check accessibility permission (macOS only)
   */
  public checkAccessibility(): PermissionCheckResult {
    if (process.platform !== 'darwin') {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: 'Accessibility permission is only available on macOS'
      }
    }

    try {
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
      return {
        status: isTrusted ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
        canRequest: true,
        message: isTrusted
          ? 'Accessibility permission is granted'
          : 'Accessibility permission is required for app scanning features'
      }
    } catch (error) {
      console.error('[PermissionChecker] Failed to check accessibility permission:', error)
      return {
        status: PermissionStatus.NOT_DETERMINED,
        canRequest: false,
        message: 'Unable to check accessibility permission status'
      }
    }
  }

  /**
   * Check notification permission
   */
  public checkNotifications(): PermissionCheckResult {
    if (process.platform === 'darwin') {
      // macOS 10.14+
      if (systemPreferences.getMediaAccessStatus) {
        try {
          const status = systemPreferences.getMediaAccessStatus('notifications' as any)
          return {
            status:
              status === 'granted'
                ? PermissionStatus.GRANTED
                : status === 'denied'
                  ? PermissionStatus.DENIED
                  : PermissionStatus.NOT_DETERMINED,
            canRequest: status !== 'denied',
            message: `Notification permission: ${status}`
          }
        } catch (error) {
          // Fallback for older macOS versions
          return {
            status: PermissionStatus.GRANTED,
            canRequest: false,
            message: 'Notifications are enabled by default on this macOS version'
          }
        }
      }
      // Older macOS versions don't require explicit notification permission
      return {
        status: PermissionStatus.GRANTED,
        canRequest: false,
        message: 'Notifications are enabled by default on this macOS version'
      }
    } else if (process.platform === 'win32') {
      // Windows doesn't require explicit notification permission
      return {
        status: PermissionStatus.GRANTED,
        canRequest: false,
        message: 'Notifications are enabled by default on Windows'
      }
    } else {
      // Linux - check if notification daemon is available
      return {
        status: PermissionStatus.GRANTED,
        canRequest: false,
        message: 'Notifications depend on desktop environment support'
      }
    }
  }

  /**
   * Check admin privileges (Windows/Linux only)
   */
  public checkAdminPrivileges(): PermissionCheckResult {
    if (process.platform === 'win32') {
      try {
        // Try to access C:\Windows\System32 (requires admin on some systems)
        // Or check if process is elevated
        const isAdmin = this.isWindowsAdmin()
        return {
          status: isAdmin ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
          canRequest: true,
          message: isAdmin
            ? 'Administrator privileges are available'
            : 'Administrator privileges are required to access system directories (e.g., C:\\ drive)'
        }
      } catch (error) {
        console.error('[PermissionChecker] Failed to check admin privileges:', error)
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: 'Unable to check administrator privileges status'
        }
      }
    } else if (process.platform === 'linux') {
      // On Linux, check if running as root (not recommended for security)
      const isRoot = process.getuid && process.getuid() === 0
      return {
        status: isRoot ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
        canRequest: false,
        message: isRoot
          ? 'Running with root privileges'
          : 'Root privileges may be needed for some system directories'
      }
    } else {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: 'Admin privileges check is only available on Windows and Linux'
      }
    }
  }

  /**
   * Check file access permission (cross-platform)
   * Tests access to a specific path
   */
  public checkFileAccess(filePath?: string): PermissionCheckResult {
    const testPath = filePath || (process.platform === 'win32' ? 'C:\\' : '/Applications')

    try {
      // Try to read the directory
      fs.accessSync(testPath, fs.constants.R_OK)
      return {
        status: PermissionStatus.GRANTED,
        canRequest: false,
        message: `File access to ${testPath} is granted`
      }
    } catch (error: any) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        return {
          status: PermissionStatus.DENIED,
          canRequest: true,
          message: `File access to ${testPath} is denied. ${process.platform === 'win32' ? 'May require administrator privileges.' : 'May require file access permissions.'}`
        }
      } else if (error.code === 'ENOENT') {
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Path ${testPath} does not exist`
        }
      } else {
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Unable to check file access: ${error.message}`
        }
      }
    }
  }

  /**
   * Check if Windows process is running with admin privileges
   */
  private isWindowsAdmin(): boolean {
    if (process.platform !== 'win32') {
      return false
    }

    try {
      // Try to write to Windows directory (requires admin)
      const testPath = path.join(process.env['WINDIR'] || 'C:\\Windows', 'System32', 'test.tmp')
      try {
        fs.writeFileSync(testPath, 'test')
        fs.unlinkSync(testPath)
        return true
      } catch {
        // If write fails, check using alternative method
        // On Windows, check if we can access protected directories
        try {
          fs.accessSync('C:\\Windows\\System32', fs.constants.R_OK)
          // Additional check: try to list protected directory
          const files = fs.readdirSync('C:\\Windows\\System32')
          return files.length > 0
        } catch {
          return false
        }
      }
    } catch {
      // Fallback: check if running as administrator using environment
      const isAdmin = process.env['USERPROFILE']?.includes('Administrator') || false
      return isAdmin
    }
  }

  /**
   * Request permission (opens system settings where applicable)
   */
  public async requestPermission(type: PermissionType): Promise<boolean> {
    switch (type) {
      case PermissionType.ACCESSIBILITY:
        if (process.platform === 'darwin') {
          // Open macOS System Preferences > Security & Privacy > Privacy > Accessibility
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
          )
          return true
        }
        break

      case PermissionType.NOTIFICATIONS:
        if (process.platform === 'darwin') {
          // macOS notification settings
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.notifications'
          )
          return true
        } else if (process.platform === 'win32') {
          // Windows notification settings
          await shell.openExternal('ms-settings:notifications')
          return true
        }
        break

      case PermissionType.ADMIN_PRIVILEGES:
        if (process.platform === 'win32') {
          // Show dialog explaining how to run as administrator
          // User needs to restart the app with admin privileges
          return false
        }
        break

      default:
        return false
    }

    return false
  }

  /**
   * Open system settings page for permissions
   */
  public async openSystemSettings(platform?: NodeJS.Platform): Promise<void> {
    const targetPlatform = platform || process.platform

    if (targetPlatform === 'darwin') {
      // Open macOS System Preferences
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy')
    } else if (targetPlatform === 'win32') {
      // Open Windows Settings > Privacy
      await shell.openExternal('ms-settings:privacy')
    } else {
      // Linux - show message or open relevant settings app
      console.log('[PermissionChecker] Linux system settings location depends on desktop environment')
    }
  }
}

/**
 * Permission Checker Module
 * Provides system permission checking and requesting capabilities
 */
export class PermissionCheckerModule extends BaseModule {
  static key: symbol = Symbol.for('PermissionChecker')
  name: ModuleKey = PermissionCheckerModule.key
  private checker: PermissionChecker

  constructor() {
    super(PermissionCheckerModule.key, {
      create: false
    })
    this.checker = PermissionChecker.getInstance()
  }

  async onInit(): Promise<void> {
    this.setupChannels()
    console.log('[PermissionChecker] Permission checker module initialized')
  }

  private setupChannels(): void {
    if (!$app.channel) {
      console.warn('[PermissionChecker] Channel not available, retrying setupChannels later')
      // Retry after a short delay
      setTimeout(() => {
        if ($app.channel) {
          this.setupChannels()
        }
      }, 100)
      return
    }

    // Check permission status
    $app.channel.regChannel(ChannelType.MAIN, 'system:permission:check', ({ data }) => {
      const permissionType = data as string
      try {
        let result: PermissionCheckResult
        
        // Handle both enum and string values
        if (permissionType === 'accessibility' || permissionType === PermissionType.ACCESSIBILITY) {
          result = this.checker.checkAccessibility()
        } else if (permissionType === 'notifications' || permissionType === PermissionType.NOTIFICATIONS) {
          result = this.checker.checkNotifications()
        } else if (permissionType === 'adminPrivileges' || permissionType === PermissionType.ADMIN_PRIVILEGES) {
          result = this.checker.checkAdminPrivileges()
        } else if (permissionType === 'fileAccess' || permissionType === PermissionType.FILE_ACCESS) {
          result = this.checker.checkFileAccess()
        } else {
          result = {
            status: PermissionStatus.NOT_DETERMINED,
            canRequest: false,
            message: `Unknown permission type: ${permissionType}`
          }
        }
        
        // Return result directly - channel will auto-reply if handler doesn't use reply()
        return result
      } catch (error) {
        console.error(`[PermissionChecker] Failed to check permission ${permissionType}:`, error)
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Error checking permission: ${error}`
        }
      }
    })

    // Request permission (opens system settings)
    $app.channel.regChannel(ChannelType.MAIN, 'system:permission:request', async ({ data }) => {
      const permissionType = data as PermissionType
      try {
        return await this.checker.requestPermission(permissionType)
      } catch (error) {
        console.error(`[PermissionChecker] Failed to request permission ${permissionType}:`, error)
        return false
      }
    })

    // Open system settings
    $app.channel.regChannel(ChannelType.MAIN, 'system:permission:open-settings', async () => {
      try {
        await this.checker.openSystemSettings()
        return true
      } catch (error) {
        console.error('[PermissionChecker] Failed to open system settings:', error)
        return false
      }
    })
  }
}

export const permissionCheckerModule = new PermissionCheckerModule()

