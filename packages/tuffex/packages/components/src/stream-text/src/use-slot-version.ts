import type { Ref } from 'vue'
import { onBeforeUpdate, shallowRef } from 'vue'

/**
 * Counts changes to a component's slots. A functional body that renders the
 * host's slots re-renders only when its props change, so a body given this
 * count as a prop follows a host that swaps, adds or removes a slot, while an
 * update that leaves the slots alone (the stream's own ticks) moves nothing.
 */
export function useSlotVersion(slots: Record<string, unknown>): Readonly<Ref<number>> {
  const version = shallowRef(0)
  let seen = { ...slots }
  onBeforeUpdate(() => {
    const names = new Set([...Object.keys(seen), ...Object.keys(slots)])
    for (const name of names) {
      if (seen[name] !== slots[name]) {
        seen = { ...slots }
        version.value++
        return
      }
    }
  })
  return version
}
