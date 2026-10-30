import type { Translate } from '~/modules/lang/useI18nText'

/**
 * The built-in browser's failures by the code main reports. The codes left out are internal checks
 * the page doesn't trip in use, and are shown as their code.
 */
const BROWSER_ERROR_KEYS: Readonly<Record<string, string>> = Object.freeze({
  BROWSER_DISPOSED: 'browser.errors.disposed',
  BROWSER_TAB_NOT_FOUND: 'browser.errors.tabNotFound',
  BROWSER_TAB_LIMIT: 'browser.errors.tabLimit',
  BROWSER_INPUT_INVALID: 'browser.errors.inputInvalid',
  BROWSER_URL_BLOCKED: 'browser.errors.urlBlocked',
  BROWSER_BOOKMARK_INVALID: 'browser.errors.bookmarkInvalid',
  BROWSER_BOOKMARK_LIMIT: 'browser.errors.bookmarkLimit',
  BROWSER_PERSIST_FAILED: 'browser.errors.persistFailed',
  BROWSER_LOAD_FAILED: 'browser.errors.loadFailed',
  BROWSER_RENDERER_GONE: 'browser.errors.rendererGone',
  BROWSER_POPUP_FAILED: 'browser.errors.popupFailed',
  BROWSER_COMMAND_FAILED: 'browser.errors.commandFailed'
})

/**
 * A built-in browser failure in the interface language. A transport rejection may wrap main's code
 * ("…: Error: BROWSER_TAB_LIMIT"), so the code is searched for. Text without a code is shown as it
 * came.
 */
export function describeBrowserError(raw: string | null | undefined, t: Translate): string {
  if (!raw) return ''
  const code = /\bBROWSER_[A-Z_]+\b/.exec(raw)?.[0]
  if (!code) return raw
  const key = BROWSER_ERROR_KEYS[code]
  return key ? t(key) : t('browser.errors.unknown', { code })
}
