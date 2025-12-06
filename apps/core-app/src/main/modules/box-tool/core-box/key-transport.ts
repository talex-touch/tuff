import { ChannelType } from '@talex-touch/utils/channel'
import { createLogger } from '../../../utils/logger'
import { windowManager } from './window'
import { coreBoxTransport } from './transport/core-box-transport'
import { coreBoxManager } from './manager'

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

const keyTransportLog = createLogger('CoreBox').child('KeyTransport')

/**
 * Handles keyboard event forwarding from CoreBox renderer to plugin UI views.
 *
 * This transport registers IPC channels for:
 * - Forwarding keyboard events to the active plugin UI view
 * - Querying the current UI view state
 */
class CoreBoxKeyTransport {
  private static instance: CoreBoxKeyTransport

  /**
   * Gets the singleton instance of CoreBoxKeyTransport.
   */
  public static getInstance(): CoreBoxKeyTransport {
    if (!CoreBoxKeyTransport.instance) {
      CoreBoxKeyTransport.instance = new CoreBoxKeyTransport()
    }
    return CoreBoxKeyTransport.instance
  }

  /**
   * Registers IPC channels for keyboard event handling.
   */
  public register(): void {
    coreBoxTransport.register<ForwardedKeyEvent>(
      ChannelType.MAIN,
      'core-box:forward-key-event',
      (data) => this.handleKeyEvent(data)
    )

    coreBoxTransport.register<void>(
      ChannelType.MAIN,
      'core-box:get-ui-view-state',
      () => this.getUIViewState()
    )

    keyTransportLog.info('Key transport channels registered')
  }

  /**
   * Handles incoming keyboard events from the renderer process.
   *
   * @param event - The forwarded keyboard event data
   */
  private handleKeyEvent(event: ForwardedKeyEvent): void {
    if (!windowManager.isUIViewActive()) {
      keyTransportLog.debug('Key event ignored: no active UI view')
      return
    }

    keyTransportLog.debug(`Forwarding key: ${event.key}`)
    windowManager.forwardKeyEvent(event)
  }

  /**
   * Returns the current UI view state.
   *
   * @returns The UI view state including active, focused, and UI mode flags
   */
  private getUIViewState(): UIViewStateResponse {
    return {
      isActive: windowManager.isUIViewActive(),
      isFocused: windowManager.isUIViewFocused(),
      isUIMode: coreBoxManager.isUIMode
    }
  }
}

export const coreBoxKeyTransport = CoreBoxKeyTransport.getInstance()
