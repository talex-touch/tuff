// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeRunStatus from './HomeRunStatus.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'home.runStatus.waiting' ? '等待模型响应' : key)
  })
}))

describe('HomeRunStatus', () => {
  it('renders dynamic thinking verb in waiting step when provided', () => {
    const wrapper = mount(HomeRunStatus, {
      props: {
        step: { kind: 'waiting' },
        verb: 'Thinking…'
      },
      global: {
        stubs: {
          TxTuffLogoStroke: true,
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>'
          }
        }
      }
    })

    expect(wrapper.find('.HomeRunStatus-Step').text()).toBe('Thinking…')
  })

  it('falls back to waiting message when no verb is provided', () => {
    const wrapper = mount(HomeRunStatus, {
      props: {
        step: { kind: 'waiting' }
      },
      global: {
        stubs: {
          TxTuffLogoStroke: true,
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>'
          }
        }
      }
    })

    expect(wrapper.find('.HomeRunStatus-Step').text()).toBe('等待模型响应')
  })

  it('renders dynamic thinking verb in thinking step without title', () => {
    const wrapper = mount(HomeRunStatus, {
      props: {
        step: { kind: 'thinking' },
        verb: 'Capsuling…'
      },
      global: {
        stubs: {
          TxTuffLogoStroke: true,
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>'
          }
        }
      }
    })

    expect(wrapper.find('.HomeRunStatus-Step').text()).toBe('Capsuling…')
  })

  it('prefers title over verb in thinking step when title exists', () => {
    const wrapper = mount(HomeRunStatus, {
      props: {
        step: { kind: 'thinking', title: 'Reading files' },
        verb: 'Resolving…'
      },
      global: {
        stubs: {
          TxTuffLogoStroke: true,
          TxTextMorph: {
            props: ['text'],
            template: '<span class="stub-morph">{{ text }}</span>'
          }
        }
      }
    })

    expect(wrapper.find('.HomeRunStatus-Step').text()).toBe('Reading files')
  })
})
