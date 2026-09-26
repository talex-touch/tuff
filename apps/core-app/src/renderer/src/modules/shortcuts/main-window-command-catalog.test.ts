// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { COREBOX_TOGGLE_SHORTCUT_ID } from '../../../../shared/corebox-shortcut'
import {
  MAIN_WINDOW_COMMAND_CATALOG,
  mainWindowCommandChordLabel
} from './main-window-command-catalog'
import {
  installMainWindowShortcutCapture,
  registerMainWindowCommandHandlers
} from './main-window-shortcuts'

/**
 * Open CoreBox has no in-window chord. CoreBox's global key (⌥Space by default) already fires while
 * the main window is focused, and the ⌘E this window used to bind taught a second key: the very one
 * CoreBox moved away from.
 */
describe('Open CoreBox in the main window', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
  })

  it('runs on CoreBox’s global key, with no chord or hint badge of its own', () => {
    const command = MAIN_WINDOW_COMMAND_CATALOG.find((candidate) => candidate.id === 'open-corebox')

    expect(command?.chord).toBeNull()
    expect(command?.globalShortcutId).toBe(COREBOX_TOGGLE_SHORTCUT_ID)
    expect(mainWindowCommandChordLabel('open-corebox', true)).toBeNull()
    expect(mainWindowCommandChordLabel('open-corebox', false)).toBeNull()
  })

  it.each([
    ['macOS', true, { metaKey: true }],
    ['Windows and Linux', false, { ctrlKey: true }]
  ])('leaves the old ⌘E / Ctrl+E to the focused field on %s', (_, isMac, modifier) => {
    const openCoreBox = vi.fn()
    const openSettings = vi.fn()
    disposers.push(
      registerMainWindowCommandHandlers([
        { id: 'open-corebox', run: openCoreBox },
        { id: 'open-settings', run: openSettings }
      ]),
      installMainWindowShortcutCapture({ isMac: () => isMac })
    )

    const oldKey = new KeyboardEvent('keydown', {
      key: 'e',
      code: 'KeyE',
      cancelable: true,
      ...modifier
    })
    window.dispatchEvent(oldKey)
    // The capture still runs the chords it has: ⌘, / Ctrl+, opens settings.
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: ',', code: 'Comma', cancelable: true, ...modifier })
    )

    expect(openCoreBox).not.toHaveBeenCalled()
    expect(oldKey.defaultPrevented).toBe(false)
    expect(openSettings).toHaveBeenCalledTimes(1)
  })
})
