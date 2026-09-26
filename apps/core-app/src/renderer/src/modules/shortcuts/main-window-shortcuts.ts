import type {
  MainWindowCommandDescriptor,
  MainWindowCommandId
} from './main-window-command-catalog'
import { computed, ref, shallowRef } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { MAIN_WINDOW_COMMAND_CATALOG, PALETTE_COMMAND_ID } from './main-window-command-catalog'
import { commandModifierHeld, shortcutChordMatches } from './shortcut-chord'

/**
 * The MainWindow shortcut layer: which chords are live, which are being held down, and whether the
 * command window is open.
 *
 * Module-level state rather than a per-call composable — the badges live in the sidebar, the top
 * bar and the composer, and each one has to see the same "⌘ is down" — the same reason
 * `useShellSidebar` keeps its drag state at module scope.
 */

const layerLog = createRendererLogger('MainWindowShortcuts')

/** A catalog row plus the handler its owning surface registered. */
export interface MainWindowCommand extends MainWindowCommandDescriptor {
  /** Missing means always runnable. Read during the palette's render, so it may be reactive. */
  enabled?: () => boolean
  run: () => void | Promise<void>
}

export interface MainWindowCommandHandler {
  id: MainWindowCommandId
  enabled?: () => boolean
  run: () => void | Promise<void>
}

const handlers = shallowRef<ReadonlyMap<MainWindowCommandId, MainWindowCommandHandler>>(new Map())

/**
 * Handlers for ids this surface owns. Keyed by id because registration is dynamic — a surface
 * mounts, another unmounts, and both may own an id — which a literal table cannot express.
 *
 * The returned disposer removes only the handlers *this* call installed: a later registration of
 * the same id (a remount while the old one is still tearing down) must survive the older call's
 * cleanup, or the command silently stops working.
 */
export function registerMainWindowCommandHandlers(
  list: readonly MainWindowCommandHandler[]
): () => void {
  const next = new Map(handlers.value)
  for (const handler of list) next.set(handler.id, handler)
  handlers.value = next

  return () => {
    const pruned = new Map(handlers.value)
    for (const handler of list) {
      if (pruned.get(handler.id) === handler) pruned.delete(handler.id)
    }
    handlers.value = pruned
  }
}

/** Catalog rows that currently have a handler, in catalog order. */
export const mainWindowCommands = computed<readonly MainWindowCommand[]>(() => {
  const registered = handlers.value
  return MAIN_WINDOW_COMMAND_CATALOG.flatMap((descriptor) => {
    const handler = registered.get(descriptor.id)
    return handler ? [{ ...descriptor, enabled: handler.enabled, run: handler.run }] : []
  })
})

/** Whether the platform's command key is down right now. */
const commandKeyHeld = ref(false)

/** Whether the command window is open. */
export const mainWindowPaletteOpen = ref(false)

/**
 * Hint badges show while the command key is held *and* nothing is covering the window: inside the
 * command window the chords are already written on every row, so the badges would be noise on top
 * of them.
 */
export const mainWindowHintsVisible = computed(
  () => commandKeyHeld.value && !mainWindowPaletteOpen.value
)

export function closeMainWindowPalette(): void {
  mainWindowPaletteOpen.value = false
}

export function toggleMainWindowPalette(): void {
  mainWindowPaletteOpen.value = !mainWindowPaletteOpen.value
}

/**
 * Runs one command by id. Failures are reported here rather than thrown: every caller is either a
 * capture-phase key handler or a row click, and neither has anywhere to surface a rejection.
 */
export async function runMainWindowCommand(id: string): Promise<void> {
  const command = mainWindowCommands.value.find((candidate) => candidate.id === id)
  if (!command) {
    layerLog.warn('Ignored an unknown command', { id })
    return
  }
  if (command.enabled && !command.enabled()) return

  try {
    await command.run()
  } catch (error) {
    layerLog.error('Command failed', { id, error })
  }
}

export interface MainWindowShortcutCaptureOptions {
  /** The platform, read at event time: a window opened on one display still reports one platform. */
  isMac: () => boolean
}

/**
 * Listens once for the whole MainWindow and turns chords into commands.
 *
 * Capture phase on `window`, so a chord wins over the focused field (⌘N in the composer is "new
 * conversation", not a keystroke the textarea should see) and `stopPropagation` keeps the losing
 * handler from also acting on it — without that, ⌘↵ would send twice: once from here and once from
 * the composer's own Enter handler.
 */
export function installMainWindowShortcutCapture(
  options: MainWindowShortcutCaptureOptions
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const isMac = options.isMac()

    if (event.key === 'Meta' || event.key === 'Control') {
      commandKeyHeld.value = true
      return
    }
    // A chord arriving with its modifier already down means the key went down before this window
    // had focus (⌘-Tab back into the app): the hold never announced itself, so adopt it here.
    if (commandModifierHeld(event, isMac)) commandKeyHeld.value = true

    // Held-down auto-repeat must not re-run a command a dozen times.
    if (event.repeat) return

    const command = mainWindowCommands.value.find(
      (candidate) => candidate.chord !== null && shortcutChordMatches(event, candidate.chord, isMac)
    )
    if (!command) return

    event.preventDefault()
    event.stopPropagation()
    // A chord pressed from inside the command window replaces it, except the one that toggles it.
    if (mainWindowPaletteOpen.value && command.id !== PALETTE_COMMAND_ID) closeMainWindowPalette()
    void runMainWindowCommand(command.id)
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Meta' || event.key === 'Control') commandKeyHeld.value = false
  }

  /**
   * The release that never arrives: ⌘-Tab to another app, a mission-control swipe, a locked screen.
   * Without these the badges stay up over an app that is no longer listening.
   */
  const releaseCommandKey = (): void => {
    commandKeyHeld.value = false
  }
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') releaseCommandKey()
  }

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', releaseCommandKey)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', releaseCommandKey)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    releaseCommandKey()
  }
}
