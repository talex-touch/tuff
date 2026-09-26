import type { CoreBoxMetaOverlayPanelStatePayload } from '@talex-touch/utils/transport/events/types'
import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, readonly, shallowRef } from 'vue'

/**
 * Whether CoreBox paints everything under its header solid, because main grew the window to fit
 * the ⌘K panel.
 *
 * CoreBox has no surface of its own: its one layer of paint is the 75% `--tx-fill-color` mask
 * over the window material (vibrancy on macOS, Mica on Windows), so empty space shows a blur of
 * the desktop behind CoreBox. Growing the window adds exactly that under the results, and the
 * panel's 10% dim does not cover it. Main publishes the panel state on every change
 * (`CoreBoxEvents.metaOverlay.panelState`); the paint follows `grown`, which main raises before
 * the window grows and, with an animated restore, lowers only once the window is back — after the
 * panel itself has closed. Anything malformed reads as closed.
 */
export function useMetaPanelFill(): Readonly<Ref<boolean>> {
  const transport = useTuffTransport()
  const filled = shallowRef(false)

  const dispose = transport.on(
    CoreBoxEvents.metaOverlay.panelState,
    (state: CoreBoxMetaOverlayPanelStatePayload) => {
      filled.value = typeof state?.visible === 'boolean' && state.grown === true
    }
  )
  onBeforeUnmount(dispose)

  return readonly(filled)
}
