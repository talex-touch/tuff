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

// Locale data
export { default as enMessages } from './locales/en.json'

export { default as zhMessages } from './locales/zh.json'

// Message keys and utilities for backend
export {
  type DevServerKey,
  DevServerKeys,
  type FlowTransferKey,
  FlowTransferKeys,
  I18N_PREFIX,
  i18nMsg,
  i18nMsgWithParams,
  isI18nMessage,
  MessageKeys,
  parseI18nMessage,
  type PluginKey,
  PluginKeys,
  type SystemKey,
  SystemKeys,
  type WidgetKey,
  WidgetKeys,
} from './message-keys'
// Resolver for frontend
export {
  createI18nMessage,
  I18nResolver,
  i18nResolver,
  type MessageLocale,
  type Messages,
  resolveI18nMessage,
  useI18nResolver,
} from './resolver'
