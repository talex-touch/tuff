import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODE_DRAWS } from '../src/engine/registry'
import { resolvePreset, STATE_TO_MODE } from '../src/presets'
import TxThinkingOrb from '../src/TxThinkingOrb.vue'
import { ORB_STATES } from '../src/types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('engine contract', () => {
  it('maps every state to a mode with a painter', () => {
    for (const state of ORB_STATES) {
      const mode = STATE_TO_MODE[state]
      expect(mode, state).toBeTruthy()
      expect(typeof MODE_DRAWS[mode], mode).toBe('function')
    }
  })

  it('resolves presets for both tuned sizes', () => {
    for (const state of ORB_STATES) {
      for (const size of [20, 64] as const) {
        const resolved = resolvePreset(state, size)
        expect(resolved.speed).toBeGreaterThan(0)
        expect(resolved.opts).toBeTruthy()
      }
    }
  })
})

describe('txThinkingOrb', () => {
  it('renders a labelled canvas', () => {
    const wrapper = mount(TxThinkingOrb, { props: { state: 'breathing' } })
    const canvas = wrapper.find('canvas')
    expect(canvas.exists()).toBe(true)
    expect(canvas.attributes('role')).toBe('img')
    expect(canvas.attributes('aria-label')).toBe('Thinking…')
  })

  it('rolls a random state once per mount', () => {
    // 0.999… lands on the last state; the roll happens at setup time.
    vi.spyOn(Math, 'random').mockReturnValue(0.9999)
    const wrapper = mount(TxThinkingOrb)
    expect(wrapper.find('canvas').attributes('aria-label')).toBe('Shaping…')
  })

  it('prefers an explicit label over the state default', () => {
    const wrapper = mount(TxThinkingOrb, { props: { state: 'working', label: '思考中' } })
    expect(wrapper.find('canvas').attributes('aria-label')).toBe('思考中')
  })

  it('sizes the canvas by displaySize while keeping preset geometry', () => {
    const wrapper = mount(TxThinkingOrb, { props: { size: 20, displaySize: 14 } })
    const style = wrapper.find('canvas').attributes('style') ?? ''
    expect(style).toContain('width: 14px')
    expect(style).toContain('height: 14px')
  })
})
