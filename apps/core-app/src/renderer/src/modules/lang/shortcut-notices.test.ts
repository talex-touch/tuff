import { describe, expect, it } from 'vitest'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

/**
 * CoreBox's notice goes out, once per launch, when ⌥Space cannot be had. No other key stands in, so
 * the copy says CoreBox has no key and why:
 *
 * - The OS refused it. What a refusal means depends on the platform: Windows refuses a key another
 *   app holds, while macOS registers it anyway and only refuses a key this process already holds.
 *   The copy has to be true on both, so it says the key could not be registered and names no cause.
 * - It lost an in-app conflict, so another Tuff shortcut holds it, never another app. That copy
 *   says it is assigned to another shortcut, and the named variant says which one.
 */
const NOTICE_KEYS = [
  'coreBoxShortcutUnavailableTitle',
  'coreBoxShortcutRefusedBody',
  'coreBoxShortcutConflictBody',
  'coreBoxShortcutConflictNamedBody'
]
const BODY_KEYS = NOTICE_KEYS.filter((key) => key.endsWith('Body'))

const LOCALES = [
  ['zh-CN', zhCN],
  ['en-US', enUS]
] as const

function notices(locale: unknown): Record<string, string> {
  return (locale as { notifications: Record<string, string> }).notifications
}

describe('CoreBox shortcut notices', () => {
  it.each([
    ['zh-CN', zhCN, /其他应用|别的应用|占用/],
    ['en-US', enUS, /another app|already used|taken|in use/i]
  ])('%s says why CoreBox has no key, without blaming another app', (_, messages, cause) => {
    for (const key of NOTICE_KEYS) {
      expect(notices(messages)[key], key).not.toMatch(cause)
    }
  })

  it.each(LOCALES)(
    '%s names the default in every body, and the other shortcut when it can',
    (_, messages) => {
      for (const key of BODY_KEYS) {
        expect(notices(messages)[key], key).toContain('{shortcut}')
      }
      expect(notices(messages).coreBoxShortcutConflictNamedBody).toContain('{other}')
      expect(notices(messages).coreBoxShortcutRefusedBody).not.toContain('{other}')
      expect(notices(messages).coreBoxShortcutConflictBody).not.toContain('{other}')
    }
  )

  it.each(LOCALES)('%s offers no stand-in key', (_, messages) => {
    // The ⌘E stand-in is gone, and its notice and its settings line with it.
    const coreBoxNotices = Object.keys(notices(messages)).filter((key) =>
      key.startsWith('coreBoxShortcut')
    )
    expect(coreBoxNotices.sort()).toEqual([...NOTICE_KEYS].sort())
    for (const key of NOTICE_KEYS) {
      expect(notices(messages)[key], key).not.toContain('{fallback}')
      expect(notices(messages)[key], key).not.toMatch(/⌘\s*E\b|Ctrl\s*\+?\s*E\b/)
    }
    expect(
      (messages as { settingTools: { shortcutStatus: Record<string, string> } }).settingTools
        .shortcutStatus
    ).not.toHaveProperty('fallbackInUse')
  })
})
