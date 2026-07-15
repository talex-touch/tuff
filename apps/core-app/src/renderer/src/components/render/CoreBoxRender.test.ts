// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CoreBoxRender from './CoreBoxRender.vue'

vi.mock('./BoxItem.vue', () => ({
  default: { name: 'BoxItem', template: '<div />' }
}))

vi.mock('./WidgetFrame.vue', () => ({
  default: {
    name: 'WidgetFrame',
    emits: ['host-action'],
    template:
      "<button class=\"widget-action\" @click=\"$emit('host-action', { actionId: 'select-context-mode', payload: { contextMode: 'stateless' } })\">Use stateless context</button>"
  }
}))

function createWidgetItem(): TuffItem {
  return {
    id: 'touch-intelligence/widget-ready',
    source: { type: 'plugin', id: 'plugin-features', name: 'touch-intelligence' },
    kind: 'feature',
    render: {
      mode: 'custom',
      custom: {
        type: 'vue',
        content: 'touch-intelligence::intelligence-ask',
        data: {}
      }
    },
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask'
    }
  }
}

describe('coreBoxRender widget interactions', () => {
  it('forwards widget host actions without retriggering the feature item', async () => {
    const wrapper = mount(CoreBoxRender, {
      props: {
        active: true,
        item: createWidgetItem(),
        index: 0
      }
    })

    await wrapper.get('.widget-action').trigger('click')

    expect(wrapper.emitted('host-action')).toEqual([
      [
        {
          actionId: 'select-context-mode',
          payload: { contextMode: 'stateless' }
        }
      ]
    ])
    expect(wrapper.emitted('trigger')).toBeUndefined()
  })
})
