import { describe, expect, it } from 'vitest'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

/**
 * The settings shortcut list names each row by `settingTools.shortcutLabels.<id>`, with the id's
 * `.`, `:` and `-` turned into `_` (`getShortcutLabel` in SettingTools.vue), and falls back to the
 * raw id when the label is missing -- which is how the screenshot row came to read
 * `screenshot.tool.start`, and the local AI row `local-ai-cli.quick-open`.
 *
 * These are the built-in shortcuts that row list shows. App launches and DivisionBox mappings are
 * named by what they launch and are not listed.
 */
const BUILT_IN_SHORTCUT_IDS = [
  'core.box.toggle',
  'core.omniPanel.toggle',
  'core.omniPanel.mouseLongPress',
  'local-ai-cli.quick-open',
  'screenshot.tool.start',
  'voice.dictation.toggle',
  'voice.quickEdit'
]

function labels(locale: unknown): Record<string, unknown> {
  return (locale as { settingTools: { shortcutLabels: Record<string, unknown> } }).settingTools
    .shortcutLabels
}

describe('built-in shortcut labels', () => {
  it.each([
    ['zh-CN', zhCN],
    ['en-US', enUS]
  ])('%s names every built-in shortcut instead of showing its id', (_locale, messages) => {
    for (const id of BUILT_IN_SHORTCUT_IDS) {
      const label = labels(messages)[id.replace(/[.:\-]/g, '_')]
      expect(typeof label === 'string' && label.trim().length > 0, id).toBe(true)
    }
  })
})
