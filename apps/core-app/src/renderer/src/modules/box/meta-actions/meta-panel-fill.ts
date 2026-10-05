import type { CoreBoxMetaOverlayPanelStatePayload } from '@talex-touch/utils/transport/events/types'
import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount, readonly, shallowRef } from 'vue'

/*
 * `useMetaPanelState`, the ⌘K panel's state as CoreBox paints for it. Named after `fill`, the half
 * it started with; `blur` joined it when the Flow page moved into the card.
 */

export interface MetaPanelState {
  /**
   * Whether CoreBox paints everything under its header solid, because main grew the window to
   * fit the ⌘K panel.
   *
   * CoreBox has no surface of its own: its one layer of paint is the 75% `--tx-fill-color` mask
   * over the window material (vibrancy on macOS, Mica on Windows), so empty space shows a blur of
   * the desktop behind CoreBox. Growing the window adds exactly that under the results, and the
   * panel's 10% dim does not cover it. The paint follows `grown`, which main raises before the
   * window grows and, with an animated restore, lowers only once the window is back — after the
   * panel itself has closed.
   */
  fill: Readonly<Ref<boolean>>
  /**
   * Whether CoreBox blurs its own content, because the card shows a Flow page over it: the
   * targets read clearly over a launcher out of focus. Never set while the panel is closed.
   */
  blur: Readonly<Ref<boolean>>
}

/**
 * Main publishes the panel state on every change (`CoreBoxEvents.metaOverlay.panelState`).
 * Anything malformed reads as closed: neither filled nor blurred.
 */
export function useMetaPanelState(): MetaPanelState {
  const transport = useTuffTransport()
  const fill = shallowRef(false)
  const blur = shallowRef(false)

  const dispose = transport.on(
    CoreBoxEvents.metaOverlay.panelState,
    (state: CoreBoxMetaOverlayPanelStatePayload) => {
      const valid = typeof state?.visible === 'boolean'
      fill.value = valid && state.grown === true
      blur.value = valid && state.visible && state.blur === true
    }
  )
  onBeforeUnmount(dispose)

  return { fill: readonly(fill), blur: readonly(blur) }
}
