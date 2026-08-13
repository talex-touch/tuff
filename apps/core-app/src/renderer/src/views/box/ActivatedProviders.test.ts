// @vitest-environment jsdom
import type { IProviderActivate, ITuffIcon } from '@talex-touch/utils'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ActivatedProviders from './ActivatedProviders.vue'

// The component calls useI18n() in setup for the close control's accessible name, so mounting it
// without vue-i18n installed throws `Need to install with \`app.use\` function` before a single
// assertion runs. Mocked rather than installed: these cases are about icon colour mode, and the
// translated string is not what they check. Same shape as WhatsChangedDialog.test.ts.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    props: ['icon', 'colorful', 'alt'],
    template:
      '<span class="tx-icon-stub" :data-icon-value="icon?.value || \'\'" :data-colorful="String(colorful)" />'
  }
}))

function normalizeStyle(style: string | undefined): string {
  return (style ?? '').replace(/\s+/g, '')
}

function createProvider(icon: ITuffIcon): IProviderActivate {
  return {
    id: 'plugin-features',
    name: 'AI',
    icon,
    meta: {
      pluginName: 'AI'
    }
  }
}

describe('ActivatedProviders icon color mode', () => {
  it('renders monochrome provider icons with CoreBox primary color', () => {
    const wrapper = mount(ActivatedProviders, {
      props: {
        providers: [createProvider({ type: 'class', value: 'i-simple-icons-openai' })]
      }
    })

    const icon = wrapper.get('.tx-icon-stub')

    expect(icon.attributes('data-icon-value')).toBe('i-simple-icons-openai')
    expect(icon.attributes('data-colorful')).toBe('false')
    expect(normalizeStyle(icon.attributes('style'))).toContain(
      '--icon-color:var(--tx-color-primary)'
    )
  })

  it('preserves explicitly colorful provider icon assets', () => {
    const wrapper = mount(ActivatedProviders, {
      props: {
        providers: [
          createProvider({
            type: 'url',
            value: '/plugins/brand.png',
            colorful: true
          })
        ]
      }
    })

    const icon = wrapper.get('.tx-icon-stub')

    expect(icon.attributes('data-icon-value')).toBe('/plugins/brand.png')
    expect(icon.attributes('data-colorful')).toBe('true')
  })
})
