import type { Mock } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoInk, DARK_INK, LIGHT_INK, luminance, parseColor, shade } from '../src/color'
import { Sim } from '../src/engine'
import { botAvatarPresets, botAvatarStates, botAvatarTypes } from '../src/presets'
import { SHAPE_PATHS } from '../src/shapes'
import TxBotAvatar from '../src/TxBotAvatar.vue'

enableAutoUnmount(afterEach)

let rafSpy: Mock

beforeEach(() => {
  rafSpy = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', rafSpy)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('presets & shapes', () => {
  it('gives every type a preset and a body path', () => {
    expect(botAvatarTypes).toHaveLength(18)
    for (const type of botAvatarTypes) {
      const preset = botAvatarPresets[type]
      expect(preset, type).toBeTruthy()
      expect(preset.label, type).toBeTruthy()
      expect(preset.color, type).toMatch(/^#/)
      expect(['eyes', 'mouth'], type).toContain(preset.face)
      expect(typeof SHAPE_PATHS[type], type).toBe('string')
      expect(SHAPE_PATHS[type]!.startsWith('M'), type).toBe(true)
    }
  })

  it('exposes the three states', () => {
    expect(botAvatarStates).toEqual(['default', 'working', 'sleeping'])
  })
})

describe('txBotAvatar', () => {
  it('renders a labelled canvas with the type and face in data attributes', () => {
    const wrapper = mount(TxBotAvatar, { props: { type: 'ghost' } })
    const canvas = wrapper.find('canvas')
    expect(canvas.exists()).toBe(true)
    expect(canvas.attributes('role')).toBe('img')
    // preset default face for every type is `eyes`
    expect(canvas.attributes('data-face')).toBe('eyes')
    expect(canvas.attributes('data-bot-avatar')).toBe('ghost')
    expect(canvas.attributes('data-state')).toBe('default')
    expect(canvas.attributes('aria-label')).toBe('Ghost bot, idle')
  })

  it('lets an explicit face override the preset', () => {
    const wrapper = mount(TxBotAvatar, { props: { type: 'clover', face: 'mouth' } })
    expect(wrapper.find('canvas').attributes('data-face')).toBe('mouth')
  })

  it('labels each state, and falls back to `default` for an unknown one', () => {
    const labels: Record<string, string> = {
      default: 'Clover bot, idle',
      working: 'Clover bot, working',
      sleeping: 'Clover bot, sleeping',
    }
    for (const state of botAvatarStates) {
      const wrapper = mount(TxBotAvatar, { props: { state } })
      const canvas = wrapper.find('canvas')
      expect(canvas.attributes('data-state'), state).toBe(state)
      expect(canvas.attributes('aria-label'), state).toBe(labels[state])
    }
    const bogus = mount(TxBotAvatar, { props: { state: 'bogus' as never } })
    expect(bogus.find('canvas').attributes('data-state')).toBe('default')
    expect(bogus.find('canvas').attributes('aria-label')).toBe('Clover bot, idle')
  })

  it('prefers an explicit aria-label', () => {
    const wrapper = mount(TxBotAvatar, { props: { ariaLabel: '机器人' } })
    expect(wrapper.find('canvas').attributes('aria-label')).toBe('机器人')
  })

  it('overscans a numeric size and pulls the box back with negative margins', () => {
    const wrapper = mount(TxBotAvatar, { props: { size: 64 } })
    const style = wrapper.find('canvas').element.style
    // 64 * OVERSCAN(1.5); margins: -64 * (0.25), -64 * (0.35), -64 * (0.15)
    expect(style.width).toBe('96px')
    expect(style.height).toBe('96px')
    expect(style.marginLeft).toBe('-16px')
    expect(style.marginRight).toBe('-16px')
    expect(style.marginTop).toBe('-22.4px')
    expect(style.marginBottom).toBe('-9.6px')
  })

  it('accepts a CSS length for size', () => {
    const wrapper = mount(TxBotAvatar, { props: { size: '3rem' } })
    const style = wrapper.find('canvas').element.style
    // jsdom's CSS engine folds the multiplication: 3rem * 1.5 → 4.5rem.
    expect(style.width).toBe('calc(4.5rem)')
    expect(style.height).toBe('calc(4.5rem)')
    expect(style.marginLeft).toBe('calc(-0.75rem)')
    expect(style.marginTop.startsWith('calc(-')).toBe(true)
  })

  it('falls through native attributes and classes onto the canvas', () => {
    const wrapper = mount(TxBotAvatar, { attrs: { id: 'bot-1', class: 'custom', title: 'hi' } })
    const canvas = wrapper.find('canvas')
    expect(canvas.attributes('id')).toBe('bot-1')
    expect(canvas.attributes('title')).toBe('hi')
    expect(canvas.classes()).toContain('tx-bot-avatar')
    expect(canvas.classes()).toContain('custom')
  })

  it('starts the shared loop only when not paused', () => {
    mount(TxBotAvatar, { props: { paused: true } })
    expect(rafSpy).not.toHaveBeenCalled()

    mount(TxBotAvatar)
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })

  it('hops on click while interactive, and ignores clicks while paused', async () => {
    const poke = vi.spyOn(Sim.prototype, 'poke')
    const wrapper = mount(TxBotAvatar)
    await wrapper.find('canvas').trigger('click')
    expect(poke).toHaveBeenCalledTimes(1)

    poke.mockClear()
    const paused = mount(TxBotAvatar, { props: { paused: true } })
    await paused.find('canvas').trigger('click')
    expect(poke).not.toHaveBeenCalled()
  })

  it('does not hop when interactive is off', async () => {
    const poke = vi.spyOn(Sim.prototype, 'poke')
    const wrapper = mount(TxBotAvatar, { props: { interactive: false } })
    await wrapper.find('canvas').trigger('click')
    expect(poke).not.toHaveBeenCalled()
  })
})

describe('color', () => {
  it('parses hex, rgb() and hsl()', () => {
    expect(parseColor('#abc')).toEqual([170, 187, 204])
    expect(parseColor('#35B8FF')).toEqual([53, 184, 255])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3])
    expect(parseColor('rgba(1, 2, 3, 0.5)')).toEqual([1, 2, 3])
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual([255, 0, 0])
    expect(parseColor('not-a-colour')).toBeNull()
  })

  it('computes WCAG luminance', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    expect(luminance('#000000')).toBeCloseTo(0, 5)
    // an unparseable colour counts as mid-grey
    expect(luminance('nope')).toBe(0.5)
  })

  it('picks face ink by body luminance', () => {
    expect(autoInk('#F7F5F2')).toBe(DARK_INK)
    expect(autoInk('#1E1A33')).toBe(LIGHT_INK)
    expect(luminance('#1E1A33')).toBeLessThan(0.13)
  })

  it('shades a colour in HSL and passes unparseable input through', () => {
    const darker = shade('#35B8FF', -0.2)
    expect(darker).toMatch(/^hsl\(/)
    expect(darker).not.toBe('#35B8FF')
    expect(shade('nope', -0.2)).toBe('nope')
  })
})
