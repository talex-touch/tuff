import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import TxDescriptions from '../src/TxDescriptions.vue'
import TxDescriptionsItem from '../src/TxDescriptionsItem.vue'

// vitest runs from the tuffex package root; import.meta.url is rewritten by vite.
const SFC_PATH = join(process.cwd(), 'packages/components/src/descriptions/src/TxDescriptions.vue')

function mountList(template: string, setup: () => Record<string, unknown> = () => ({})) {
  return mount(defineComponent({
    components: { TxDescriptions, TxDescriptionsItem },
    setup,
    template,
  }))
}

describe('txDescriptions', () => {
  it('renders a description list with one dt/dd pair per item', () => {
    const wrapper = mountList(`
      <TxDescriptions>
        <TxDescriptionsItem label="Email">ada@example.com</TxDescriptionsItem>
        <TxDescriptionsItem>
          <template #label><strong class="custom-label">Plan</strong></template>
          Pro
        </TxDescriptionsItem>
      </TxDescriptions>
    `)

    const list = wrapper.find('dl.tx-descriptions__list')
    expect(list.exists()).toBe(true)

    const items = list.findAll(':scope > .tx-descriptions__item')
    expect(items).toHaveLength(2)
    expect(items.map(item => item.find('dt').text())).toEqual(['Email', 'Plan'])
    expect(items.map(item => item.find('dd').text())).toEqual(['ada@example.com', 'Pro'])
    // The label slot replaces the label text, inside the same dt.
    expect(items[1]!.find('dt .custom-label').exists()).toBe(true)
  })

  it('writes the column count for the grid and falls back to one for nonsense', () => {
    const three = mount(TxDescriptions, { props: { columns: 3 } })
    expect(three.attributes('style')).toContain('--tx-descriptions-columns: 3')

    const defaults = mount(TxDescriptions)
    expect(defaults.attributes('style')).toContain('--tx-descriptions-columns: 2')

    for (const columns of [0, -2, Number.NaN]) {
      const wrapper = mount(TxDescriptions, { props: { columns } })
      expect(wrapper.attributes('style'), String(columns)).toContain('--tx-descriptions-columns: 1')
    }

    // A fraction is floored: there is no half column.
    expect(mount(TxDescriptions, { props: { columns: 2.7 } }).attributes('style')).toContain('--tx-descriptions-columns: 2')
  })

  it('spans label and value tracks in the horizontal layout, columns in the vertical one', () => {
    const horizontal = mountList(`
      <TxDescriptions :columns="3">
        <TxDescriptionsItem label="A">1</TxDescriptionsItem>
        <TxDescriptionsItem label="B" :span="2">2</TxDescriptionsItem>
        <TxDescriptionsItem label="C" :span="9">3</TxDescriptionsItem>
      </TxDescriptions>
    `)
    // Each column is a label track plus a value track, so a span of n covers 2n tracks;
    // a span wider than the list is clamped to the column count.
    expect(horizontal.findAll('.tx-descriptions__item').map(item => item.attributes('style'))).toEqual([
      '--tx-descriptions-span: 2;',
      '--tx-descriptions-span: 4;',
      '--tx-descriptions-span: 6;',
    ])

    const vertical = mountList(`
      <TxDescriptions :columns="3" layout="vertical">
        <TxDescriptionsItem label="A">1</TxDescriptionsItem>
        <TxDescriptionsItem label="B" :span="2">2</TxDescriptionsItem>
        <TxDescriptionsItem label="C" :span="0">3</TxDescriptionsItem>
      </TxDescriptions>
    `)
    expect(vertical.findAll('.tx-descriptions__item').map(item => item.attributes('style'))).toEqual([
      '--tx-descriptions-span: 1;',
      '--tx-descriptions-span: 2;',
      '--tx-descriptions-span: 1;',
    ])
  })

  it('shows emptyText for a value that renders nothing, and keeps 0', () => {
    const wrapper = mountList(`
      <TxDescriptions>
        <TxDescriptionsItem label="No slot" />
        <TxDescriptionsItem label="Whitespace">   </TxDescriptionsItem>
        <TxDescriptionsItem label="Empty interpolation">{{ missing }}</TxDescriptionsItem>
        <TxDescriptionsItem label="False v-if"><span v-if="false">hidden</span></TxDescriptionsItem>
        <TxDescriptionsItem label="Empty list"><span v-for="entry in []" :key="entry">{{ entry }}</span></TxDescriptionsItem>
        <TxDescriptionsItem label="Zero">{{ zero }}</TxDescriptionsItem>
        <TxDescriptionsItem label="Element"><span class="value-chip">Pro</span></TxDescriptionsItem>
      </TxDescriptions>
    `, () => ({ missing: null, zero: 0 }))

    const values = wrapper.findAll('dd')
    expect(values.map(value => value.text())).toEqual(['—', '—', '—', '—', '—', '0', 'Pro'])
    expect(values.map(value => value.classes().includes('is-empty'))).toEqual([true, true, true, true, true, false, false])
  })

  it('takes a custom emptyText and updates when it changes', async () => {
    const wrapper = mount(defineComponent({
      components: { TxDescriptions, TxDescriptionsItem },
      props: { empty: { type: String, default: 'Not set' } },
      template: `<TxDescriptions :empty-text="empty"><TxDescriptionsItem label="Phone" /></TxDescriptions>`,
    }))

    expect(wrapper.find('dd').text()).toBe('Not set')
    await wrapper.setProps({ empty: '未填写' })
    expect(wrapper.find('dd').text()).toBe('未填写')
  })

  it('switches a value between empty and filled as its content changes', async () => {
    const Host = defineComponent({
      components: { TxDescriptions, TxDescriptionsItem },
      props: { phone: { type: String, default: '' } },
      template: `<TxDescriptions><TxDescriptionsItem label="Phone">{{ phone }}</TxDescriptionsItem></TxDescriptions>`,
    })
    const wrapper = mount(Host)

    expect(wrapper.find('dd').classes()).toContain('is-empty')
    await wrapper.setProps({ phone: '+1 555 0100' })
    expect(wrapper.find('dd').text()).toBe('+1 555 0100')
    expect(wrapper.find('dd').classes()).not.toContain('is-empty')
  })

  it('names layout and size on the root and ignores values outside them', () => {
    const defaults = mount(TxDescriptions)
    expect(defaults.classes()).toEqual(expect.arrayContaining(['tx-descriptions--horizontal', 'tx-descriptions--md']))

    const vertical = mount(TxDescriptions, { props: { layout: 'vertical', size: 'sm' } })
    expect(vertical.classes()).toEqual(expect.arrayContaining(['tx-descriptions--vertical', 'tx-descriptions--sm']))

    const unknown = mount(TxDescriptions, { props: { layout: 'grid' as never, size: 'xl' as never } })
    expect(unknown.classes()).toEqual(expect.arrayContaining(['tx-descriptions--horizontal', 'tx-descriptions--md']))
  })

  it('writes labelWidth for the horizontal layout only, a number in px', () => {
    expect(mount(TxDescriptions, { props: { labelWidth: 120 } }).attributes('style')).toContain('--tx-descriptions-label-width: 120px')
    expect(mount(TxDescriptions, { props: { labelWidth: '8em' } }).attributes('style')).toContain('--tx-descriptions-label-width: 8em')
    expect(mount(TxDescriptions).attributes('style')).not.toContain('--tx-descriptions-label-width')
    expect(mount(TxDescriptions, { props: { labelWidth: 120, layout: 'vertical' } }).attributes('style'))
      .not.toContain('--tx-descriptions-label-width')
  })

  it('falls back to one column and a horizontal pair outside a TxDescriptions', () => {
    const wrapper = mount(() => h('dl', [h(TxDescriptionsItem, { label: 'Alone', span: 3 })]))
    const item = wrapper.find('.tx-descriptions__item')
    expect(item.attributes('style')).toBe('--tx-descriptions-span: 2;')
    expect(item.find('dd').text()).toBe('—')
  })

  // jsdom evaluates neither container queries nor subgrid, so the two layout
  // contracts the props cannot show are asserted against the stylesheet itself.
  it('collapses to one column in a narrow container and lines the labels up by subgrid', () => {
    const sfc = readFileSync(SFC_PATH, 'utf8')
    const style = sfc.slice(sfc.indexOf('<style'))
    const narrow = style.match(/@container \(width < 480px\) \{([\s\S]*?)\n\}/)

    expect(narrow, 'narrow-container fallback is missing').not.toBeNull()
    expect(narrow![1]).toMatch(/\.tx-descriptions__list \{\s*--tx-descriptions-columns: 1;/)
    expect(narrow![1]).toMatch(/\.tx-descriptions__item \{\s*grid-column: 1 \/ -1;/)
    expect(style).toMatch(/\.tx-descriptions--horizontal \.tx-descriptions__item \{[^}]*grid-template-columns: subgrid;/)
    // The style is unscoped on purpose; every top-level selector must then carry the prefix.
    expect(style).toMatch(/^<style lang="scss">/)
    const selectors = [...style.matchAll(/^([^\s@/<][^{\n]*)\{$/gm)].map(match => match[1]!.trim())
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors)
      expect(selector, selector).toMatch(/^\.tx-descriptions/)
  })
})
