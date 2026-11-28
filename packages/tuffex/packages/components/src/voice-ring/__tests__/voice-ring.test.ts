import { mount } from '@vue/test-utils'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  TxVoiceRing,
  VOICE_RING_DEFAULT_LABELS,
  VOICE_RING_EMOTION_COLORS,
  VoiceFollower,
  resolveVoiceRingPreset,
} from '../index'

const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
})

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
  vi.restoreAllMocks()
})

describe('TxVoiceRing engine', () => {
  it('resolves aura and aura-mono presets and tracks voice energy + pan', () => {
    const ringPreset = resolveVoiceRingPreset('aura', 180, 1, 1)
    const monoPreset = resolveVoiceRingPreset('aura-mono', 180, 1, 1)
    expect(typeof ringPreset.frame).toBe('function')
    expect(typeof monoPreset.frame).toBe('function')
    expect(VOICE_RING_EMOTION_COLORS.positive).toBeDefined()

    const follower = new VoiceFollower()
    let voice = follower.step(1 / 60, {
      sensitivity: 0.85,
      threshold: 0.04,
      attack: 0.06,
      release: 0.32,
      idle: 0.1,
      driveGain: 1,
      calm: 0.4,
      rate: 1,
      processing: false,
      direction: -0.65,
    }, false)

    for (let i = 0; i < 20; i++) {
      follower.readLevel(0.85, 1)
      voice = follower.step(1 / 60, {
        sensitivity: 0.85,
        threshold: 0.04,
        attack: 0.06,
        release: 0.32,
        idle: 0.1,
        driveGain: 1,
        calm: 0.4,
        rate: 1,
        processing: false,
        direction: -0.65,
      }, false)
    }

    expect(voice.level).toBeGreaterThan(0.2)
    expect(voice.pan).toBeLessThan(-0.05)
  })
})

describe('TxVoiceRing component', () => {
  it('mounts canvas with accessible state labels and data attributes', () => {
    const wrapper = mount(TxVoiceRing, {
      props: {
        type: 'ring',
        state: 'listening',
        size: 180,
        paused: true,
        labels: { listening: '正在倾听' },
      },
    })

    const canvas = wrapper.find('canvas.tx-voice-ring')
    expect(canvas.exists()).toBe(true)
    expect(canvas.attributes('role')).toBe('img')
    expect(canvas.attributes('aria-label')).toBe('正在倾听')
    expect(canvas.attributes('data-voice-ring-type')).toBe('ring')
    expect(canvas.attributes('data-voice-ring-state')).toBe('listening')
    expect(VOICE_RING_DEFAULT_LABELS.processing).toBe('Thinking')
    wrapper.unmount()
  })

  it('expands horizontal reach when direction is provided and supports mono variant', () => {
    const onLevel = vi.fn()
    const wrapper = mount(TxVoiceRing, {
      props: {
        type: 'mono',
        state: 'speaking',
        size: 160,
        level: 0.5,
        direction: 0.6,
        paused: true,
        onLevel,
      },
    })

    const canvas = wrapper.find('canvas.tx-voice-ring')
    expect(canvas.attributes('data-voice-ring-type')).toBe('mono')
    const widthPx = Number.parseFloat((canvas.element as HTMLCanvasElement).style.width)
    expect(widthPx).toBeGreaterThan(160)
    wrapper.unmount()
  })
})
