import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import enUS from '../renderer/src/modules/lang/en-US.json'
import zhCN from '../renderer/src/modules/lang/zh-CN.json'
import * as coreBoxShortcut from './corebox-shortcut'

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every surface that prints the key that opens CoreBox. Each reads the live binding, or the stored
 * one; none may spell ⌘E / Ctrl+E, the default CoreBox moved away from and never falls back to.
 */
const DISPLAY_PATHS = [
  'main/modules/tray/tray-menu-builder.ts',
  'renderer/src/modules/shortcuts/useCoreBoxShortcut.ts',
  'renderer/src/modules/shortcuts/main-window-command-catalog.ts',
  'renderer/src/components/shell/MainWindowCommandPalette.vue',
  'renderer/src/components/shell/ShellSidebar.vue',
  'renderer/src/components/shell/ShellSearchEntry.vue',
  'renderer/src/views/base/begin/internal/Done.vue',
  'renderer/src/views/base/begin/internal/components/BeginShortcutKey.vue',
  'renderer/src/views/base/settings/SettingTools.vue',
  'renderer/src/views/base/settings/components/ShortcutDialogRow.vue'
]

/** ⌘E / Ctrl+E as a key cap, a label or an Electron accelerator, and the in-window `KeyE` chord. */
const OLD_KEY =
  /⌘\s*\+?\s*E\b|\bCtrl\s*\+?\s*E\b|\b(?:CommandOrControl|CmdOrCtrl|Command|Cmd|Control)\+E\b|code:\s*'KeyE'/

/** The copy those surfaces print around the key. */
function coreBoxShortcutCopy(locale: unknown): Record<string, unknown> {
  const messages = locale as {
    notifications: Record<string, string>
    beginner: { done: { shortcut: Record<string, string> } }
    settingTools: {
      shortcutStatus: Record<string, string>
      shortcutLabels: Record<string, string>
    }
    shortcuts: { commands: Record<string, string> }
    tray: Record<string, string>
  }
  return {
    notifications: Object.fromEntries(
      Object.entries(messages.notifications).filter(([key]) => key.startsWith('coreBoxShortcut'))
    ),
    onboarding: messages.beginner.done.shortcut,
    settingsStatus: messages.settingTools.shortcutStatus,
    settingsLabel: messages.settingTools.shortcutLabels.core_box_toggle,
    commandWindow: messages.shortcuts.commands.openCoreBox,
    tray: messages.tray.openCoreBox
  }
}

describe('The key that opens CoreBox', () => {
  it('has one default, the old one to move away from, and no stand-in', () => {
    expect(coreBoxShortcut.COREBOX_TOGGLE_DEFAULT_ACCELERATOR).toBe('Alt+Space')
    expect(coreBoxShortcut.COREBOX_TOGGLE_LEGACY_DEFAULT_ACCELERATORS).toEqual([
      'CommandOrControl+E'
    ])
    expect(Object.keys(coreBoxShortcut).sort()).toEqual([
      'COREBOX_TOGGLE_DEFAULT_ACCELERATOR',
      'COREBOX_TOGGLE_LEGACY_DEFAULT_ACCELERATORS',
      'COREBOX_TOGGLE_SHORTCUT_ID'
    ])
  })

  it.each(DISPLAY_PATHS)('is never spelled as the old ⌘E in %s', (path) => {
    expect(readFileSync(resolve(src, path), 'utf8')).not.toMatch(OLD_KEY)
  })

  it.each([
    ['zh-CN', zhCN],
    ['en-US', enUS]
  ])('is never spelled as the old ⌘E in the %s copy around it', (_, locale) => {
    expect(JSON.stringify(coreBoxShortcutCopy(locale))).not.toMatch(OLD_KEY)
  })
})
