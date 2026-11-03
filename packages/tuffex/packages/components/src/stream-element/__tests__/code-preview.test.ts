import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxStreamElement from '../src/TxStreamElement.vue'

async function settle(): Promise<void> {
  await flushPromises()
}

describe('txStreamElement code previews', () => {
  it('renders a closed HTML fence as a toggleable preview and forwards the labels', async () => {
    const wrapper = mount(TxStreamElement, {
      props: {
        content: '```html\n<section title="from fence">Hello</section>\n```',
        previewLabel: 'Render page',
        codeLabel: 'Show source',
        codeFrameLabelFormatter: (lang: string) => `Rendered ${lang}`,
      },
    })
    await settle()

    const toggle = wrapper.find('.tx-bui-code-stream__toggle')
    expect(toggle.text()).toBe('Render page')
    await toggle.trigger('click')
    await settle()
    const frame = wrapper.find('iframe.tx-bui-code-stream__preview')
    expect(frame.attributes('title')).toBe('Rendered html')
    expect(toggle.text()).toBe('Show source')
    // Negative control: removing the code-part forwarding values makes the public labels/title revert to defaults.
  })

  it('auto-previews settled fences and disables the feature for the host', async () => {
    const auto = mount(TxStreamElement, {
      props: {
        content: '```html\n<p>settled</p>\n```',
        autoPreview: true,
        previewScripts: true,
      },
    })
    await settle()
    expect(auto.find('iframe.tx-bui-code-stream__preview').exists()).toBe(true)
    expect(auto.find('iframe.tx-bui-code-stream__preview').attributes('sandbox')).toBe('allow-scripts')

    const disabled = mount(TxStreamElement, {
      props: { content: '```html\n<p>hidden</p>\n```', previewable: false, autoPreview: true },
    })
    await settle()
    // Negative control: dropping `previewable: props.previewable` from the code VNode offers a toggle here.
    expect(disabled.find('.tx-bui-code-stream__toggle').exists()).toBe(false)
    expect(disabled.find('iframe.tx-bui-code-stream__preview').exists()).toBe(false)
  })
})
