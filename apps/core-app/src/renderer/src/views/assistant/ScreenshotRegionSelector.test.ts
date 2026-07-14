// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScreenshotRegionSelector from './ScreenshotRegionSelector.vue'

const transportSendMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture

beforeEach(() => {
  transportSendMock.mockReset()
  transportSendMock.mockResolvedValue({ accepted: true })
  HTMLElement.prototype.setPointerCapture = vi.fn()
})

afterEach(() => {
  if (originalSetPointerCapture) {
    HTMLElement.prototype.setPointerCapture = originalSetPointerCapture
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture
  }
})

function transportCallsNamed(name: string) {
  return transportSendMock.mock.calls.filter(
    ([event]) =>
      !!event &&
      typeof event === 'object' &&
      'toEventName' in event &&
      typeof event.toEventName === 'function' &&
      event.toEventName() === name
  )
}

describe('ScreenshotRegionSelector', () => {
  it('normalizes a reverse drag before submitting the local DIP selection', async () => {
    const wrapper = mount(ScreenshotRegionSelector)
    const selector = wrapper.find('.region-selector')

    await selector.trigger('pointerdown', {
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 220
    })
    await selector.trigger('pointermove', {
      pointerId: 1,
      clientX: 100,
      clientY: 70
    })

    const rectangle = wrapper.find('.selection-rectangle')
    expect(rectangle.attributes('style')).toContain('left: 100px')
    expect(rectangle.attributes('style')).toContain('top: 70px')
    expect(rectangle.attributes('style')).toContain('width: 200px')
    expect(rectangle.attributes('style')).toContain('height: 150px')

    await selector.trigger('pointerup', {
      pointerId: 1,
      clientX: 100,
      clientY: 70
    })

    expect(transportCallsNamed('assistant:region-selection:submit')).toEqual([
      [
        expect.objectContaining({
          namespace: 'assistant',
          module: 'region-selection',
          action: 'submit'
        }),
        { x: 100, y: 70, width: 200, height: 150 }
      ]
    ])

    wrapper.unmount()
  })

  it.each([
    {
      name: 'Escape',
      cancel: async (wrapper: VueWrapper) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await wrapper.vm.$nextTick()
      }
    },
    {
      name: 'the semantic Cancel button',
      cancel: async (wrapper: VueWrapper) => {
        await wrapper.find('.selector-cancel').trigger('click')
      }
    }
  ])('cancels selection through $name', async ({ cancel }) => {
    const wrapper = mount(ScreenshotRegionSelector)

    await cancel(wrapper)

    expect(transportCallsNamed('assistant:region-selection:cancel')).toEqual([
      [
        expect.objectContaining({
          namespace: 'assistant',
          module: 'region-selection',
          action: 'cancel'
        }),
        undefined
      ]
    ])

    wrapper.unmount()
  })
})
