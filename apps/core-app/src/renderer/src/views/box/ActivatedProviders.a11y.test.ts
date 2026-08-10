// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ActivatedProviders from './ActivatedProviders.vue'

/**
 * The deactivate affordance on each provider pill was a div whose only content is a UnoCSS icon
 * class -- no text to announce, no role, no tabindex, no key handler (#510).
 */

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => (key === 'common.remove' ? 'Remove' : key) })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: { template: '<i />' }
}))

vi.mock('~/components/render/icon-color-mode', () => ({
  normalizeCoreBoxIcon: () => null,
  shouldRenderCoreBoxIconColorful: () => false
}))

function mountProviders(closable = true) {
  return mount(ActivatedProviders, {
    props: {
      providers: [
        {
          id: 'p1',
          name: 'Clipboard',
          meta: { feature: { render: { basic: { title: 'History' } } } }
        },
        { id: 'p2', name: 'Files', meta: { feature: { render: { basic: { title: 'Search' } } } } }
      ] as never,
      closable
    }
  })
}

describe('ActivatedProviders deactivate control', () => {
  it('is a real button rather than a div', () => {
    const controls = mountProviders().findAll('.Activated-Provider-Deactivate')

    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) expect(control.element.tagName).toBe('BUTTON')
  })

  it('names each control with its own provider, not a shared label', () => {
    // Several pills are on screen at once, so a bare "Remove" would announce them identically.
    const labels = mountProviders()
      .findAll('.Activated-Provider-Deactivate')
      .map((control) => control.attributes('aria-label'))

    expect(labels).toEqual(['Remove Clipboard', 'Remove Files'])
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('still emits deactivate-provider on activation', async () => {
    const wrapper = mountProviders()

    await wrapper.get('.Activated-Provider-Deactivate').trigger('click')

    expect(wrapper.emitted('deactivate-provider')).toHaveLength(1)
  })

  it('renders no control at all when not closable', () => {
    // Guards against the button leaking in when the pill is meant to be fixed.
    expect(mountProviders(false).findAll('.Activated-Provider-Deactivate')).toHaveLength(0)
  })
})
