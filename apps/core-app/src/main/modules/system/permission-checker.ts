import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import process from 'node:process'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { Notification, shell, systemPreferences } from 'electron'
import { BaseModule } from '../abstract-base-module'

export enum PermissionType {
  ACCESSIBILITY = 'accessibility',
  NOTIFICATIONS = 'notifications',
  MICROPHONE = 'microphone',
  ADMIN_PRIVILEGES = 'adminPrivileges',
  FILE_ACCESS = 'fileAccess'
}

export enum PermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  NOT_DETERMINED = 'notDetermined',
  UNSUPPORTED = 'unsupported'
}

const systemPermissionCheckEvent = defineRawEvent<string, PermissionCheckResult>(
  'system:permission:check'
)
const systemPermissionRequestEvent = defineRawEvent<PermissionType, boolean>(
  'system:permission:request'
)
const systemPermissionOpenSettingsEvent = defineRawEvent<void, boolean>(
  'system:permission:open-settings'
)
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const permissionCheckerLog = getLogger('permission-checker')
const PERMISSION_COMMAND_TIMEOUT_MS = 1500
const LINUX_SETTINGS_CANDIDATES: Array<{ command: string; args: string[] }> = [
  { command: 'xdg-open', args: ['settings://'] },
  { command: 'gio', args: ['open', 'settings://'] },
  { command: 'gnome-control-center', args: ['privacy'] },
  { command: 'systemsettings6', args: [] },
  { command: 'systemsettings5', args: [] },
  { command: 'systemsettings', args: [] },
  { command: 'kcmshell6', args: ['kcm_notifications'] },
  { command: 'kcmshell5', args: ['kcm_notifications'] }
]

function toErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

function resolveDefaultFileAccessPath(platform: NodeJS.Platform): {
  path?: string
  unsupportedReason?: string
} {
  switch (platform) {
    case 'win32':
      return { path: 'C:\\' }
    case 'darwin':
      return { path: '/Applications' }
    case 'linux':
      return { path: '/usr' }
    default:
      return {
        unsupportedReason: `File access permission check is not supported on platform: ${platform}`
      }
  }
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
      permissionCheckerLog.error('Failed to check accessibility permission', { error })
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
      if (Notification.isSupported()) {
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: true,
          message:
            'Native notifications are supported, but macOS notification permission cannot be verified programmatically.'
        }
      }
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: 'Native notifications are not supported on this macOS build'
      }
    }

    if (process.platform === 'win32') {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: true,
        message: 'Windows notification permission cannot be verified programmatically'
      }
    }

    return {
      status: PermissionStatus.UNSUPPORTED,
      canRequest: true,
      message: 'Linux notification permission depends on desktop environment and is not verifiable'
    }
  }

  /**
   * Check microphone permission
   */
  public checkMicrophone(): PermissionCheckResult {
    if (typeof systemPreferences.getMediaAccessStatus !== 'function') {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: 'Microphone permission status is not supported on this platform'
      }
    }

    try {
      const status = systemPreferences.getMediaAccessStatus(
        'microphone' as Parameters<typeof systemPreferences.getMediaAccessStatus>[0]
      )
      return {
        status:
          status === 'granted'
            ? PermissionStatus.GRANTED
            : status === 'denied'
              ? PermissionStatus.DENIED
              : PermissionStatus.NOT_DETERMINED,
        canRequest: status !== 'denied',
        message: `Microphone permission: ${status}`
      }
    } catch (error) {
      permissionCheckerLog.error('Failed to check microphone permission', { error })
      return {
        status: PermissionStatus.NOT_DETERMINED,
        canRequest: false,
        message: 'Unable to check microphone permission status'
      }
    }
  }

  /**
   * Check admin privileges (Windows/Linux only)
   */
  public checkAdminPrivileges(): PermissionCheckResult {
    if (process.platform === 'win32') {
      try {
        const isAdmin = this.isWindowsAdmin()
        if (isAdmin === null) {
          return {
            status: PermissionStatus.NOT_DETERMINED,
            canRequest: false,
            message: 'Unable to verify administrator privileges on Windows'
          }
        }
        return {
          status: isAdmin ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
          canRequest: true,
          message: isAdmin
            ? 'Administrator privileges are available'
            : 'Administrator privileges are not active for current process'
        }
      } catch (error) {
        permissionCheckerLog.error('Failed to check admin privileges', { error })
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
    const fallback = resolveDefaultFileAccessPath(process.platform)
    if (!filePath && !fallback.path) {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: fallback.unsupportedReason
      }
    }
    const testPath = filePath || fallback.path!

    try {
      // Try to read the directory
      fs.accessSync(testPath, fs.constants.R_OK)
      return {
        status: PermissionStatus.GRANTED,
        canRequest: false,
        message: `File access to ${testPath} is granted`
      }
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined
      const message = error instanceof Error ? error.message : String(error)
      if (code === 'EACCES' || code === 'EPERM') {
        return {
          status: PermissionStatus.DENIED,
          canRequest: true,
          message: `File access to ${testPath} is denied. ${process.platform === 'win32' ? 'May require administrator privileges.' : 'May require file access permissions.'}`
        }
      } else if (code === 'ENOENT') {
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Path ${testPath} does not exist`
        }
      } else {
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Unable to check file access: ${message}`
        }
      }
    }
  }

  /**
   * Check if Windows process is running with admin privileges
   */
  private isWindowsAdmin(): boolean | null {
    if (process.platform !== 'win32') {
      return false
    }

    try {
      const script = `
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
`
      const stdout = execFileSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: PERMISSION_COMMAND_TIMEOUT_MS
        }
      )
      return stdout.trim().toLowerCase() === 'true'
    } catch (error) {
      const code = toErrorCode(error)
      if (code !== 'ENOENT') {
        permissionCheckerLog.warn('Failed to verify Windows admin privileges', error)
      }
      return null
    }
  }

  /**
   * Request permission (opens system settings where applicable)
   */
  public async requestPermission(type: PermissionType): Promise<boolean> {
    switch (type) {
      case PermissionType.ACCESSIBILITY:
        if (process.platform === 'darwin') {
          systemPreferences.isTrustedAccessibilityClient(true)
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
          await shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications')
          return true
        } else if (process.platform === 'win32') {
          // Windows notification settings
          await shell.openExternal('ms-settings:notifications')
          return true
        } else if (process.platform === 'linux') {
          await this.openSystemSettings('linux')
          return true
        }
        break

      case PermissionType.MICROPHONE:
        if (
          process.platform === 'darwin' &&
          typeof systemPreferences.askForMediaAccess === 'function'
        ) {
          return await systemPreferences.askForMediaAccess(
            'microphone' as Parameters<typeof systemPreferences.askForMediaAccess>[0]
          )
        } else if (process.platform === 'win32') {
          await shell.openExternal('ms-settings:privacy-microphone')
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
      return
    }

    if (targetPlatform === 'win32') {
      // Open Windows Settings > Privacy
      await shell.openExternal('ms-settings:privacy')
      return
    }

    if (targetPlatform !== 'linux') {
      throw new Error(`System settings is unsupported on platform: ${targetPlatform}`)
    }

    await this.openLinuxSystemSettings()
  }

  private async openLinuxSystemSettings(): Promise<void> {
    let lastError: unknown = null

    for (const candidate of LINUX_SETTINGS_CANDIDATES) {
      try {
        await this.launchDetached(candidate.command, candidate.args)
        return
      } catch (error) {
        lastError = error
        const code = toErrorCode(error)
        if (code !== 'ENOENT') {
          permissionCheckerLog.debug(
            `Linux settings launcher failed: ${candidate.command} ${candidate.args.join(' ')}`,
            error
          )
        }
      }
    }

    const suffix = lastError instanceof Error && lastError.message ? `: ${lastError.message}` : ''
    throw new Error(`Linux system settings is unavailable on this desktop environment${suffix}`)
  }

  private launchDetached(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
      })
      const timeoutId = setTimeout(() => {
        finish(() => reject(new Error(`Timed out launching ${command}`)))
      }, PERMISSION_COMMAND_TIMEOUT_MS)

      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        callback()
      }

      child.once('error', (error) => {
        finish(() => reject(error))
      })

      child.once('spawn', () => {
        child.unref()
        finish(resolve)
      })
    })
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
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  constructor() {
    super(PermissionCheckerModule.key, {
      create: false
    })
    this.checker = PermissionChecker.getInstance()
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel =
      ctx.runtime?.channel ?? (ctx.app as { channel?: unknown } | null | undefined)?.channel
    if (!channel) {
      permissionCheckerLog.warn('Channel unavailable during permission checker init')
      return
    }

    const keyManager = resolveKeyManager(channel)
    this.transport = getTuffTransportMain(channel, keyManager)
    this.setupChannels()
    permissionCheckerLog.info('Permission checker module initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    // Cleanup if needed
    permissionCheckerLog.info('Permission checker module destroyed')
  }

  private setupChannels(): void {
    const transport = this.transport
    if (!transport) {
      return
    }

    // Check permission status
    transport.on(systemPermissionCheckEvent, (permissionType) => {
      try {
        let result: PermissionCheckResult

        // Handle both enum and string values
        if (permissionType === 'accessibility' || permissionType === PermissionType.ACCESSIBILITY) {
          result = this.checker.checkAccessibility()
        } else if (
          permissionType === 'notifications' ||
          permissionType === PermissionType.NOTIFICATIONS
        ) {
          result = this.checker.checkNotifications()
        } else if (
          permissionType === 'microphone' ||
          permissionType === PermissionType.MICROPHONE
        ) {
          result = this.checker.checkMicrophone()
        } else if (
          permissionType === 'adminPrivileges' ||
          permissionType === PermissionType.ADMIN_PRIVILEGES
        ) {
          result = this.checker.checkAdminPrivileges()
        } else if (
          permissionType === 'fileAccess' ||
          permissionType === PermissionType.FILE_ACCESS
        ) {
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
        permissionCheckerLog.error(`Failed to check permission ${permissionType}`, { error })
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Error checking permission: ${error}`
        }
      }
    })

    // Request permission (opens system settings)
    transport.on(systemPermissionRequestEvent, async (permissionType) => {
      try {
        return await this.checker.requestPermission(permissionType)
      } catch (error) {
        permissionCheckerLog.error(`Failed to request permission ${permissionType}`, { error })
        return false
      }
    })

    // Open system settings
    transport.on(systemPermissionOpenSettingsEvent, async () => {
      try {
        await this.checker.openSystemSettings()
        return true
      } catch (error) {
        permissionCheckerLog.error('Failed to open system settings', { error })
        return false
      }
    })
  }
}

export const permissionCheckerModule = new PermissionCheckerModule()
