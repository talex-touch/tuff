import type { ITuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { createCoreBoxTransport } from './core-box-transport'

/**
 * Serialized keyboard event data for IPC transport.
 */
export interface ForwardedKeyEvent {
  /** The key value (e.g., 'ArrowUp', 'Enter', 'a') */
  key: string
  /** The physical key code (e.g., 'ArrowUp', 'Enter', 'KeyA') */
  code: string
  /** Whether the Meta (Cmd on macOS) key is pressed */
  metaKey: boolean
  /** Whether the Ctrl key is pressed */
  ctrlKey: boolean
  /** Whether the Alt key is pressed */
  altKey: boolean
  /** Whether the Shift key is pressed */
  shiftKey: boolean
  /** Whether this is a repeat event from holding the key */
  repeat: boolean
}

/**
 * Response structure for UI view state queries.
 */
export interface UIViewStateResponse {
  /** Whether a UI view is currently attached */
  isActive: boolean
  /** Whether the UI view has focus */
  isFocused: boolean
  /** Whether CoreBox is in UI mode */
  isUIMode: boolean
}

/**
 * Creates a key transport instance for forwarding keyboard events to the main process.
 *
 * @param channel - The IPC channel to use for communication
 * @returns An object with methods to forward key events and query UI view state
 */
export function createCoreBoxKeyTransport(transport: ITuffTransport): {
  forwardKeyEvent: (event: ForwardedKeyEvent) => void
  getUIViewState: () => Promise<UIViewStateResponse>
} {
  const keyTransport = createCoreBoxTransport<ForwardedKeyEvent>(transport, {
    event: CoreBoxEvents.ui.forwardKeyEvent,
    debounceMs: 0
  })

  return {
    forwardKeyEvent(event: ForwardedKeyEvent) {
      keyTransport.dispatch(event)
    },

    async getUIViewState(): Promise<UIViewStateResponse> {
      try {
        const result = await transport.send(CoreBoxEvents.ui.getUIViewState)
        return result as UIViewStateResponse
      } catch {
        return { isActive: false, isFocused: false, isUIMode: false }
      }
    }
  }
}
