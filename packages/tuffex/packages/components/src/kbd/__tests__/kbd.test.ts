import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxKbd from '../src/TxKbd.vue'

describe('txKbd', () => {
  it('renders shortcut content and variant classes', () => {
    const wrapper = mount(TxKbd, {
      props: {
        size: 'md',
        tone: 'primary',
      },
      slots: {
        default: 'Ctrl K',
      },
    })

    expect(wrapper.element.tagName).toBe('KBD')
    expect(wrapper.text()).toBe('Ctrl K')
    expect(wrapper.classes()).toContain('tx-kbd--md')
    expect(wrapper.classes()).toContain('tx-kbd--primary')
  })
})
