import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import TxPagination from '../src/TxPagination.vue'

// TxSelect's panel lives in TxPopover's teleport; the stub renders it in place,
// as select.test.ts does, so options can be clicked.
const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
    eager: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  template: '<div><slot name="reference" /><div v-if="modelValue || eager"><slot /></div></div>',
})

function mountPagination(props: Record<string, unknown>) {
  return mount(TxPagination, {
    props,
    global: { stubs: { TxPopover: PopoverStub } },
  })
}

function optionLabels(wrapper: ReturnType<typeof mountPagination>) {
  return wrapper.findAll('[role="option"]').map(option => option.text())
}

describe('txPagination page size', () => {
  it('renders no selector and keeps the stacked layout without pageSizes', () => {
    for (const pageSizes of [undefined, [], [0, -10, 2.5]]) {
      const wrapper = mountPagination({ currentPage: 1, total: 95, pageSize: 10, pageSizes })
      expect(wrapper.find('.tx-pagination__size').exists(), String(pageSizes)).toBe(false)
      expect(wrapper.find('[role="combobox"]').exists()).toBe(false)
      expect(wrapper.classes()).toEqual(['tx-pagination'])
    }
  })

  it('offers the sizes after the page buttons, labelled by its visible text', () => {
    const wrapper = mountPagination({ currentPage: 1, total: 95, pageSize: 20, pageSizes: [50, 10, 20], showInfo: true })

    expect(wrapper.classes()).toContain('has-page-size')
    const children = [...wrapper.element.children].map(child => child.className)
    expect(children).toEqual(['tx-pagination__list', 'tx-pagination__size', 'tx-pagination__info'])

    const label = wrapper.find('.tx-pagination__size-label')
    expect(label.text()).toBe('Items per page')
    const combobox = wrapper.find('[role="combobox"]')
    expect(combobox.attributes('aria-labelledby')).toBe(label.attributes('id'))
    expect((combobox.element as HTMLInputElement).value).toBe('20')
    expect(optionLabels(wrapper)).toEqual(['10', '20', '50'])
  })

  it('emits the new size without moving the page', async () => {
    const wrapper = mountPagination({ currentPage: 3, total: 95, pageSize: 10, pageSizes: [10, 20, 50] })

    const twenty = wrapper.findAll('[role="option"]').find(option => option.text() === '20')!
    await twenty.trigger('click')

    expect(wrapper.emitted('update:pageSize')).toEqual([[20]])
    expect(wrapper.emitted('pageSizeChange')).toEqual([[20]])
    expect(wrapper.emitted('pageChange')).toBeUndefined()
    expect(wrapper.emitted('update:currentPage')).toBeUndefined()
  })

  it('ignores picking the size already in use', async () => {
    const wrapper = mountPagination({ currentPage: 1, total: 95, pageSize: 10, pageSizes: [10, 20] })

    const ten = wrapper.findAll('[role="option"]').find(option => option.text() === '10')!
    await ten.trigger('click')

    expect(wrapper.emitted('update:pageSize')).toBeUndefined()
    expect(wrapper.emitted('pageSizeChange')).toBeUndefined()
  })

  it('adds a pageSize missing from the list, so the selector never shows a blank value', () => {
    const wrapper = mountPagination({ currentPage: 1, total: 95, pageSize: 15, pageSizes: [10, 20, 20] })

    expect(optionLabels(wrapper)).toEqual(['10', '15', '20'])
    expect((wrapper.find('[role="combobox"]').element as HTMLInputElement).value).toBe('15')
  })

  it('takes a localized label and follows a v-model:page-size round trip', async () => {
    const Host = defineComponent({
      components: { TxPagination },
      data: () => ({ page: 4, size: 10 }),
      template: `
        <TxPagination
          v-model:current-page="page"
          v-model:page-size="size"
          :total="95"
          :page-sizes="[10, 50]"
          page-size-label="每页条数"
        />
      `,
    })
    const wrapper = mount(Host, { global: { stubs: { TxPopover: PopoverStub } } })

    expect(wrapper.find('.tx-pagination__size-label').text()).toBe('每页条数')

    const fifty = wrapper.findAll('[role="option"]').find(option => option.text() === '50')!
    await fifty.trigger('click')

    expect((wrapper.vm as unknown as { size: number }).size).toBe(50)
    // 95 items at 50 a page is two pages: the existing clamp pulls page 4 back to 2.
    expect((wrapper.vm as unknown as { page: number }).page).toBe(2)
    expect((wrapper.find('[role="combobox"]').element as HTMLInputElement).value).toBe('50')
  })
})
