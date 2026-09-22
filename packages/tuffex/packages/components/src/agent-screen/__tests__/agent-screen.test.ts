import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxAgentScreen from '../src/TxAgentScreen.vue'

describe('txAgentScreen', () => {
  it('renders the capture from src with its alt text', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/frame.png', alt: "Agent's desktop" },
    })

    const image = wrapper.find('.tx-bui-agent-screen__image')
    expect(image.attributes('src')).toBe('/frame.png')
    expect(image.attributes('alt')).toBe("Agent's desktop")
  })

  it('lets the default slot replace the capture entirely', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/frame.png' },
      slots: { default: '<canvas class="live" />' },
    })

    expect(wrapper.find('.live').exists()).toBe(true)
    // A live surface and a stale screenshot must not stack.
    expect(wrapper.find('.tx-bui-agent-screen__image').exists()).toBe(false)
  })

  it('swaps the frame for an announced placeholder while loading', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/frame.png', state: 'loading', loadingLabel: 'Waiting' },
    })

    expect(wrapper.find('.tx-bui-agent-screen__image').exists()).toBe(false)
    const placeholder = wrapper.find('.tx-bui-agent-screen__placeholder')
    expect(placeholder.exists()).toBe(true)
    // It changes without user action, so it has to announce itself.
    expect(placeholder.attributes('role')).toBe('status')
    expect(placeholder.attributes('aria-live')).toBe('polite')
    expect(placeholder.text()).toContain('Waiting')
  })

  it('shows the placeholder when there is nothing to show yet', () => {
    const wrapper = mount(TxAgentScreen)

    expect(wrapper.find('.tx-bui-agent-screen__placeholder').exists()).toBe(true)
  })

  it('places the pointer by percentage and hides it from assistive tech', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/f.png', cursor: { x: 52, y: 61 } },
    })

    const cursor = wrapper.find('.tx-bui-agent-screen__cursor')
    expect(cursor.attributes('style')).toContain('left: 52%')
    expect(cursor.attributes('style')).toContain('top: 61%')
    expect(cursor.attributes('aria-hidden')).toBe('true')
  })

  it('clamps a pointer that arrives outside the frame', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/f.png', cursor: { x: 140, y: -20 } },
    })

    // A capture-relative coordinate can land outside; un-clamped it escapes the
    // clip and draws on the page.
    const style = wrapper.find('.tx-bui-agent-screen__cursor').attributes('style')!
    expect(style).toContain('left: 100%')
    expect(style).toContain('top: 0%')
  })

  it('renders no pointer unless one is given', () => {
    expect(mount(TxAgentScreen, { props: { src: '/f.png' } })
      .find('.tx-bui-agent-screen__cursor').exists()).toBe(false)
  })

  it('labels the pointer when the action is named', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/f.png', cursor: { x: 10, y: 10, label: 'Opening Photos' } },
    })

    expect(wrapper.find('.tx-bui-agent-screen__cursor-label').text()).toBe('Opening Photos')
  })

  it('applies the declared aspect ratio to the frame', () => {
    const wrapper = mount(TxAgentScreen, { props: { src: '/f.png', ratio: '16 / 9' } })

    expect(wrapper.find('.tx-bui-agent-screen__frame').attributes('style'))
      .toContain('aspect-ratio: 16 / 9')
  })

  it('renders the caption only when there is one', () => {
    expect(mount(TxAgentScreen, { props: { src: '/f.png' } })
      .find('.tx-bui-agent-screen__label').exists()).toBe(false)

    const labelled = mount(TxAgentScreen, { props: { src: '/f.png', label: "Agent's screen" } })
    expect(labelled.find('.tx-bui-agent-screen__label').text()).toBe("Agent's screen")
  })

  it('names the region for assistive tech', () => {
    const wrapper = mount(TxAgentScreen, { props: { src: '/f.png', ariaLabel: 'Live agent view' } })

    expect(wrapper.attributes('role')).toBe('group')
    expect(wrapper.attributes('aria-label')).toBe('Live agent view')
  })

  it('renders the overlay slot above the capture, inside the clip', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/f.png' },
      slots: { overlay: '<div class="ov" />' },
    })

    const frame = wrapper.find('.tx-bui-agent-screen__frame')
    expect(frame.find('.ov').exists()).toBe(true)
  })

  it('drops the overlay with the frame while loading', () => {
    const wrapper = mount(TxAgentScreen, {
      props: { src: '/f.png', state: 'loading' },
      slots: { overlay: '<div class="ov" />' },
    })

    // The overlay annotates the capture; without one it has nothing to annotate.
    expect(wrapper.find('.ov').exists()).toBe(false)
  })
})
