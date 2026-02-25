import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import TxFlipOverlay from '../src/TxFlipOverlay.vue'

describe('txFlipOverlay', () => {
  afterEach(() => {
    delete document.body.dataset.txFlipOverlayLockCount
    delete document.body.dataset.txFlipOverlayLockOverflow
    delete document.body.dataset.txFlipOverlayLockPaddingRight
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
    document.querySelectorAll('.TxFlipOverlay-GlobalMask').forEach(node => node.remove())
  })

  function mockOverlayCardSize(): () => void {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.classList?.contains('size-b'))
        return 680
      return 520
    })

    const heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.classList?.contains('size-b'))
        return 420
      return 320
    })

    return () => {
      widthSpy.mockRestore()
      heightSpy.mockRestore()
    }
  }

  it('默认启用 globalMask 且渲染 surface 背景层', async () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div>content</div>',
      },
    })

    await nextTick()
    expect(document.body.querySelector('.TxFlipOverlay-GlobalMask')).toBeTruthy()
    expect(wrapper.find('.TxFlipOverlay-Surface').exists()).toBe(true)
  })

  it('globalMask=false 时不渲染全局遮罩', async () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        globalMask: false,
      },
      slots: {
        default: '<div>content</div>',
      },
    })

    await nextTick()
    expect(document.body.querySelector('.TxFlipOverlay-GlobalMask')).toBeNull()
    expect(wrapper.find('.TxFlipOverlay-Surface').exists()).toBe(true)
  })

  it('默认渲染内置 header 和圆形关闭按钮', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div class="body-content">content</div>',
      },
    })

    expect(wrapper.find('.TxFlipOverlay-Header').exists()).toBe(true)
    expect(wrapper.find('.TxFlipOverlay-Close').exists()).toBe(true)
  })

  it('支持 headerTitle/headerDesc，空描述不渲染', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        headerTitle: 'Overlay Title',
        headerDesc: '',
      },
      slots: {
        default: '<div>content</div>',
      },
    })

    expect(wrapper.find('.TxFlipOverlay-HeaderTitle').text()).toBe('Overlay Title')
    expect(wrapper.find('.TxFlipOverlay-HeaderDesc').exists()).toBe(false)
  })

  it('#header 会全量覆盖内置 header 体系', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        headerTitle: 'Built-in',
      },
      slots: {
        header: '<div class="custom-header">custom</div>',
        default: '<div>content</div>',
      },
    })

    expect(wrapper.find('.custom-header').exists()).toBe(true)
    expect(wrapper.find('.TxFlipOverlay-Header').exists()).toBe(false)
    expect(wrapper.find('.TxFlipOverlay-Close').exists()).toBe(false)
  })

  it('#header-actions 渲染在 close 左侧', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        headerTitle: 'Title',
      },
      slots: {
        'header-actions': () => h('button', { class: 'custom-action' }, 'Action'),
        'default': '<div>content</div>',
      },
    })

    const actions = wrapper.find('.TxFlipOverlay-HeaderActions')
    expect(actions.exists()).toBe(true)
    expect(actions.find('.custom-action').exists()).toBe(true)
    expect(actions.find('.TxFlipOverlay-Close').exists()).toBe(true)
    expect(actions.element.firstElementChild?.classList.contains('custom-action')).toBe(true)
  })

  it('#header-close 可替换默认 close', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        headerTitle: 'Title',
      },
      slots: {
        'header-close': () => h('button', { class: 'custom-close' }, 'X'),
        'default': '<div>content</div>',
      },
    })

    expect(wrapper.find('.custom-close').exists()).toBe(true)
    expect(wrapper.find('.TxFlipOverlay-Close').exists()).toBe(false)
  })

  it('closable=false 时 close 区不渲染，header-close 也不生效', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        headerTitle: 'Title',
        closable: false,
      },
      slots: {
        'header-close': () => h('button', { class: 'custom-close' }, 'X'),
        'default': '<div>content</div>',
      },
    })

    expect(wrapper.find('.TxFlipOverlay-Header').exists()).toBe(true)
    expect(wrapper.find('.TxFlipOverlay-Close').exists()).toBe(false)
    expect(wrapper.find('.custom-close').exists()).toBe(false)
  })

  it('点击 close 按钮触发关闭事件链顺序', async () => {
    const calls: string[] = []
    const wrapper = mount(TxFlipOverlay, {
      props: {
        'modelValue': true,
        'onClose': () => calls.push('close'),
        'onUpdate:modelValue': () => calls.push('update:modelValue'),
        'onClosed': () => calls.push('closed'),
      },
      slots: {
        default: '<div>content</div>',
      },
    })

    await wrapper.find('.TxFlipOverlay-Close').trigger('click')
    await nextTick()
    await nextTick()

    expect(calls).toEqual(['close', 'update:modelValue', 'closed'])
  })

  it('长内容默认在 body 内部滚动，支持通过 scrollable 关闭', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div style="height: 1200px">long content</div>',
      },
    })

    expect(wrapper.find('.TxFlipOverlay-Body').classes()).toContain('is-scrollable')

    wrapper.unmount()

    const nonScrollableWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        scrollable: false,
      },
      slots: {
        default: '<div style="height: 1200px">long content</div>',
      },
    })

    expect(nonScrollableWrapper.find('.TxFlipOverlay-Body').classes()).not.toContain('is-scrollable')
  })

  it('closeAriaLabel 支持自定义', () => {
    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        closeAriaLabel: 'Dismiss overlay',
      },
      slots: {
        default: '<div>content</div>',
      },
    })

    expect(wrapper.find('.TxFlipOverlay-Close').attributes('aria-label')).toBe('Dismiss overlay')
  })

  it('border 可切换卡片边框样式', () => {
    const solidWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div>content</div>',
      },
    })
    expect(solidWrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-border-solid')
    solidWrapper.unmount()

    const dashedWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        border: 'dashed',
      },
      slots: {
        default: '<div>content</div>',
      },
    })
    expect(dashedWrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-border-dashed')
    dashedWrapper.unmount()

    const dashWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        border: 'dash',
      },
      slots: {
        default: '<div>content</div>',
      },
    })
    expect(dashWrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-border-dashed')
    dashWrapper.unmount()

    const noneWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
        border: 'none',
      },
      slots: {
        default: '<div>content</div>',
      },
    })
    expect(noneWrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-border-none')
  })

  it('多实例连续打开时仅顶层保留 mask 交互与背景', async () => {
    const restoreCardSize = mockOverlayCardSize()
    try {
      const lowerWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>lower content</div>',
        },
      })
      const upperWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>upper content</div>',
        },
      })

      await nextTick()
      await nextTick()

      const lowerMask = lowerWrapper.find('.TxFlipOverlay-Mask')
      const upperMask = upperWrapper.find('.TxFlipOverlay-Mask')
      expect(lowerMask.classes()).toContain('is-stack-underlay-mask')
      expect(upperMask.classes()).not.toContain('is-stack-underlay-mask')
      expect(lowerMask.attributes('style')).toContain('pointer-events: none')
      expect(upperMask.attributes('style')).toContain('pointer-events: auto')

      lowerWrapper.unmount()
      upperWrapper.unmount()
    }
    finally {
      restoreCardSize()
    }
  })

  it('相邻 overlay 尺寸匹配时，下层进入递进位移叠层状态', async () => {
    const restoreCardSize = mockOverlayCardSize()
    try {
      const lowerWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>lower content</div>',
        },
      })
      const upperWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>upper content</div>',
        },
      })

      await nextTick()
      await nextTick()

      expect(lowerWrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-stack-layered')
      expect(lowerWrapper.find('.TxFlipOverlay-Card').classes()).not.toContain('is-stack-depth-hidden')

      lowerWrapper.unmount()
      upperWrapper.unmount()
    }
    finally {
      restoreCardSize()
    }
  })

  it('相邻 overlay 尺寸不匹配时，下层不进入位移叠层', async () => {
    const restoreCardSize = mockOverlayCardSize()
    try {
      const lowerWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>lower content</div>',
        },
      })
      const upperWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-b',
        },
        slots: {
          default: '<div>upper content</div>',
        },
      })

      await nextTick()
      await nextTick()

      expect(lowerWrapper.find('.TxFlipOverlay-Card').classes()).not.toContain('is-stack-layered')

      lowerWrapper.unmount()
      upperWrapper.unmount()
    }
    finally {
      restoreCardSize()
    }
  })

  it('超过 3 层后按层级逐步降透明并隐藏最旧层', async () => {
    const restoreCardSize = mockOverlayCardSize()
    try {
      const wrappers = Array.from({ length: 7 }, () => {
        return mount(TxFlipOverlay, {
          props: {
            modelValue: true,
            cardClass: 'size-a',
          },
          slots: {
            default: '<div>stack content</div>',
          },
        })
      })

      await nextTick()
      await nextTick()

      expect(wrappers[0].find('.TxFlipOverlay-Card').classes()).toContain('is-stack-depth-hidden')
      expect(wrappers[1].find('.TxFlipOverlay-Card').classes()).not.toContain('is-stack-depth-hidden')

      wrappers.forEach(wrapper => wrapper.unmount())
    }
    finally {
      restoreCardSize()
    }
  })

  it('关闭顶层后，下层恢复为新的 mask owner 且退出叠层位姿', async () => {
    const restoreCardSize = mockOverlayCardSize()
    try {
      const lowerWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>lower content</div>',
        },
      })
      const upperWrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          cardClass: 'size-a',
        },
        slots: {
          default: '<div>upper content</div>',
        },
      })

      await nextTick()
      await nextTick()

      expect(lowerWrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-stack-layered')
      expect(lowerWrapper.find('.TxFlipOverlay-Mask').classes()).toContain('is-stack-underlay-mask')

      await upperWrapper.setProps({ modelValue: false })
      await nextTick()
      await nextTick()

      expect(lowerWrapper.find('.TxFlipOverlay-Card').classes()).not.toContain('is-stack-layered')
      expect(lowerWrapper.find('.TxFlipOverlay-Mask').classes()).not.toContain('is-stack-underlay-mask')

      lowerWrapper.unmount()
      upperWrapper.unmount()
    }
    finally {
      restoreCardSize()
    }
  })

  it('preventAccidentalClose=true 时遮罩点击不会关闭，并触发红光警示态', async () => {
    vi.useFakeTimers()
    try {
      const calls: string[] = []
      const wrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          preventAccidentalClose: true,
          'onClose': () => calls.push('close'),
          'onUpdate:modelValue': () => calls.push('update:modelValue'),
          'onClosed': () => calls.push('closed'),
        },
        slots: {
          default: '<div>content</div>',
        },
      })

      await wrapper.find('.TxFlipOverlay-Mask').trigger('click')
      await nextTick()

      expect(calls).toEqual([])
      expect(wrapper.find('.TxFlipOverlay-Card').classes()).toContain('is-close-guard-warning')

      vi.advanceTimersByTime(760)
      await nextTick()

      expect(wrapper.find('.TxFlipOverlay-Card').classes()).not.toContain('is-close-guard-warning')
      wrapper.unmount()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('preventAccidentalClose=true 时会注册并移除页面退出拦截', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    try {
      const wrapper = mount(TxFlipOverlay, {
        props: {
          modelValue: true,
          preventAccidentalClose: true,
        },
        slots: {
          default: '<div>content</div>',
        },
      })

      await nextTick()

      const addCall = addSpy.mock.calls.find(call => call[0] === 'beforeunload')
      expect(addCall).toBeTruthy()

      await wrapper.setProps({ modelValue: false })
      await nextTick()
      await nextTick()

      const removed = removeSpy.mock.calls.some(call => call[0] === 'beforeunload' && call[1] === addCall?.[1])
      expect(removed).toBe(true)

      wrapper.unmount()
    }
    finally {
      addSpy.mockRestore()
      removeSpy.mockRestore()
    }
  })

  it('打开时锁住背景滚动，关闭后恢复', async () => {
    delete document.body.dataset.txFlipOverlayLockCount
    delete document.body.dataset.txFlipOverlayLockOverflow
    delete document.body.dataset.txFlipOverlayLockPaddingRight
    document.body.style.overflow = 'auto'
    document.body.style.paddingRight = ''

    const wrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div>content</div>',
      },
    })

    await nextTick()

    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.dataset.txFlipOverlayLockCount).toBe('1')

    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await nextTick()

    expect(document.body.style.overflow).toBe('auto')
    expect(document.body.dataset.txFlipOverlayLockCount).toBeUndefined()

    wrapper.unmount()
  })

  it('多实例开关时 body lock count 计数正确回收', async () => {
    delete document.body.dataset.txFlipOverlayLockCount
    delete document.body.dataset.txFlipOverlayLockOverflow
    delete document.body.dataset.txFlipOverlayLockPaddingRight
    document.body.style.overflow = 'auto'
    document.body.style.paddingRight = ''

    const firstWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div>first</div>',
      },
    })
    const secondWrapper = mount(TxFlipOverlay, {
      props: {
        modelValue: true,
      },
      slots: {
        default: '<div>second</div>',
      },
    })

    await nextTick()
    await nextTick()

    expect(document.body.dataset.txFlipOverlayLockCount).toBe('2')

    await secondWrapper.setProps({ modelValue: false })
    await nextTick()
    await nextTick()
    expect(document.body.dataset.txFlipOverlayLockCount).toBe('1')

    await firstWrapper.setProps({ modelValue: false })
    await nextTick()
    await nextTick()
    expect(document.body.dataset.txFlipOverlayLockCount).toBeUndefined()

    firstWrapper.unmount()
    secondWrapper.unmount()
  })
})
