import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import {
  DISTORTION_WAVE_PALETTES,
  TxDistortionWave,
  defaultDistortionWaveStyle,
  distortionWaveDuration,
  distortionWaveFront,
  distortionWaveParticleAt,
  makeDistortionWaveParticles,
  singleDistortionWavePalette,
} from '../index'

describe('TxDistortionWave model', () => {
  it('computes tuned defaults and finite duration for all wave types', () => {
    for (const type of ['vertical', 'horizontal', 'center'] as const) {
      const style = defaultDistortionWaveStyle(type)
      expect(style.type).toBe(type)
      expect(distortionWaveDuration(style)).toBeGreaterThan(1)
    }
    expect(defaultDistortionWaveStyle('center').aberration).toBe(0)
    expect(DISTORTION_WAVE_PALETTES.colorful.colors.length).toBeGreaterThan(3)
  })

  it('advances waveFront monotonically from anticipation through clear and leans toward focus', () => {
    const style = defaultDistortionWaveStyle('vertical')
    const source = { x: 100, y: 320, w: 180, h: 48 }
    const start = distortionWaveFront(0, source, 380, 420, style, { x: 260, y: 344 })
    const mid = distortionWaveFront(0.35, source, 380, 420, style, { x: 260, y: 344 })
    const end = distortionWaveFront(1, source, 380, 420, style, { x: 260, y: 344 })

    expect(start.launched).toBe(false)
    expect(mid.launched).toBe(true)
    expect(mid.radius).toBeGreaterThan(start.radius)
    expect(mid.tilt).toBeGreaterThan(0)
    expect(end.hasCleared).toBe(true)
  })

  it('generates deterministic particles and single-colour palettes', () => {
    const style = defaultDistortionWaveStyle('center')
    const particles = makeDistortionWaveParticles(style)
    expect(particles.length).toBe(Math.round(style.particleCount))
    const source = { x: 120, y: 120, w: 64, h: 64 }
    const front = distortionWaveFront(0.4, source, 320, 320, style)
    const spot = distortionWaveParticleAt(particles[0]!, front, source, style)
    expect(Number.isFinite(spot.x)).toBe(true)
    expect(Number.isFinite(spot.y)).toBe(true)

    const pal = singleDistortionWavePalette([64, 158, 255])
    expect(pal.colors).toHaveLength(4)
  })
})

describe('TxDistortionWave component', () => {
  it('renders content, revealed and overlay slots with expected initial visibility', () => {
    const wrapper = mount(TxDistortionWave, {
      props: { revealed: false, reducedMotion: 'always', prewarm: false, capture: false },
      slots: {
        default: '<div class="view-a">Before</div>',
        revealed: '<div class="view-b">After</div>',
        overlay: '<button type="button" class="trigger">Confirm</button>',
      },
    })

    expect(wrapper.find('[data-distortion-wave]').exists()).toBe(true)
    expect(wrapper.find('[data-dw-layer="content"] .view-a').text()).toBe('Before')
    expect(wrapper.find('[data-dw-layer="revealed"] .view-b').text()).toBe('After')
    expect(wrapper.find('[data-dw-layer="overlay"] .trigger').text()).toBe('Confirm')
    expect(wrapper.find('[data-dw-layer="revealed"]').attributes('style')).toContain('opacity: 0')
    wrapper.unmount()
  })

  it('switches cleanly under reducedMotion="always" and exposes imperative controls', async () => {
    vi.useFakeTimers()
    try {
      const onFinish = vi.fn()
      const wrapper = mount(TxDistortionWave, {
        props: {
          revealed: false,
          reducedMotion: 'always',
          prewarm: false,
          capture: false,
          onFinish,
        },
        slots: {
          default: '<div>View A</div>',
          revealed: '<div>View B</div>',
        },
      })

      expect(typeof wrapper.vm.play).toBe('function')
      expect(typeof wrapper.vm.reverse).toBe('function')
      expect(typeof wrapper.vm.reset).toBe('function')
      expect(typeof wrapper.vm.prepare).toBe('function')

      await wrapper.setProps({ revealed: true })
      vi.advanceTimersByTime(500)

      expect(onFinish).toHaveBeenCalledTimes(1)
      expect(onFinish).toHaveBeenCalledWith(true)
      expect(wrapper.emitted('finish')).toEqual([[true]])
      wrapper.unmount()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
