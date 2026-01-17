/**
 * I18n Message Keys
 *
 * Centralized message keys for backend-to-frontend communication.
 * Backend sends `$i18n:key` format, frontend resolves to localized string.
 *
 * @example
 * Backend: { message: '$i18n:devServer.disconnected' }
 * Frontend: resolveI18nMessage(message) => '开发服务器连接已断开'
 */

/**
 * I18n message key prefix
 */
export const I18N_PREFIX = '$i18n:'

/**
 * Dev Server related message keys
 */
export const DevServerKeys = {
  DISCONNECTED: 'devServer.disconnected',
  DISCONNECTED_DESC: 'devServer.disconnectedDesc',
  RECONNECTED: 'devServer.reconnected',
  RECONNECTING: 'devServer.reconnecting',
  CHECK_SERVER: 'devServer.checkServer',
  CONNECTION_LOST: 'devServer.connectionLost',
  CONNECTION_RESTORED: 'devServer.connectionRestored',
} as const

/**
 * Flow Transfer related message keys
 */
export const FlowTransferKeys = {
  SHARE_COMPLETE: 'flowTransfer.shareComplete',
  SHARE_FAILED: 'flowTransfer.shareFailed',
  COPIED_TO_CLIPBOARD: 'flowTransfer.copiedToClipboard',
  FILE_REVEALED: 'flowTransfer.fileRevealed',
  AIRDROP_READY: 'flowTransfer.airdropReady',
  MAIL_READY: 'flowTransfer.mailReady',
  MESSAGES_READY: 'flowTransfer.messagesReady',
} as const

/**
 * Plugin related message keys
 */
export const PluginKeys = {
  LOAD_FAILED: 'plugin.loadFailed',
  MANIFEST_INVALID: 'plugin.manifestInvalid',
  DEPENDENCY_MISSING: 'plugin.dependencyMissing',
  VERSION_MISMATCH: 'plugin.versionMismatch',
  PERMISSION_DENIED: 'plugin.permissionDenied',
  SDK_VERSION_MISSING: 'plugin.sdkVersionMissing',
  SDK_VERSION_OUTDATED: 'plugin.sdkVersionOutdated',
  PERMISSION_MISSING: 'plugin.permissionMissing',
} as const

/**
 * Permission related message keys
 */
export const PermissionKeys = {
  // Categories
  CATEGORY_FS: 'permission.category.fs',
  CATEGORY_CLIPBOARD: 'permission.category.clipboard',
  CATEGORY_NETWORK: 'permission.category.network',
  CATEGORY_SYSTEM: 'permission.category.system',
  CATEGORY_AI: 'permission.category.ai',
  CATEGORY_STORAGE: 'permission.category.storage',
  CATEGORY_WINDOW: 'permission.category.window',

  // Risk levels
  RISK_LOW: 'permission.risk.low',
  RISK_MEDIUM: 'permission.risk.medium',
  RISK_HIGH: 'permission.risk.high',

  // Filesystem permissions
  FS_READ_NAME: 'permission.fs.read.name',
  FS_READ_DESC: 'permission.fs.read.desc',
  FS_WRITE_NAME: 'permission.fs.write.name',
  FS_WRITE_DESC: 'permission.fs.write.desc',
  FS_EXECUTE_NAME: 'permission.fs.execute.name',
  FS_EXECUTE_DESC: 'permission.fs.execute.desc',

  // Clipboard permissions
  CLIPBOARD_READ_NAME: 'permission.clipboard.read.name',
  CLIPBOARD_READ_DESC: 'permission.clipboard.read.desc',
  CLIPBOARD_WRITE_NAME: 'permission.clipboard.write.name',
  CLIPBOARD_WRITE_DESC: 'permission.clipboard.write.desc',

  // Network permissions
  NETWORK_LOCAL_NAME: 'permission.network.local.name',
  NETWORK_LOCAL_DESC: 'permission.network.local.desc',
  NETWORK_INTERNET_NAME: 'permission.network.internet.name',
  NETWORK_INTERNET_DESC: 'permission.network.internet.desc',
  NETWORK_DOWNLOAD_NAME: 'permission.network.download.name',
  NETWORK_DOWNLOAD_DESC: 'permission.network.download.desc',

  // System permissions
  SYSTEM_SHELL_NAME: 'permission.system.shell.name',
  SYSTEM_SHELL_DESC: 'permission.system.shell.desc',
  SYSTEM_NOTIFICATION_NAME: 'permission.system.notification.name',
  SYSTEM_NOTIFICATION_DESC: 'permission.system.notification.desc',
  SYSTEM_TRAY_NAME: 'permission.system.tray.name',
  SYSTEM_TRAY_DESC: 'permission.system.tray.desc',

  // AI permissions
  AI_BASIC_NAME: 'permission.ai.basic.name',
  AI_BASIC_DESC: 'permission.ai.basic.desc',
  AI_ADVANCED_NAME: 'permission.ai.advanced.name',
  AI_ADVANCED_DESC: 'permission.ai.advanced.desc',
  AI_AGENTS_NAME: 'permission.ai.agents.name',
  AI_AGENTS_DESC: 'permission.ai.agents.desc',

  // Storage permissions
  STORAGE_PLUGIN_NAME: 'permission.storage.plugin.name',
  STORAGE_PLUGIN_DESC: 'permission.storage.plugin.desc',
  STORAGE_SHARED_NAME: 'permission.storage.shared.name',
  STORAGE_SHARED_DESC: 'permission.storage.shared.desc',

  // Window permissions
  WINDOW_CREATE_NAME: 'permission.window.create.name',
  WINDOW_CREATE_DESC: 'permission.window.create.desc',
  WINDOW_CAPTURE_NAME: 'permission.window.capture.name',
  WINDOW_CAPTURE_DESC: 'permission.window.capture.desc',

  // UI messages
  GRANT: 'permission.grant',
  REVOKE: 'permission.revoke',
  GRANTED: 'permission.granted',
  DENIED: 'permission.denied',
  REQUIRED: 'permission.required',
  OPTIONAL: 'permission.optional',
  ALLOW_ONCE: 'permission.allowOnce',
  ALLOW_ALWAYS: 'permission.allowAlways',
  REQUEST_TITLE: 'permission.requestTitle',
  REQUEST_DESC: 'permission.requestDesc',
  ENFORCEMENT_DISABLED: 'permission.enforcementDisabled',
  LEGACY_PLUGIN_WARNING: 'permission.legacyPluginWarning',
} as const

/**
 * Widget related message keys
 */
export const WidgetKeys = {
  COMPILE_FAILED: 'widget.compileFailed',
  UNSUPPORTED_TYPE: 'widget.unsupportedType',
  INVALID_DEPENDENCY: 'widget.invalidDependency',
  LOAD_FAILED: 'widget.loadFailed',
} as const

/**
 * System related message keys
 */
export const SystemKeys = {
  NETWORK_ERROR: 'system.networkError',
  TIMEOUT: 'system.timeout',
  UNKNOWN_ERROR: 'system.unknownError',
  OPERATION_CANCELLED: 'system.operationCancelled',
} as const

/**
 * All message keys
 */
export const MessageKeys = {
  devServer: DevServerKeys,
  flowTransfer: FlowTransferKeys,
  plugin: PluginKeys,
  permission: PermissionKeys,
  widget: WidgetKeys,
  system: SystemKeys,
} as const

/**
 * Create i18n message string
 * @param key Message key (e.g., 'devServer.disconnected')
 * @returns Formatted i18n message (e.g., '$i18n:devServer.disconnected')
 */
export function i18nMsg(key: string): string {
  return `${I18N_PREFIX}${key}`
}

/**
 * Create i18n message with parameters
 * @param key Message key
 * @param params Parameters to pass to the message
 * @returns Formatted i18n message with params
 *
 * @example
 * i18nMsgWithParams('plugin.loadFailed', { name: 'my-plugin' })
 * // => '$i18n:plugin.loadFailed|{"name":"my-plugin"}'
 */
export function i18nMsgWithParams(key: string, params: Record<string, unknown>): string {
  return `${I18N_PREFIX}${key}|${JSON.stringify(params)}`
}

/**
 * Check if a string is an i18n message
 */
export function isI18nMessage(str: string): boolean {
  return str.startsWith(I18N_PREFIX)
}

/**
 * Parse i18n message to extract key and params
 */
export function parseI18nMessage(str: string): { key: string, params?: Record<string, unknown> } | null {
  if (!isI18nMessage(str)) {
    return null
  }

  const content = str.slice(I18N_PREFIX.length)
  const pipeIndex = content.indexOf('|')

  if (pipeIndex === -1) {
    return { key: content }
  }

  const key = content.slice(0, pipeIndex)
  try {
    const params = JSON.parse(content.slice(pipeIndex + 1))
    return { key, params }
  }
  catch {
    return { key }
  }
}

export type DevServerKey = typeof DevServerKeys[keyof typeof DevServerKeys]
export type FlowTransferKey = typeof FlowTransferKeys[keyof typeof FlowTransferKeys]
export type PluginKey = typeof PluginKeys[keyof typeof PluginKeys]
export type PermissionKey = typeof PermissionKeys[keyof typeof PermissionKeys]
export type WidgetKey = typeof WidgetKeys[keyof typeof WidgetKeys]
export type SystemKey = typeof SystemKeys[keyof typeof SystemKeys]
