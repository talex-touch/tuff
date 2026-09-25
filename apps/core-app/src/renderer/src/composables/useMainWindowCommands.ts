import type { MainWindowCommandHandler } from '~/modules/shortcuts/main-window-shortcuts'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useConversationEntry } from '~/modules/conversation/useConversationEntry'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { PALETTE_COMMAND_ID } from '~/modules/shortcuts/main-window-command-catalog'
import {
  installMainWindowShortcutCapture,
  mainWindowCommands,
  mainWindowPaletteOpen,
  registerMainWindowCommandHandlers,
  runMainWindowCommand,
  toggleMainWindowPalette
} from '~/modules/shortcuts/main-window-shortcuts'

/**
 * Installs the MainWindow command layer and registers the commands the *shell* owns: entering a
 * conversation, moving between routes, the sidebar, and the command window itself.
 *
 * Called once, from `AppShell` — the shortcut capture is a single window listener, and a second
 * copy would run every chord twice. Commands whose state belongs to a page (the composer's send,
 * the preview panel) are registered by that page instead, which is what keeps this list honest:
 * a command with no handler is never offered to the user.
 */
export function useMainWindowCommands() {
  const { isMac } = useRendererPlatform()
  const router = useRouter()
  const { enterConversation, enterPickedProjectConversation } = useConversationEntry()
  const { toggle: toggleSidebar } = useShellSidebar()
  const transport = useTuffTransport()

  const handlers: MainWindowCommandHandler[] = [
    { id: 'new-chat', run: () => enterConversation(null) },
    { id: 'new-project', run: () => enterPickedProjectConversation() },
    {
      id: 'open-corebox',
      run: async () => {
        await transport.send(CoreBoxEvents.ui.show)
      }
    },
    {
      id: 'open-store',
      run: async () => {
        await router.push('/store')
      }
    },
    {
      id: 'open-settings',
      run: async () => {
        await router.push('/setting')
      }
    },
    { id: 'toggle-sidebar', run: toggleSidebar },
    { id: PALETTE_COMMAND_ID, run: toggleMainWindowPalette }
  ]

  const disposeHandlers = registerMainWindowCommandHandlers(handlers)
  const disposeCapture = installMainWindowShortcutCapture({ isMac: () => isMac.value })

  onBeforeUnmount(() => {
    disposeCapture()
    disposeHandlers()
  })

  return {
    paletteOpen: mainWindowPaletteOpen,
    commands: mainWindowCommands,
    runCommand: runMainWindowCommand
  }
}
