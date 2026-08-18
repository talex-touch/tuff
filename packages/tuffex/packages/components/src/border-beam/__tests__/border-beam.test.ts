import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxBorderBeam from '../src/TxBorderBeam.vue'

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return []
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObserverStub)
  vi.stubGlobal('IntersectionObserver', ObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('txBorderBeam', () => {
  it('renders slot content, the bloom layer and the per-instance stylesheet', () => {
    const wrapper = mount(TxBorderBeam, {
      slots: { default: '<div class="content">Card</div>' },
    })

    const beamId = wrapper.attributes('data-beam')
    expect(beamId).toMatch(/^tx-beam-/)
    expect(wrapper.find('.content').text()).toBe('Card')
    expect(wrapper.find('[data-beam-bloom]').exists()).toBe(true)

    const css = wrapper.find('style').text()
    expect(css).toContain(`[data-beam="${beamId}"]`)
    expect(css).toContain(`beam-fade-in-${beamId}`)
  })

  it('is active by default and stays inactive when mounted with active=false', async () => {
    const active = mount(TxBorderBeam)
    expect(active.attributes('data-active')).toBe('')

    const inactive = mount(TxBorderBeam, { props: { active: false } })
    expect(inactive.attributes('data-active')).toBeUndefined()

    await inactive.setProps({ active: true })
    expect(inactive.attributes('data-active')).toBe('')
  })

  it('fades out on deactivation and emits deactivate when the fade ends', async () => {
    const wrapper = mount(TxBorderBeam)
    const beamId = wrapper.attributes('data-beam')

    await wrapper.setProps({ active: false })
    expect(wrapper.attributes('data-fading')).toBe('')

    await wrapper.trigger('animationend', { animationName: `beam-fade-out-${beamId}` })
    await nextTick()
    expect(wrapper.attributes('data-fading')).toBeUndefined()
    expect(wrapper.attributes('data-active')).toBeUndefined()
    expect(wrapper.emitted('deactivate')).toHaveLength(1)
  })

  it('applies duration, explicit radius and clamped strength to the generated CSS', () => {
    const wrapper = mount(TxBorderBeam, {
      props: { size: 'line', duration: 5, borderRadius: 24, strength: 2 },
    })

    const css = wrapper.find('style').text()
    expect(css).toContain('5s')
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--beam-strength')).toBe('1')
  })
})
