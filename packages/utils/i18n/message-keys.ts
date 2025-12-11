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
export function parseI18nMessage(str: string): { key: string; params?: Record<string, unknown> } | null {
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
  } catch {
    return { key }
  }
}

export type DevServerKey = typeof DevServerKeys[keyof typeof DevServerKeys]
export type FlowTransferKey = typeof FlowTransferKeys[keyof typeof FlowTransferKeys]
export type PluginKey = typeof PluginKeys[keyof typeof PluginKeys]
export type WidgetKey = typeof WidgetKeys[keyof typeof WidgetKeys]
export type SystemKey = typeof SystemKeys[keyof typeof SystemKeys]
