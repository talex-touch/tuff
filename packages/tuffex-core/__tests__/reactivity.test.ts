import { describe, expect, it, vi } from 'vitest'
import { computed, createSignal, effectScope, ref, watchSignal } from '../src/reactivity'

describe('reactivity primitives', () => {
  it('createSignal tracks reads, functional updates, and subscriptions', () => {
    const count = createSignal(1)
    const seen: Array<[number, number]> = []
    const off = count.subscribe((next, prev) => seen.push([next, prev]))

    expect(count.value).toBe(1)
    expect(count.get()).toBe(1)
    expect(count.peek()).toBe(1)

    count.set(2)
    count.set(2) // Object.is no-op
    count.set(prev => prev + 3)
    expect(count.value).toBe(5)
    expect(seen).toEqual([[2, 1], [5, 2]])

    off()
    count.set(10)
    expect(seen).toHaveLength(2)
  })

  it('watchSignal works with computed derivations and cleans up on effectScope stop', () => {
    const source = ref(2)
    const doubled = computed(() => source.value * 2)
    const spy = vi.fn()

    const scope = effectScope()
    scope.run(() => {
      watchSignal(() => doubled.value, spy, { immediate: true })
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith(4, undefined)

    source.value = 5
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenLastCalledWith(10, 4)

    scope.stop()
    source.value = 9
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
