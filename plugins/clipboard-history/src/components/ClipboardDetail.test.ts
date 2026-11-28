import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ClipboardDetail from './ClipboardDetail.vue'
import ClipboardSidebar from './ClipboardSidebar.vue'

/**
 * 主题色是从缩略图现场提取的，jsdom 里没有 canvas，所以真实提取永远返回空数组。
 * 想测色带就必须把提取器换掉——否则这个组件在测试里根本渲染不出色块。
 */
vi.mock('~/utils/clipboard-colors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/clipboard-colors')>()
  return {
    ...actual,
    extractPaletteFromImage: vi.fn(async () => ['#123456', '#ABCDEE']),
  }
})

function mountWithImage() {
  return mount(ClipboardDetail, {
    props: {
      item: {
        id: 1,
        type: 'image',
        content: 'data:image/png;base64,thumb',
        thumbnail: 'data:image/png;base64,thumb',
      },
    },
  })
}

describe('clipboardDetail palette rail', () => {
  it('carries the colour value inside each swatch instead of a native title', async () => {
    const wrapper = mountWithImage()
    await flushPromises()

    const swatches = wrapper.findAll('.palette-swatch')
    expect(swatches).toHaveLength(2)

    // 原生 title 有约一秒延迟且样式不可控，色值改成就地渲染。
    expect(swatches[0]!.attributes('title')).toBeUndefined()
    expect(wrapper.find('.palette-rail').attributes('title')).toBeUndefined()

    expect(swatches.map(node => node.get('.palette-value').text())).toEqual(['#123456', '#ABCDEE'])
  })

  /**
   * 深色块上写死白字、浅色块上就读不出来了。文字色按底色的对比度算——
   * 这两个样本正好落在阈值两侧。
   */
  it('picks the label colour from the swatch it sits on', async () => {
    const wrapper = mountWithImage()
    await flushPromises()

    const labels = wrapper.findAll('.palette-value')
    expect(labels[0]!.attributes('style')).toContain('rgb(255, 255, 255)')
    expect(labels[1]!.attributes('style')).toContain('rgb(17, 17, 17)')
  })

  it('keeps every swatch reachable and copyable', async () => {
    const wrapper = mountWithImage()
    await flushPromises()

    const swatch = wrapper.findAll('.palette-swatch')[1]!
    // 去掉 title 之后无障碍名称不能跟着没了。
    expect(swatch.attributes('aria-label')).toBe('复制 #ABCDEE')

    await swatch.trigger('click')
    expect(wrapper.emitted('copyText')?.[0]).toEqual(['#ABCDEE'])
  })

  /**
   * 复制本身没有任何可见结果——剪贴板变了但界面没动。所以点击要给一个短暂的回执，
   * 并且只给被点的那一个：整条色带一起变「已复制」会让人以为复制了全部。
   */
  it('acknowledges the click on the swatch that was clicked, then reverts', async () => {
    vi.useFakeTimers()
    const wrapper = mountWithImage()
    await flushPromises()

    const swatches = wrapper.findAll('.palette-swatch')
    await swatches[1]!.trigger('click')
    await nextTick()

    expect(swatches[1]!.get('.palette-value').text()).toBe('已复制')
    expect(swatches[0]!.get('.palette-value').text()).toBe('#123456')

    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()
    expect(swatches[1]!.get('.palette-value').text()).toBe('#ABCDEE')

    vi.useRealTimers()
    wrapper.unmount()
  })

  /** 回执不能跟着列表往下走：换一条记录后它必须已经消失。 */
  it('drops the acknowledgement when the selection moves', async () => {
    vi.useFakeTimers()
    const wrapper = mountWithImage()
    await flushPromises()

    await wrapper.findAll('.palette-swatch')[0]!.trigger('click')
    await nextTick()
    expect(wrapper.get('.palette-value').text()).toBe('已复制')

    await wrapper.setProps({
      item: {
        id: 2,
        type: 'image',
        content: 'data:image/png;base64,other',
        thumbnail: 'data:image/png;base64,other',
      },
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.get('.palette-value').text()).toBe('#123456')

    vi.useRealTimers()
    wrapper.unmount()
  })
})

describe('clipboardDetail & ClipboardSidebar security and host-IP masking', () => {
  it('hides reveal toggle and never exposes PEM private key even when preceded by another critical token', () => {
    const keyBody = 'MIIEowIBAAKCAQEAxLoNGoOfHmSecretMaterial'
    const mixed = `ghp_1234567890abcdefghijklmnopqrstuvwxyz\n-----BEGIN RSA PRIVATE KEY-----\n${keyBody}\n-----END RSA PRIVATE KEY-----`
    const wrapper = mount(ClipboardDetail, {
      props: {
        item: { id: 99, type: 'text', content: mixed },
      },
    })

    expect(wrapper.find('.reveal-toggle').exists()).toBe(false)
    expect(wrapper.html()).not.toContain(keyBody)
    wrapper.unmount()
  })

  it('propagates maskHostIp=false to ClipboardDetail preview and ClipboardSidebar titles', () => {
    const sshItem = { id: 100, type: 'text' as const, content: 'ssh deploy@10.0.3.14 -p 2222' }

    const maskedDetail = mount(ClipboardDetail, { props: { item: sshItem, maskHostIp: true } })
    expect(maskedDetail.get('.text-preview').text()).not.toContain('10.0.3.14')
    maskedDetail.unmount()

    const unmaskedDetail = mount(ClipboardDetail, { props: { item: sshItem, maskHostIp: false } })
    expect(unmaskedDetail.get('.text-preview').text()).toContain('10.0.3.14')
    unmaskedDetail.unmount()

    const unmaskedSidebar = mount(ClipboardSidebar, {
      props: {
        sections: [{ key: 'today', label: '今天', count: 1, items: [sshItem] }],
        selectedId: 100,
        loading: false,
        loadingMore: false,
        hasMore: false,
        maskHostIp: false,
      },
    })
    expect(unmaskedSidebar.get('.item-preview').text()).toContain('10.0.3.14')
    expect(unmaskedSidebar.get('.item-preview').attributes('title')).toContain('10.0.3.14')
    unmaskedSidebar.unmount()
  })
})
