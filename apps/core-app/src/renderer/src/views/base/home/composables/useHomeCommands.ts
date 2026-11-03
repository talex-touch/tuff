import type { Ref } from 'vue'
import { onBeforeUnmount, watch } from 'vue'
import type { MainWindowCommandHandler } from '~/modules/shortcuts/main-window-shortcuts'
import { registerMainWindowCommandHandlers } from '~/modules/shortcuts/main-window-shortcuts'

export interface HomeCommandsOptions {
  /** Whether Home is the page on screen; every command is gated on it. */
  isHomeRoute: Ref<boolean>
  browserLanding: () => boolean
  panelOpen: Ref<boolean>
  focusComposer: () => void
  /** Whether a send, or ending a dictation, is on offer. */
  canSend: () => boolean
  send: () => void | Promise<void>
  isStreaming: () => boolean
  stop: () => void
}

/**
 * The composer's commands, registered while this page is alive.
 *
 * Their handlers are the page's state — the panel, the draft, the running turn — so they are
 * registered here rather than in the shell's list, which cannot reach any of it. Two consequences
 * worth stating: the rows disappear when the page unmounts, and every one of them is gated on the
 * Home route being visible, because the shell keeps this page alive while the user is in Settings
 * and an enabled-looking row that quietly toggles an off-screen panel is a lie.
 */
export function useHomeCommands(options: HomeCommandsOptions): void {
  const handlers: MainWindowCommandHandler[] = [
    {
      id: 'toggle-panel',
      enabled: () => options.isHomeRoute.value && !options.browserLanding(),
      run: () => {
        options.panelOpen.value = !options.panelOpen.value
      }
    },
    {
      id: 'focus-composer',
      enabled: () => options.isHomeRoute.value,
      run: options.focusComposer
    },
    {
      id: 'send',
      enabled: () => options.isHomeRoute.value && options.canSend(),
      run: options.send
    },
    {
      id: 'stop',
      enabled: () => options.isHomeRoute.value && options.isStreaming(),
      run: options.stop
    }
  ]

  let dispose: (() => void) | undefined
  watch(
    options.isHomeRoute,
    (visible) => {
      dispose?.()
      dispose = visible ? registerMainWindowCommandHandlers(handlers) : undefined
    },
    { immediate: true }
  )
  onBeforeUnmount(() => dispose?.())
}
