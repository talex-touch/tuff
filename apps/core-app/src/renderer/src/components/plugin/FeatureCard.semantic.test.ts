// @vitest-environment jsdom
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import FeatureCard from './FeatureCard.vue'

function createFeature(): IPluginFeature {
  return {
    id: 'feature-1',
    name: 'Open Panel',
    desc: 'Open the plugin panel',
    icon: { type: 'class', value: 'i-ri-apps-line' },
    push: false,
    platform: {
      win: { enable: true, arch: [], os: [] },
      darwin: { enable: true, arch: [], os: [] },
      linux: { enable: false, arch: [], os: [] }
    },
    commands: [{ type: 'match', value: 'open' }],
    interaction: { type: 'widget' },
    priority: 2
  } as IPluginFeature
}

describe('FeatureCard semantics', () => {
  it('uses a native button and emits click when available', async () => {
    const wrapper = mount(FeatureCard, {
      props: {
        feature: createFeature(),
        active: false
      },
      global: {
        stubs: {
          TuffIcon: { template: '<span />' }
        }
      }
    })

    const button = wrapper.get('button.FeatureCard')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-pressed')).toBe('false')

    await button.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('does not emit duplicate click while active', async () => {
    const wrapper = mount(FeatureCard, {
      props: {
        feature: createFeature(),
        active: true
      },
      global: {
        stubs: {
          TuffIcon: { template: '<span />' }
        }
      }
    })

    await wrapper.get('button.FeatureCard').trigger('click')

    expect(wrapper.emitted('click')).toBeUndefined()
    expect(wrapper.get('button.FeatureCard').attributes('aria-pressed')).toBe('true')
  })
})
