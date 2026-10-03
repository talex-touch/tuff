import type { Ref } from 'vue'
import { computed, onScopeDispose, readonly, shallowRef, watch } from 'vue'

/**
 * How long the paint outlasts a released room: main animates the window back over 120–220 ms
 * (`animation.coreBoxResize`), and the strip it is taking away must not show the desktop meanwhile.
 */
const ROOM_FILL_HOLD_MS = 240

export interface FlowPanelRoom {
  /** Height the window must not go below while the Flow picker is open (CSS px); 0 once closed. */
  floor: Readonly<Ref<number>>
  /**
   * Whether the floor is what holds the window up, above the height the results want. Written by
   * `useResize` (through `useSearch`), where the results are measured.
   */
  floorApplied: Ref<boolean>
  /**
   * Whether CoreBox paints the space the floor adds: while the floor applies, and while its room is
   * handed back.
   */
  fill: Readonly<Ref<boolean>>
  /** Takes the picker's `room` event: the window height it needs while open, 0 once it closes. */
  update: (height: number) => void
}

/**
 * Window room for the Flow picker, the in-page counterpart of what main does for the ⌘K panel.
 *
 * The picker is drawn in the CoreBox window and cannot leave it, so a short result list would cut
 * it off. `floor` goes to `useResize`, which keeps the window at least that tall and reports through
 * `floorApplied` whether the floor is what holds it there; `fill` paints the space that adds
 * (`CoreBox-Wrapper--meta-fill`), which otherwise shows a blur of the desktop behind CoreBox.
 * CoreBox creates this before `useSearch`, which takes both.
 *
 * The paint follows the floor, not the window growing: picked from the ⌘K panel, the picker takes
 * over a window main grew for that panel at the height it already has, and main stops painting it
 * once it has handed the height over.
 */
export function useFlowPanelRoom(): FlowPanelRoom {
  const floor = shallowRef(0)
  const floorApplied = shallowRef(false)
  // The room a floor stops holding stays on screen while main takes the height back.
  const handingBack = shallowRef(false)
  let handBackTimer: ReturnType<typeof setTimeout> | null = null

  function cancelHandBack(): void {
    if (handBackTimer === null) return
    clearTimeout(handBackTimer)
    handBackTimer = null
  }

  // Whenever the floor stops holding the window up — released, or lowered under the results' own
  // height once the targets are known — main animates the window down over the strip it held, so
  // the paint outlasts it. A reopen during the hold leaves the hold running: the window may still be
  // going back. Synchronous, so the hold starts in the same tick as the change.
  watch(
    floorApplied,
    (applied, wasApplied) => {
      if (!wasApplied || applied) return
      cancelHandBack()
      handingBack.value = true
      handBackTimer = setTimeout(() => {
        handBackTimer = null
        handingBack.value = false
      }, ROOM_FILL_HOLD_MS)
    },
    { flush: 'sync' }
  )

  function update(height: number): void {
    const next = Number.isFinite(height) && height > 0 ? height : 0
    floor.value = next
    // No floor holds anything up. Said here as well as by `useResize`, whose next measurement can
    // still be pending, so a closed picker can never leave the paint on.
    if (next === 0) floorApplied.value = false
  }

  onScopeDispose(cancelHandBack)

  return {
    floor: readonly(floor),
    floorApplied,
    fill: computed(() => floorApplied.value || handingBack.value),
    update
  }
}
