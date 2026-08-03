import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TxResizeBox from '../src/TxResizeBox.vue'

function mountBox(options: Record<string, unknown> = {}) {
  return mount(TxResizeBox, options)
}

async function flushTransitionSettlement() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('txResizeBox', () => {
  it('resolves numeric sizes to px, passes raw CSS through, and exposes timing variables', () => {
    const wrapper = mountBox({
      props: {
        width: 260,
        height: '12rem',
        duration: 240,
        easing: 'linear',
      },
      slots: { default: '<span>Card</span>' },
    })
    const style = wrapper.attributes('style')

    expect(style).toContain('width: 260px')
    expect(style).toContain('height: 12rem')
    expect(style).toContain('--tx-resize-box-duration: 240ms')
    expect(style).toContain('--tx-resize-box-easing: linear')
    expect(wrapper.classes()).toContain('tx-resize-box')
    expect(wrapper.text()).toBe('Card')
  })

  it('leaves unset axes unsized so the box keeps its intrinsic size', () => {
    const wrapper = mountBox({ props: { width: 160 } })
    const style = wrapper.attributes('style')

    expect(style).toContain('width: 160px')
    expect(style).not.toContain('height:')
  })

  it('merges caller class and style while forwarding remaining attrs', () => {
    const wrapper = mountBox({
      props: { width: 100 },
      attrs: {
        'class': 'external-card',
        'style': 'color: red;',
        'data-track': 'panel',
      },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['tx-resize-box', 'external-card']))
    expect(wrapper.attributes('style')).toContain('color: red')
    expect(wrapper.attributes('style')).toContain('width: 100px')
    expect(wrapper.attributes('data-track')).toBe('panel')
  })

  it('clips overflow by default and releases it when clip is disabled', async () => {
    const wrapper = mountBox({ props: { width: 100, clip: true } })

    expect(wrapper.classes()).toContain('tx-resize-box--clip')

    await wrapper.setProps({ clip: false })
    expect(wrapper.classes()).not.toContain('tx-resize-box--clip')
  })

  it('hints will-change only while a resize is in flight', async () => {
    const wrapper = mountBox({ props: { width: 260, height: 180 } })

    expect(wrapper.classes()).not.toContain('tx-resize-box--animating')

    await wrapper.setProps({ width: 160, height: 100 })
    expect(wrapper.classes()).toContain('tx-resize-box--animating')
    expect(wrapper.emitted('resize-start')).toHaveLength(1)

    await wrapper.trigger('transitionrun', { propertyName: 'width' })
    await wrapper.trigger('transitionrun', { propertyName: 'height' })
    await wrapper.trigger('transitionend', { propertyName: 'width' })

    // Width landed but height is still tweening, so the resize is not over yet.
    expect(wrapper.classes()).toContain('tx-resize-box--animating')
    expect(wrapper.emitted('resize-end')).toBeUndefined()

    await wrapper.trigger('transitionend', { propertyName: 'height' })
    await flushTransitionSettlement()
    expect(wrapper.classes()).not.toContain('tx-resize-box--animating')
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  it('treats a cancelled transition as a settled one', async () => {
    const wrapper = mountBox({ props: { width: 260 } })

    await wrapper.setProps({ width: 160 })
    await wrapper.trigger('transitionrun', { propertyName: 'width' })
    await wrapper.trigger('transitioncancel', { propertyName: 'width' })
    await flushTransitionSettlement()

    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  it('ignores non-size properties and transitions bubbling up from children', async () => {
    const wrapper = mountBox({
      props: { width: 260 },
      slots: { default: '<span class="child">Inner</span>' },
    })

    await wrapper.setProps({ width: 160 })
    await wrapper.trigger('transitionrun', { propertyName: 'width' })

    await wrapper.trigger('transitionend', { propertyName: 'opacity' })
    expect(wrapper.emitted('resize-end')).toBeUndefined()

    await wrapper.find('.child').trigger('transitionend', { propertyName: 'width' })
    expect(wrapper.emitted('resize-end')).toBeUndefined()

    await wrapper.trigger('transitionend', { propertyName: 'width' })
    await flushTransitionSettlement()
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  it('does not restart a resize when the resolved size is unchanged', async () => {
    const wrapper = mountBox({ props: { width: 160 } })

    await wrapper.setProps({ width: '160px' })

    expect(wrapper.emitted('resize-start')).toBeUndefined()
    expect(wrapper.classes()).not.toContain('tx-resize-box--animating')
  })

  it('snaps without emitting when disabled', async () => {
    const wrapper = mountBox({ props: { width: 260, disabled: true } })

    expect(wrapper.classes()).toContain('tx-resize-box--static')

    await wrapper.setProps({ width: 160 })
    expect(wrapper.attributes('style')).toContain('width: 160px')
    expect(wrapper.emitted('resize-start')).toBeUndefined()
    expect(wrapper.classes()).not.toContain('tx-resize-box--animating')
  })

  it('settles an in-flight resize when disabled mid-tween', async () => {
    const wrapper = mountBox({ props: { width: 260 } })

    await wrapper.setProps({ width: 160 })
    expect(wrapper.classes()).toContain('tx-resize-box--animating')

    await wrapper.setProps({ disabled: true })
    expect(wrapper.classes()).not.toContain('tx-resize-box--animating')
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  it('settles on a timer when the browser never reports a transition', async () => {
    vi.useFakeTimers()
    const wrapper = mountBox({ props: { width: 260, duration: 240 } })

    await wrapper.setProps({ width: 160 })
    expect(wrapper.classes()).toContain('tx-resize-box--animating')

    vi.advanceTimersByTime(240)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('tx-resize-box--animating')

    vi.advanceTimersByTime(60)
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('tx-resize-box--animating')
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })

  it('keeps a rapid second resize as a single start/end cycle', async () => {
    vi.useFakeTimers()
    const wrapper = mountBox({ props: { width: 260, duration: 200 } })

    await wrapper.setProps({ width: 160 })
    await wrapper.trigger('transitionrun', { propertyName: 'width' })
    vi.advanceTimersByTime(120)
    await wrapper.setProps({ width: 220 })

    // Browsers cancel the old transition before running its replacement. The
    // replacement must keep the current lifecycle alive rather than starting over.
    await wrapper.trigger('transitioncancel', { propertyName: 'width' })
    await wrapper.trigger('transitionrun', { propertyName: 'width' })
    vi.advanceTimersByTime(0)

    expect(wrapper.emitted('resize-start')).toHaveLength(1)
    expect(wrapper.emitted('resize-end')).toBeUndefined()

    // The safety timer is rearmed by the second change rather than firing on the first.
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('resize-end')).toBeUndefined()

    vi.advanceTimersByTime(60)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('resize-end')).toHaveLength(1)
  })
})
