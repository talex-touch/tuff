// @vitest-environment jsdom
import type { MotionGate } from './useMotionGate'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick } from 'vue'
import { useMotionGate } from './useMotionGate'

type BatteryPayload = { onBattery?: boolean; percent?: number | null }

const state = vi.hoisted(() => ({
  appSetting: { animation: { autoDisableOnLowBattery: true } },
  /** The battery-status listener the optimizer registered on the transport, while mounted. */
  sendBatteryStatus: null as ((payload: BatteryPayload) => void) | null
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (_event: unknown, listener: (payload: BatteryPayload) => void) => {
      state.sendBatteryStatus = listener
      return () => {
        state.sendBatteryStatus = null
      }
    }
  })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useSettingsSdk: () => ({
    deviceIdle: { getSettings: async () => ({ blockBatteryBelowPercent: 20 }) }
  })
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting: state.appSetting }))

let unmountProbe: (() => void) | null = null

function mountGate(): MotionGate {
  let gate: MotionGate | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        gate = useMotionGate()
        return () => h('div')
      }
    })
  )
  unmountProbe = () => wrapper.unmount()
  if (!gate) throw new Error('useMotionGate did not run')
  return gate
}

/** A `prefers-reduced-motion` media query whose answer the test can change. */
function stubReducedMotion(matches: boolean): { change: (next: boolean) => void } {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.delete(listener)
  }
  vi.stubGlobal('matchMedia', () => query)
  return {
    change(next) {
      query.matches = next
      for (const listener of listeners) listener({ matches: next })
    }
  }
}

afterEach(() => {
  // The battery status is module state in the optimizer: plug back in before the next test.
  state.sendBatteryStatus?.({ onBattery: false, percent: 100 })
  unmountProbe?.()
  unmountProbe = null
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-low-battery-motion')
})

describe('useMotionGate', () => {
  it('lets script motion run when neither switch is on', async () => {
    const gate = mountGate()
    await nextTick()

    expect(gate.shouldAnimate()).toBe(true)
    expect(document.documentElement.hasAttribute('data-low-battery-motion')).toBe(false)
  })

  it('stops script motion and sets the low-battery attribute on the window it runs in', async () => {
    const gate = mountGate()
    const animated = computed(() => gate.shouldAnimate())
    expect(animated.value).toBe(true)

    state.sendBatteryStatus?.({ onBattery: true, percent: 12 })
    await nextTick()

    expect(gate.lowBatteryMode.value).toBe(true)
    expect(animated.value).toBe(false)
    expect(document.documentElement.getAttribute('data-low-battery-motion')).toBe('1')

    state.sendBatteryStatus?.({ onBattery: false, percent: 12 })
    await nextTick()

    expect(animated.value).toBe(true)
    expect(document.documentElement.hasAttribute('data-low-battery-motion')).toBe(false)
  })

  it('follows the reduced-motion preference, including a change while mounted', async () => {
    const preference = stubReducedMotion(true)
    const gate = mountGate()
    await nextTick()
    const animated = computed(() => gate.shouldAnimate())

    expect(animated.value).toBe(false)
    // CSS already handles reduced motion; the attribute is only the low-battery switch.
    expect(document.documentElement.hasAttribute('data-low-battery-motion')).toBe(false)

    preference.change(false)
    await nextTick()
    expect(animated.value).toBe(true)
  })
})
