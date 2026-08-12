// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PluginList from './PluginList.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

/**
 * The add-plugin affordance was a self-closing div whose only visual is CSS, so it had no text
 * node to announce, no role, no tabindex and no key handler -- invisible to a screen reader and
 * unreachable by keyboard (#506).
 */

function mountList() {
  return mount(PluginList, {
    props: { plugins: [] },
    global: {
      stubs: {
        TxScroll: { template: '<div><slot /></div>' },
        PluginListModule: true
      }
    }
  })
}

describe('PluginList add-plugin control', () => {
  it('is a real button with an accessible name', () => {
    const control = mountList().get('#newPluginBtn')

    expect(control.element.tagName).toBe('BUTTON')
    expect(control.attributes('type')).toBe('button')
    // The plus is drawn in CSS, so the name can only come from aria-label.
    expect(control.attributes('aria-label')).toBeTruthy()
  })

  it('emits add-plugin when activated', async () => {
    const wrapper = mountList()

    await wrapper.get('#newPluginBtn').trigger('click')

    expect(wrapper.emitted('add-plugin')).toHaveLength(1)
  })

  it('needs no explicit tabindex because a button is focusable by default', () => {
    // Guards a "fix" that adds aria-label but leaves a div: it would pass the name assertion
    // above while still being unreachable.
    const control = mountList().get('#newPluginBtn')

    expect(control.element.tagName).toBe('BUTTON')
    expect(control.attributes('disabled')).toBeUndefined()
  })
})
