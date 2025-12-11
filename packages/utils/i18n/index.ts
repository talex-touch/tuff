/**
 * I18n Utilities
 *
 * Shared i18n utilities for backend-frontend communication.
 *
 * ## Backend Usage (Main Process)
 * ```typescript
 * import { i18nMsg, DevServerKeys } from '@talex-touch/utils/i18n'
 *
 * // Send i18n message to frontend
 * win.webContents.send('notification', {
 *   message: i18nMsg(DevServerKeys.DISCONNECTED)
 * })
 * ```
 *
 * ## Frontend Usage (Renderer)
 * ```typescript
 * import { resolveI18nMessage, i18nResolver } from '@talex-touch/utils/i18n'
 *
 * // Set locale
 * i18nResolver.setLocale('zh')
 *
 * // Resolve message
 * const text = resolveI18nMessage('$i18n:devServer.disconnected')
 * // => '开发服务器已断开'
 * ```
 */

// Message keys and utilities for backend
export {
  I18N_PREFIX,
  DevServerKeys,
  FlowTransferKeys,
  PluginKeys,
  WidgetKeys,
  SystemKeys,
  MessageKeys,
  i18nMsg,
  i18nMsgWithParams,
  isI18nMessage,
  parseI18nMessage,
  type DevServerKey,
  type FlowTransferKey,
  type PluginKey,
  type WidgetKey,
  type SystemKey
} from './message-keys'

// Resolver for frontend
export {
  I18nResolver,
  i18nResolver,
  resolveI18nMessage,
  createI18nMessage,
  useI18nResolver,
  type MessageLocale,
  type Messages
} from './resolver'

// Locale data
export { default as enMessages } from './locales/en.json'
export { default as zhMessages } from './locales/zh.json'
