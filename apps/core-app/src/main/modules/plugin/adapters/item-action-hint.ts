import { getLogger } from '@talex-touch/utils/common/logger'
import { I18nResolver, isI18nMessage, parseI18nMessage } from '@talex-touch/utils/i18n'
import { getLocale, t } from '../../../utils/i18n-helper'
import { notificationModule } from '../../notification'

const hintLog = getLogger('plugin-system')

const MAX_MESSAGE_CHARS = 200
const MAX_NAME_CHARS = 60

/** One line of plain text from untrusted input: controls and invisible marks go, whitespace folds, length is capped. */
function toNotificationText(value: string, maxChars: number): string {
  const text = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[\p{Cf}\p{Cs}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  let kept = ''
  let count = 0
  for (const char of text) {
    if (count === maxChars) return `${kept.trimEnd()}…`
    kept += char
    count += 1
  }
  return kept
}

/** A `$i18n:` message resolves against the host's own messages; an unknown key is not a message. */
function resolveMessageText(raw: string): string | null {
  if (!isI18nMessage(raw)) return raw

  const resolver = new I18nResolver()
  resolver.setLocale(getLocale())
  const resolved = resolver.resolve(raw)
  return resolved === parseI18nMessage(raw)?.key ? null : resolved
}

export interface ItemActionHint {
  level: 'success' | 'error'
  message: string
}

/** The plugin's `message` as text safe to show, or null when the result carries none. */
export function readItemActionHint(result: unknown, failed: boolean): ItemActionHint | null {
  if (!result || typeof result !== 'object') return null

  const raw = (result as { message?: unknown }).message
  if (typeof raw !== 'string') return null

  const resolved = resolveMessageText(raw)
  const message = resolved === null ? '' : toNotificationText(resolved, MAX_MESSAGE_CHARS)
  return message ? { level: failed ? 'error' : 'success', message } : null
}

// CoreBox hides before a plugin item action runs and mounts no toast host, so only an OS notification is seen.
export function showItemActionHint(
  plugin: { name: string; displayName?: string },
  result: unknown,
  failed: boolean
): void {
  try {
    const hint = readItemActionHint(result, failed)
    if (!hint) return

    const name =
      toNotificationText(plugin.displayName ?? '', MAX_NAME_CHARS) ||
      toNotificationText(plugin.name, MAX_NAME_CHARS)
    notificationModule.showInternalSystemNotification({
      title: failed ? t('plugin.notifications.itemActionFailedTitle', { name }) : name,
      message: hint.message,
      level: hint.level,
      system: { silent: !failed }
    })
  } catch (error) {
    hintLog.warn('[PluginFeaturesAdapter] Could not show the onItemAction message', {
      meta: {
        pluginName: plugin.name,
        errorName: error instanceof Error ? error.name : typeof error
      }
    })
  }
}
