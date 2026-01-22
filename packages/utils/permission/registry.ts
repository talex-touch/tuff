/**
 * Permission Registry
 *
 * Defines all available permissions in the system.
 */

import type { PermissionDefinition } from './types'
import { PermissionCategory, PermissionRiskLevel } from './types'

/**
 * All permission definitions
 */
export const PERMISSIONS: PermissionDefinition[] = [
  // Filesystem permissions
  {
    id: 'fs.read',
    category: PermissionCategory.FILESYSTEM,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.fs.read.name',
    descKey: 'permission.fs.read.desc',
    icon: 'FileText',
  },
  {
    id: 'fs.write',
    category: PermissionCategory.FILESYSTEM,
    risk: PermissionRiskLevel.HIGH,
    nameKey: 'permission.fs.write.name',
    descKey: 'permission.fs.write.desc',
    icon: 'FilePen',
  },
  {
    id: 'fs.execute',
    category: PermissionCategory.FILESYSTEM,
    risk: PermissionRiskLevel.HIGH,
    nameKey: 'permission.fs.execute.name',
    descKey: 'permission.fs.execute.desc',
    icon: 'Terminal',
  },
  {
    id: 'fs.tfile',
    category: PermissionCategory.FILESYSTEM,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.fs.tfile.name',
    descKey: 'permission.fs.tfile.desc',
    icon: 'FileText',
  },

  // Clipboard permissions
  {
    id: 'clipboard.read',
    category: PermissionCategory.CLIPBOARD,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.clipboard.read.name',
    descKey: 'permission.clipboard.read.desc',
    icon: 'ClipboardCopy',
  },
  {
    id: 'clipboard.write',
    category: PermissionCategory.CLIPBOARD,
    risk: PermissionRiskLevel.LOW,
    nameKey: 'permission.clipboard.write.name',
    descKey: 'permission.clipboard.write.desc',
    icon: 'ClipboardPaste',
  },

  // Network permissions
  {
    id: 'network.local',
    category: PermissionCategory.NETWORK,
    risk: PermissionRiskLevel.LOW,
    nameKey: 'permission.network.local.name',
    descKey: 'permission.network.local.desc',
    icon: 'Wifi',
  },
  {
    id: 'network.internet',
    category: PermissionCategory.NETWORK,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.network.internet.name',
    descKey: 'permission.network.internet.desc',
    icon: 'Globe',
  },
  {
    id: 'network.download',
    category: PermissionCategory.NETWORK,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.network.download.name',
    descKey: 'permission.network.download.desc',
    icon: 'Download',
  },

  // System permissions
  {
    id: 'system.shell',
    category: PermissionCategory.SYSTEM,
    risk: PermissionRiskLevel.HIGH,
    nameKey: 'permission.system.shell.name',
    descKey: 'permission.system.shell.desc',
    icon: 'Terminal',
  },
  {
    id: 'system.notification',
    category: PermissionCategory.SYSTEM,
    risk: PermissionRiskLevel.LOW,
    nameKey: 'permission.system.notification.name',
    descKey: 'permission.system.notification.desc',
    icon: 'Bell',
  },
  {
    id: 'system.tray',
    category: PermissionCategory.SYSTEM,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.system.tray.name',
    descKey: 'permission.system.tray.desc',
    icon: 'PanelTop',
  },

  // AI permissions
  {
    id: 'ai.basic',
    category: PermissionCategory.AI,
    risk: PermissionRiskLevel.LOW,
    nameKey: 'permission.ai.basic.name',
    descKey: 'permission.ai.basic.desc',
    icon: 'Bot',
  },
  {
    id: 'ai.advanced',
    category: PermissionCategory.AI,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.ai.advanced.name',
    descKey: 'permission.ai.advanced.desc',
    icon: 'Sparkles',
  },
  {
    id: 'ai.agents',
    category: PermissionCategory.AI,
    risk: PermissionRiskLevel.HIGH,
    nameKey: 'permission.ai.agents.name',
    descKey: 'permission.ai.agents.desc',
    icon: 'Users',
  },

  // Storage permissions
  {
    id: 'storage.plugin',
    category: PermissionCategory.STORAGE,
    risk: PermissionRiskLevel.LOW,
    nameKey: 'permission.storage.plugin.name',
    descKey: 'permission.storage.plugin.desc',
    icon: 'Database',
  },
  {
    id: 'storage.shared',
    category: PermissionCategory.STORAGE,
    risk: PermissionRiskLevel.MEDIUM,
    nameKey: 'permission.storage.shared.name',
    descKey: 'permission.storage.shared.desc',
    icon: 'Share2',
  },

  // Window permissions
  {
    id: 'window.create',
    category: PermissionCategory.WINDOW,
    risk: PermissionRiskLevel.LOW,
    nameKey: 'permission.window.create.name',
    descKey: 'permission.window.create.desc',
    icon: 'AppWindow',
  },
  {
    id: 'window.capture',
    category: PermissionCategory.WINDOW,
    risk: PermissionRiskLevel.HIGH,
    nameKey: 'permission.window.capture.name',
    descKey: 'permission.window.capture.desc',
    icon: 'Camera',
  },
]

/**
 * Permission registry class
 */
export class PermissionRegistry {
  private permissions: Map<string, PermissionDefinition> = new Map()

  constructor() {
    // Register all built-in permissions
    PERMISSIONS.forEach(p => this.permissions.set(p.id, p))
  }

  /**
   * Get permission definition by ID
   */
  get(id: string): PermissionDefinition | undefined {
    return this.permissions.get(id)
  }

  /**
   * Get all permissions
   */
  all(): PermissionDefinition[] {
    return Array.from(this.permissions.values())
  }

  /**
   * Get permissions by category
   */
  byCategory(category: PermissionCategory): PermissionDefinition[] {
    return this.all().filter(p => p.category === category)
  }

  /**
   * Get permissions by risk level
   */
  byRisk(risk: PermissionRiskLevel): PermissionDefinition[] {
    return this.all().filter(p => p.risk === risk)
  }

  /**
   * Check if permission exists
   */
  has(id: string): boolean {
    return this.permissions.has(id)
  }

  /**
   * Register custom permission
   */
  register(permission: PermissionDefinition): void {
    this.permissions.set(permission.id, permission)
  }
}

/**
 * Singleton permission registry
 */
export const permissionRegistry = new PermissionRegistry()

/**
 * Permission ID constants for type safety
 */
export const PermissionIds = {
  // Filesystem
  FS_READ: 'fs.read',
  FS_WRITE: 'fs.write',
  FS_EXECUTE: 'fs.execute',
  FS_TFILE: 'fs.tfile',

  // Clipboard
  CLIPBOARD_READ: 'clipboard.read',
  CLIPBOARD_WRITE: 'clipboard.write',

  // Network
  NETWORK_LOCAL: 'network.local',
  NETWORK_INTERNET: 'network.internet',
  NETWORK_DOWNLOAD: 'network.download',

  // System
  SYSTEM_SHELL: 'system.shell',
  SYSTEM_NOTIFICATION: 'system.notification',
  SYSTEM_TRAY: 'system.tray',

  // AI
  AI_BASIC: 'ai.basic',
  AI_ADVANCED: 'ai.advanced',
  AI_AGENTS: 'ai.agents',

  // Storage
  STORAGE_PLUGIN: 'storage.plugin',
  STORAGE_SHARED: 'storage.shared',

  // Window
  WINDOW_CREATE: 'window.create',
  WINDOW_CAPTURE: 'window.capture',
} as const

export type PermissionId = (typeof PermissionIds)[keyof typeof PermissionIds]

/**
 * Default permissions that are auto-granted
 */
export const DEFAULT_PERMISSIONS: string[] = [
  PermissionIds.STORAGE_PLUGIN,
  PermissionIds.CLIPBOARD_WRITE,
  PermissionIds.WINDOW_CREATE,
]
