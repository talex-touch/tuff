import type { ShortcutChord } from './shortcut-chord'
import { COREBOX_TOGGLE_SHORTCUT_ID } from '../../../../shared/corebox-shortcut'
import { shortcutChordLabel } from './shortcut-chord'

/**
 * Every command the MainWindow can run, and the chord that runs it.
 *
 * The catalog is the single source of truth for three readers that have to agree: the shortcut
 * layer (which chord fires what), the hint badges (which key to draw on a control) and the
 * command window (label, icon, group, key). A chord written twice drifts, so a badge asks this
 * table by id rather than carrying its own copy.
 *
 * It holds no handlers: the surface that owns a piece of state registers the `run` for its own
 * ids (see `main-window-shortcuts.ts`). An id with no handler is not shown anywhere, so the
 * window can never offer a row that does nothing.
 *
 * Nothing here may import Vue or the renderer's `~` alias: `uno.config.ts` reads the icon list
 * below to build its safelist.
 */

export type MainWindowCommandId =
  | 'new-chat'
  | 'new-project'
  | 'open-corebox'
  | 'open-store'
  | 'open-settings'
  | 'back-to-tuff'
  | 'toggle-sidebar'
  | 'open-palette'
  | 'toggle-panel'
  | 'focus-composer'
  | 'send'
  | 'stop'

/** Which section of the command window a row lands in. */
export type MainWindowCommandGroup = 'conversation' | 'navigate' | 'view'

/** Section order in the window. Grouping is the catalog's, not the palette's. */
export const MAIN_WINDOW_COMMAND_GROUPS: readonly MainWindowCommandGroup[] = Object.freeze([
  'conversation',
  'navigate',
  'view'
])

/** The command that toggles a command window. Named because two places test for it. */
export const PALETTE_COMMAND_ID = 'open-palette' satisfies MainWindowCommandId

export interface MainWindowCommandDescriptor {
  id: MainWindowCommandId
  /** i18n key under `renderer/src/modules/lang`. Reused names are shared with their own control. */
  labelKey: string
  /** UnoCSS icon class. UnoCSS does not extract `.ts`, so this table is safelisted in uno.config. */
  icon: string
  group: MainWindowCommandGroup
  /**
   * The in-window chord, or `null` for a command a global shortcut runs (`globalShortcutId`). The
   * global key fires while this window is focused too, so a chord of its own would only teach a
   * second key for the same command.
   */
  chord: ShortcutChord | null
  /**
   * The global shortcut that runs the command. The command window prints that key as it is bound
   * right now, and no key while none is registered; no hint badge draws it.
   */
  globalShortcutId?: typeof COREBOX_TOGGLE_SHORTCUT_ID
}

export const MAIN_WINDOW_COMMAND_CATALOG: readonly MainWindowCommandDescriptor[] = Object.freeze([
  {
    id: 'new-chat',
    labelKey: 'shell.newChat',
    icon: 'i-ri-edit-box-line',
    group: 'conversation',
    chord: { code: 'KeyN' }
  },
  {
    id: 'new-project',
    labelKey: 'shell.newProject',
    icon: 'i-ri-folder-add-line',
    group: 'conversation',
    chord: { code: 'KeyN', shift: true }
  },
  {
    id: 'focus-composer',
    labelKey: 'shortcuts.commands.focusComposer',
    icon: 'i-ri-chat-1-line',
    group: 'conversation',
    chord: { code: 'KeyL' }
  },
  {
    id: 'send',
    labelKey: 'home.send',
    icon: 'i-ri-arrow-up-line',
    group: 'conversation',
    chord: { code: 'Enter' }
  },
  {
    id: 'stop',
    labelKey: 'home.stop',
    icon: 'i-ri-stop-fill',
    group: 'conversation',
    chord: { code: 'Period' }
  },
  {
    id: 'back-to-tuff',
    // Same label as the settings back row: the palette names the control the user already knows.
    labelKey: 'settingsNav.back',
    icon: 'i-ri-arrow-left-line',
    group: 'navigate',
    chord: { code: 'BracketLeft' }
  },
  {
    id: 'open-corebox',
    labelKey: 'shortcuts.commands.openCoreBox',
    icon: 'i-ri-search-line',
    group: 'navigate',
    // CoreBox's global key (⌥Space by default) opens it from this window as well.
    chord: null,
    globalShortcutId: COREBOX_TOGGLE_SHORTCUT_ID
  },
  {
    id: 'open-store',
    labelKey: 'shell.store',
    icon: 'i-ri-store-2-line',
    group: 'navigate',
    chord: { code: 'KeyP', shift: true }
  },
  {
    id: 'open-settings',
    labelKey: 'shell.setting',
    icon: 'i-ri-settings-3-line',
    group: 'navigate',
    chord: { code: 'Comma' }
  },
  {
    id: 'toggle-sidebar',
    labelKey: 'shortcuts.commands.toggleSidebar',
    icon: 'i-ri-side-bar-line',
    group: 'view',
    chord: { code: 'KeyB' }
  },
  {
    id: 'toggle-panel',
    labelKey: 'shortcuts.commands.togglePanel',
    icon: 'i-ri-layout-right-line',
    group: 'view',
    chord: { code: 'KeyB', shift: true }
  },
  {
    id: PALETTE_COMMAND_ID,
    labelKey: 'shortcuts.palette',
    icon: 'i-ri-keyboard-line',
    group: 'view',
    chord: { code: 'Slash' }
  }
])

/**
 * Every class the catalog can render, for the UnoCSS safelist in `uno.config.ts`.
 *
 * UnoCSS's extractor scans templates, not `.ts` modules, so a class that lives only here never has
 * its CSS generated and the row renders as an empty box. Derived from the catalog so the safelist
 * cannot drift from it.
 */
export const MAIN_WINDOW_COMMAND_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(new Set(MAIN_WINDOW_COMMAND_CATALOG.map((command) => command.icon)))
)

/**
 * The badge text for one command, or `null` for an id the catalog does not know or a command with
 * no in-window chord.
 *
 * `null` rather than a fallback string: a badge is drawn from a hand-written id at each call site,
 * and a typo that rendered `undefined` on screen would look like a styling bug.
 */
export function mainWindowCommandChordLabel(id: string, isMac: boolean): string | null {
  const command = MAIN_WINDOW_COMMAND_CATALOG.find((candidate) => candidate.id === id)
  return command?.chord ? shortcutChordLabel(command.chord, isMac) : null
}
