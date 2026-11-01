import type {
  MainWindowCommandDescriptor,
  MainWindowCommandId
} from './main-window-command-catalog'
import { computed, ref, shallowRef } from 'vue'
import { hasDocument } from '@talex-touch/utils/env'
import { createRendererLogger } from '~/utils/renderer-log'
import { MAIN_WINDOW_COMMAND_CATALOG, PALETTE_COMMAND_ID } from './main-window-command-catalog'
import { shortcutChordMatches } from './shortcut-chord'

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
export const DEFAULT_HINT_HOLD_DELAY_MS = 300
export const DEFAULT_TYPING_COOLDOWN_MS = 1000

const MODIFIER_KEYS: Record<string, true> = {
  Meta: true,
  Control: true,
  Alt: true,
  Shift: true,
  AltGraph: true,
  CapsLock: true,
  Fn: true,
  FnLock: true,
  Hyper: true,
  Super: true,
  Symbol: true,
  SymbolLock: true
}

const NON_TYPING_INPUT_TYPES: Record<string, true> = {
  button: true,
  checkbox: true,
  color: true,
  file: true,
  hidden: true,
  image: true,
  radio: true,
  range: true,
  reset: true,
  submit: true
}
export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    return !NON_TYPING_INPUT_TYPES[target.type.toLowerCase()]
  }
  if ('isContentEditable' in target && (target as HTMLElement).isContentEditable) return true
  if ('contentEditable' in target && (target as HTMLElement).contentEditable === 'true') return true
  const attr = target.getAttribute?.('contenteditable')?.toLowerCase()
  if (attr !== undefined && attr !== null && attr !== 'false') return true
  if (target.closest?.('[contenteditable]:not([contenteditable="false"])')) return true
  return false
}

let isImeComposing = false
let lastTypingTimestamp = 0

export function isUserTyping(typingCooldownMs: number = DEFAULT_TYPING_COOLDOWN_MS): boolean {
  if (isImeComposing) return true
  if (hasDocument() && isEditableElement(document.activeElement)) {
    if (Date.now() - lastTypingTimestamp < typingCooldownMs) {
      return true
    }
  }
  return false
}

export function resetMainWindowShortcutsState(): void {
  commandKeyHeld.value = false
  mainWindowPaletteOpen.value = false
  isImeComposing = false
  lastTypingTimestamp = 0
}

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
  /** Delay in milliseconds of holding the command modifier before opening shortcut hints. Defaults to 300ms. */
  hintDelayMs?: number
  /** Minimum quiet time after typing before shortcut hints are allowed. Defaults to 1000ms. */
  typingCooldownMs?: number
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
  const hintDelayMs = options.hintDelayMs ?? DEFAULT_HINT_HOLD_DELAY_MS
  const typingCooldownMs = options.typingCooldownMs ?? DEFAULT_TYPING_COOLDOWN_MS

  let hintTimer: number | NodeJS.Timeout | null = null
  let isHoldingModifier = false
  let chordPressedDuringHold = false

  const recordTyping = (): void => {
    lastTypingTimestamp = Date.now()
    if (hintTimer !== null) {
      clearTimeout(hintTimer)
      hintTimer = null
    }
    commandKeyHeld.value = false
  }

  const releaseCommandKey = (): void => {
    if (hintTimer !== null) {
      clearTimeout(hintTimer)
      hintTimer = null
    }
    isHoldingModifier = false
    chordPressedDuringHold = false
    commandKeyHeld.value = false
  }

  const onBeforeInput = (event: Event): void => {
    if (
      isEditableElement(event.target) ||
      (hasDocument() && isEditableElement(document.activeElement))
    ) {
      recordTyping()
    }
  }

  const onInput = (event: Event): void => {
    if (
      isEditableElement(event.target) ||
      (hasDocument() && isEditableElement(document.activeElement))
    ) {
      recordTyping()
    }
  }

  const onCompositionStart = (): void => {
    isImeComposing = true
    recordTyping()
  }

  const onCompositionEnd = (): void => {
    isImeComposing = false
    recordTyping()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    const isMac = options.isMac()
    const isCommandModifier = isMac ? event.key === 'Meta' : event.key === 'Control'

    if (event.isComposing || event.keyCode === 229) {
      isImeComposing = true
      recordTyping()
      return
    }

    if (!MODIFIER_KEYS[event.key]) {
      if (
        isEditableElement(event.target) ||
        (hasDocument() && isEditableElement(document.activeElement))
      ) {
        recordTyping()
      }
    }

    if (isCommandModifier) {
      if (event.repeat || isHoldingModifier) return

      isHoldingModifier = true
      chordPressedDuringHold = false

      if (hintTimer !== null) {
        clearTimeout(hintTimer)
        hintTimer = null
      }

      if (isUserTyping(typingCooldownMs)) {
        commandKeyHeld.value = false
        return
      }

      if (hintDelayMs <= 0) {
        commandKeyHeld.value = true
      } else {
        hintTimer = setTimeout(() => {
          hintTimer = null
          if (
            isHoldingModifier &&
            !chordPressedDuringHold &&
            !mainWindowPaletteOpen.value &&
            !isUserTyping(typingCooldownMs) &&
            hasDocument() &&
            document.visibilityState !== 'hidden'
          ) {
            commandKeyHeld.value = true
          }
        }, hintDelayMs)
      }
      return
    }

    if (!MODIFIER_KEYS[event.key]) {
      chordPressedDuringHold = true
      if (hintTimer !== null) {
        clearTimeout(hintTimer)
        hintTimer = null
      }
      commandKeyHeld.value = false
    }

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
    const isMac = options.isMac()
    const isCommandModifier = isMac ? event.key === 'Meta' : event.key === 'Control'
    if (isCommandModifier) {
      releaseCommandKey()
    }
  }

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') releaseCommandKey()
  }

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', releaseCommandKey)
  window.addEventListener('beforeinput', onBeforeInput, true)
  window.addEventListener('input', onInput, true)
  window.addEventListener('compositionstart', onCompositionStart, true)
  window.addEventListener('compositionend', onCompositionEnd, true)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    if (hintTimer !== null) {
      clearTimeout(hintTimer)
      hintTimer = null
    }
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', releaseCommandKey)
    window.removeEventListener('beforeinput', onBeforeInput, true)
    window.removeEventListener('input', onInput, true)
    window.removeEventListener('compositionstart', onCompositionStart, true)
    window.removeEventListener('compositionend', onCompositionEnd, true)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    releaseCommandKey()
  }
}
