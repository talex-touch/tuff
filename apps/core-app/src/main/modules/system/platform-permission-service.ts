import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import {
  PermissionsRefreshedEvent,
  TalexEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'
import { execFileSync, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineEvent } from '@talex-touch/utils/transport/event/builder'
import { Notification, shell, systemPreferences } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { getMainConfig } from '../storage'
import { getFileAccessRootDescriptors, type FileAccessRootDescriptor } from './file-access-roots'

export enum PermissionType {
  ACCESSIBILITY = 'accessibility',
  NOTIFICATIONS = 'notifications',
  MICROPHONE = 'microphone',
  SCREEN_RECORDING = 'screenRecording',
  ADMIN_PRIVILEGES = 'adminPrivileges',
  FILE_ACCESS = 'fileAccess',
  FULL_DISK_ACCESS = 'fullDiskAccess'
}

export enum PermissionStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  NOT_DETERMINED = 'notDetermined',
  UNSUPPORTED = 'unsupported',
  UNVERIFIABLE = 'unverifiable'
}

const systemPermissionCheckEvent = defineEvent('system')
  .module('permission')
  .event('check')
  .define<string, PermissionCheckResult>()
const systemPermissionRequestEvent = defineEvent('system')
  .module('permission')
  .event('request')
  .define<PermissionType, boolean>()
const systemPermissionOpenSettingsEvent = defineEvent('system')
  .module('permission')
  .event('open-settings')
  .define<void, boolean>()
const systemPermissionFileAccessRootsEvent = defineEvent('system')
  .module('permission')
  .event('file-access-roots')
  .define<void, FileAccessRootCheckResult[]>()
const systemPermissionRequestFileAccessRootsEvent = defineEvent('system')
  .module('permission')
  .event('request-file-access-roots')
  .define<void, FileAccessRootCheckResult[]>()
const systemPermissionFullDiskAccessEvent = defineEvent('system')
  .module('permission')
  .event('full-disk-access')
  .define<void, PermissionCheckResult>()
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const platformPermissionLog = getLogger('platform-permission')
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

// macOS folders gated by TCC (Transparency, Consent & Control). Reading these via
// opendir()/readdir() while access is "not determined" pops a blocking consent
// dialog, so silent/background probes must avoid touching them until the user has
// made an explicit determination.
const MAC_TCC_PROTECTED_HOME_DIRS = ['Documents', 'Downloads', 'Desktop'] as const

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

interface FileAccessProbeOptions {
  /**
   * When true, the probe is allowed to trigger the macOS TCC consent dialog.
   * Silent/background checks pass false so they never surface a dialog on startup.
   */
  allowPrompt?: boolean
}

interface FileAccessRootCheckOptions extends FileAccessProbeOptions {
  probeAccess?: boolean
}

export interface FileAccessRootCheckResult extends FileAccessRootDescriptor {
  status: PermissionStatus
  canRequest: boolean
  message?: string
}

/**
 * Cross-platform system permission service.
 *
 * Replaces the previous access(R_OK)-based file checks, which lied on macOS:
 * POSIX access() only inspects mode bits/ACLs and returns success for
 * user-owned-but-TCC-blocked folders (Documents/Downloads/Desktop). This service
 * probes with opendir()/readdir(), which is what TCC actually gates, so a blocked
 * folder is honestly reported as DENIED instead of a false GRANTED.
 */
export class PlatformPermissionService {
  private static instance: PlatformPermissionService

  // Whether the user has actively requested file-access this session (via the
  // onboarding/settings "grant" flow). Combined with the persisted onboarding
  // grant, this tells silent probes whether it is safe to touch TCC folders
  // without risking a startup dialog.
  private fileAccessDeterminationRequested = false

  private constructor() {}

  public static getInstance(): PlatformPermissionService {
    if (!PlatformPermissionService.instance) {
      PlatformPermissionService.instance = new PlatformPermissionService()
    }
    return PlatformPermissionService.instance
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
      platformPermissionLog.error('Failed to check accessibility permission', { error })
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
          status: PermissionStatus.UNVERIFIABLE,
          canRequest: true,
          message:
            'Native notifications are supported, but macOS notification permission is not readable from Electron. Please confirm it in System Settings.'
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
        canRequest: false,
        message: 'Windows notification permission cannot be verified programmatically'
      }
    }

    return {
      status: PermissionStatus.UNSUPPORTED,
      canRequest: false,
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
        canRequest:
          process.platform === 'darwin' || process.platform === 'win32' || status !== 'denied',
        message: `Microphone permission: ${status}`
      }
    } catch (error) {
      platformPermissionLog.error('Failed to check microphone permission', { error })
      return {
        status: PermissionStatus.NOT_DETERMINED,
        canRequest: false,
        message: 'Unable to check microphone permission status'
      }
    }
  }

  /**
   * Check screen recording permission (macOS only)
   */
  public checkScreenRecording(): PermissionCheckResult {
    if (
      process.platform !== 'darwin' ||
      typeof systemPreferences.getMediaAccessStatus !== 'function'
    ) {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: 'Screen recording permission status is only available on macOS'
      }
    }

    try {
      const status = systemPreferences.getMediaAccessStatus(
        'screen' as Parameters<typeof systemPreferences.getMediaAccessStatus>[0]
      )
      return {
        status:
          status === 'granted'
            ? PermissionStatus.GRANTED
            : status === 'denied'
              ? PermissionStatus.DENIED
              : PermissionStatus.NOT_DETERMINED,
        canRequest: true,
        message: `Screen recording permission: ${status}`
      }
    } catch (error) {
      platformPermissionLog.error('Failed to check screen recording permission', { error })
      return {
        status: PermissionStatus.NOT_DETERMINED,
        canRequest: true,
        message: 'Unable to check screen recording permission status'
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
        platformPermissionLog.error('Failed to check admin privileges', { error })
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
   * Whether `targetPath` lives inside a macOS TCC-protected user folder.
   */
  public isTccProtectedPath(targetPath: string): boolean {
    if (process.platform !== 'darwin') return false

    const normalized = path.resolve(targetPath).toLowerCase()
    const home = os.homedir()
    return MAC_TCC_PROTECTED_HOME_DIRS.some((dir) => {
      const root = path.join(home, dir).toLowerCase()
      return normalized === root || normalized.startsWith(`${root}${path.sep}`)
    })
  }

  /**
   * Record that the user has actively initiated a file-access request this
   * session. After this, silent probes may safely touch TCC folders because a
   * granted/denied determination will no longer surface a dialog.
   */
  public markFileAccessDeterminationRequested(): void {
    this.fileAccessDeterminationRequested = true
  }

  private isFileAccessOnboardingGranted(): boolean {
    try {
      const setting = getMainConfig(StorageList.APP_SETTING) as
        | { setup?: { fileAccess?: unknown } }
        | undefined
      return setting?.setup?.fileAccess === true
    } catch {
      return false
    }
  }

  /**
   * Whether the user has made an explicit file-access determination — either this
   * session (request flow) or previously (persisted onboarding grant). Used to
   * decide when a silent probe may touch TCC folders without risking a dialog.
   */
  public isFileAccessDeterminationSettled(): boolean {
    return this.fileAccessDeterminationRequested || this.isFileAccessOnboardingGranted()
  }

  /**
   * The honest, TCC-aware access probe. Enumerates a single directory entry,
   * which is exactly what macOS TCC gates, so a blocked folder throws EPERM/EACCES
   * and is reported as DENIED. Synchronous by design so callers that must stay
   * synchronous (transport handlers, the file-access-roots check) keep working.
   */
  public probeFileAccessStatus(
    targetPath: string,
    options: FileAccessProbeOptions = {}
  ): PermissionStatus {
    // Silent probe of an unresolved TCC folder would pop a consent dialog — defer
    // instead of prompting. Once the user has determined access, probing is safe:
    // granted succeeds quietly and denied throws quietly (neither prompts again).
    if (
      !options.allowPrompt &&
      this.isTccProtectedPath(targetPath) &&
      !this.isFileAccessDeterminationSettled()
    ) {
      return PermissionStatus.NOT_DETERMINED
    }

    try {
      const dir = fs.opendirSync(targetPath)
      try {
        dir.readSync()
      } finally {
        dir.closeSync()
      }
      return PermissionStatus.GRANTED
    } catch (error) {
      const code = toErrorCode(error)
      if (code === 'EPERM' || code === 'EACCES') {
        return PermissionStatus.DENIED
      }
      if (code === 'ENOTDIR') {
        // Not a directory: fall back to a plain readability check for files.
        try {
          fs.accessSync(targetPath, fs.constants.R_OK)
          return PermissionStatus.GRANTED
        } catch (fileError) {
          const fileCode = toErrorCode(fileError)
          return fileCode === 'EPERM' || fileCode === 'EACCES'
            ? PermissionStatus.DENIED
            : PermissionStatus.NOT_DETERMINED
        }
      }
      // ENOENT (missing path) and anything else are not determinable.
      return PermissionStatus.NOT_DETERMINED
    }
  }

  /**
   * Check file access permission (cross-platform). Tests access to a specific path
   * using the TCC-aware probe.
   */
  public checkFileAccess(
    filePath?: string,
    options: FileAccessProbeOptions = {}
  ): PermissionCheckResult {
    const fallback = resolveDefaultFileAccessPath(process.platform)
    if (!filePath && !fallback.path) {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: fallback.unsupportedReason
      }
    }
    const testPath = filePath || fallback.path!
    const status = this.probeFileAccessStatus(testPath, options)

    switch (status) {
      case PermissionStatus.GRANTED:
        return {
          status,
          canRequest: false,
          message: `File access to ${testPath} is granted`
        }
      case PermissionStatus.DENIED:
        return {
          status,
          canRequest: true,
          message: `File access to ${testPath} is denied. ${
            process.platform === 'win32'
              ? 'May require administrator privileges.'
              : 'May require file access permissions.'
          }`
        }
      default:
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: process.platform === 'darwin',
          message: `File access to ${testPath} could not be determined`
        }
    }
  }

  /**
   * Full Disk Access check (macOS only). Best-effort: the TCC database is only
   * openable with Full Disk Access, so a successful open implies FDA is granted.
   */
  public checkFullDiskAccess(): PermissionCheckResult {
    if (process.platform !== 'darwin') {
      return {
        status: PermissionStatus.UNSUPPORTED,
        canRequest: false,
        message: 'Full Disk Access is a macOS-only concept'
      }
    }

    const probePath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'com.apple.TCC',
      'TCC.db'
    )
    try {
      const fd = fs.openSync(probePath, 'r')
      fs.closeSync(fd)
      return {
        status: PermissionStatus.GRANTED,
        canRequest: false,
        message: 'Full Disk Access is granted'
      }
    } catch (error) {
      const code = toErrorCode(error)
      if (code === 'EPERM' || code === 'EACCES') {
        return {
          status: PermissionStatus.DENIED,
          canRequest: true,
          message: 'Full Disk Access is not granted'
        }
      }
      // ENOENT etc.: the probe file may not exist on this macOS build; we cannot tell.
      return {
        status: PermissionStatus.NOT_DETERMINED,
        canRequest: true,
        message: 'Full Disk Access status could not be determined'
      }
    }
  }

  public hasFullDiskAccess(): boolean {
    return this.checkFullDiskAccess().status === PermissionStatus.GRANTED
  }

  private createDeferredFileAccessResult(
    root: FileAccessRootDescriptor
  ): FileAccessRootCheckResult {
    return {
      ...root,
      status: PermissionStatus.NOT_DETERMINED,
      canRequest: true,
      message:
        'File access is listed for user-confirmed onboarding or settings authorization and was not probed silently.'
    }
  }

  public checkFileAccessRoots(
    options: FileAccessRootCheckOptions = {}
  ): FileAccessRootCheckResult[] {
    const probeAccess = options.probeAccess ?? process.platform !== 'darwin'
    const allowPrompt = options.allowPrompt ?? false

    return getFileAccessRootDescriptors().map((root) => {
      if (!probeAccess) {
        return this.createDeferredFileAccessResult(root)
      }

      return {
        ...root,
        ...this.checkFileAccess(root.path, { allowPrompt })
      }
    })
  }

  public async requestFileAccessRoots(): Promise<FileAccessRootCheckResult[]> {
    // A user-initiated request: safe to prompt from here on out.
    this.markFileAccessDeterminationRequested()

    const roots = getFileAccessRootDescriptors()
    for (const root of roots) {
      if (process.platform !== 'darwin') break

      try {
        await fsp.readdir(root.path)
      } catch {
        // Reading protected macOS folders from a user action triggers the OS permission prompt.
      }
    }

    // Probe with prompting allowed so the reported status reflects the real
    // outcome of the request (granted vs. denied) rather than a POSIX lie.
    return this.checkFileAccessRoots({ probeAccess: true, allowPrompt: true })
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
        platformPermissionLog.warn('Failed to verify Windows admin privileges', error)
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
        if (process.platform === 'darwin') {
          const status =
            typeof systemPreferences.getMediaAccessStatus === 'function'
              ? systemPreferences.getMediaAccessStatus(
                  'microphone' as Parameters<typeof systemPreferences.getMediaAccessStatus>[0]
                )
              : undefined
          if (status === 'denied') {
            await shell.openExternal(
              'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
            )
            return true
          }
          if (typeof systemPreferences.askForMediaAccess === 'function') {
            return await systemPreferences.askForMediaAccess(
              'microphone' as Parameters<typeof systemPreferences.askForMediaAccess>[0]
            )
          }
        } else if (process.platform === 'win32') {
          await shell.openExternal('ms-settings:privacy-microphone')
          return true
        }
        break

      case PermissionType.SCREEN_RECORDING:
        if (process.platform === 'darwin') {
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
          )
          return true
        }
        break

      case PermissionType.FULL_DISK_ACCESS:
        if (process.platform === 'darwin') {
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'
          )
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
          platformPermissionLog.debug(
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
 * Platform Permission Module
 * Provides system permission checking and requesting capabilities.
 */
export class PlatformPermissionModule extends BaseModule {
  static key: symbol = Symbol.for('PlatformPermission')
  name: ModuleKey = PlatformPermissionModule.key
  private service: PlatformPermissionService
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  constructor() {
    super(PlatformPermissionModule.key, {
      create: false
    })
    this.service = PlatformPermissionService.getInstance()
  }

  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const channel =
      ctx.runtime?.channel ?? (ctx.app as { channel?: unknown } | null | undefined)?.channel
    if (!channel) {
      platformPermissionLog.warn('Channel unavailable during platform permission init')
      return
    }

    const keyManager = resolveKeyManager(channel)
    this.transport = getTuffTransportMain(channel, keyManager)
    this.setupChannels()
    platformPermissionLog.info('Platform permission module initialized')
  }

  async onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): Promise<void> {
    // Cleanup if needed
    platformPermissionLog.info('Platform permission module destroyed')
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
          result = this.service.checkAccessibility()
        } else if (
          permissionType === 'notifications' ||
          permissionType === PermissionType.NOTIFICATIONS
        ) {
          result = this.service.checkNotifications()
        } else if (
          permissionType === 'microphone' ||
          permissionType === PermissionType.MICROPHONE
        ) {
          result = this.service.checkMicrophone()
        } else if (
          permissionType === 'screenRecording' ||
          permissionType === PermissionType.SCREEN_RECORDING
        ) {
          result = this.service.checkScreenRecording()
        } else if (
          permissionType === 'adminPrivileges' ||
          permissionType === PermissionType.ADMIN_PRIVILEGES
        ) {
          result = this.service.checkAdminPrivileges()
        } else if (
          permissionType === 'fullDiskAccess' ||
          permissionType === PermissionType.FULL_DISK_ACCESS
        ) {
          result = this.service.checkFullDiskAccess()
        } else if (
          permissionType === 'fileAccess' ||
          permissionType === PermissionType.FILE_ACCESS
        ) {
          result = this.service.checkFileAccess()
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
        platformPermissionLog.error(`Failed to check permission ${permissionType}`, { error })
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
        return await this.service.requestPermission(permissionType)
      } catch (error) {
        platformPermissionLog.error(`Failed to request permission ${permissionType}`, { error })
        return false
      }
    })

    // Open system settings
    transport.on(systemPermissionOpenSettingsEvent, async () => {
      try {
        await this.service.openSystemSettings()
        return true
      } catch (error) {
        platformPermissionLog.error('Failed to open system settings', { error })
        return false
      }
    })

    transport.on(systemPermissionFileAccessRootsEvent, () => {
      try {
        const roots = this.service.checkFileAccessRoots()
        // A status refresh is a good moment to let the watcher retry any roots
        // that may have just become accessible (e.g. granted in System Settings).
        touchEventBus.emit(TalexEvents.PERMISSIONS_REFRESHED, new PermissionsRefreshedEvent())
        return roots
      } catch (error) {
        platformPermissionLog.error('Failed to check file access roots', { error })
        return []
      }
    })

    transport.on(systemPermissionRequestFileAccessRootsEvent, async () => {
      try {
        const roots = await this.service.requestFileAccessRoots()
        touchEventBus.emit(TalexEvents.PERMISSIONS_REFRESHED, new PermissionsRefreshedEvent())
        return roots
      } catch (error) {
        platformPermissionLog.error('Failed to request file access roots', { error })
        return this.service.checkFileAccessRoots()
      }
    })

    transport.on(systemPermissionFullDiskAccessEvent, () => {
      try {
        return this.service.checkFullDiskAccess()
      } catch (error) {
        platformPermissionLog.error('Failed to check full disk access', { error })
        return {
          status: PermissionStatus.NOT_DETERMINED,
          canRequest: false,
          message: `Error checking full disk access: ${error}`
        }
      }
    })
  }
}

export const platformPermissionService = PlatformPermissionService.getInstance()
export const platformPermissionModule = new PlatformPermissionModule()
