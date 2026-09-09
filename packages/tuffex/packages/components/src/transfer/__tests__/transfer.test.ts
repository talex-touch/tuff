import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxTransfer from '../src/TxTransfer.vue'

describe('txTransfer', () => {
  const data = [
    { key: 'docs', label: 'Docs' },
    { key: 'release', label: 'Release' },
    { key: 'blocked', label: 'Blocked', disabled: true },
  ]

  it('moves checked items to target', async () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data,
        modelValue: [],
      },
    })

    // Row checkbox, not `.tx-checkbox`[0] — that one is the panel's select-all.
    await wrapper.findAll('.tx-transfer__item .tx-checkbox')[0].trigger('click')
    await wrapper.find('.tx-transfer__actions button').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['docs'])
    expect(wrapper.emitted('change')?.[0][0]).toEqual(['docs'])
  })

  it('moves a single row on double click', async () => {
    const wrapper = mount(TxTransfer, { props: { data, modelValue: [] } })

    await wrapper.findAll('.tx-transfer__item')[1].trigger('dblclick')

    expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['release'])
  })

  it('refuses to move a disabled row on double click', async () => {
    const wrapper = mount(TxTransfer, { props: { data, modelValue: [] } })

    await wrapper.findAll('.tx-transfer__item')[2].trigger('dblclick')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('renders configurable empty text', () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data: [],
        emptyText: 'No selectable items',
      },
    })

    expect(wrapper.text()).toContain('No selectable items')
  })

  it('renders per-panel empty text from a tuple', () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data: [],
        emptyText: ['Nothing to assign', 'Nothing assigned yet'],
      },
    })

    const panels = wrapper.findAll('.tx-transfer__panel')
    expect(panels[0].text()).toContain('Nothing to assign')
    expect(panels[1].text()).toContain('Nothing assigned yet')
  })

  it('exposes maxHeight as the panel cap variable', () => {
    // Pre-fix the panel had no cap at all, so a long list grew the panel and the
    // page scrolled instead of the list.
    const numeric = mount(TxTransfer, { props: { data, maxHeight: 420 } })
    expect(numeric.find('.tx-transfer').attributes('style')).toContain(
      '--tx-transfer-max-height: 420px',
    )

    const css = mount(TxTransfer, { props: { data, maxHeight: '50dvh' } })
    expect(css.find('.tx-transfer').attributes('style')).toContain(
      '--tx-transfer-max-height: 50dvh',
    )
  })

  it('labels icon-only action buttons', () => {
    const wrapper = mount(TxTransfer, {
      props: {
        data,
        addAriaLabel: 'Add selected',
        removeAriaLabel: 'Remove selected',
      },
    })

    const buttons = wrapper.findAll('.tx-transfer__actions button')
    expect(buttons[0].attributes('aria-label')).toBe('Add selected')
    expect(buttons[1].attributes('aria-label')).toBe('Remove selected')
  })

  it('gives each row checkbox an accessible name from its item label', () => {
    const wrapper = mount(TxTransfer, {
      props: { data, modelValue: ['docs'] },
    })

    const labels = wrapper.findAll('.tx-checkbox').map(cb => cb.attributes('aria-label'))
    // Pre-fix the row text lived in a sibling <span>, so the role="checkbox"
    // button resolved to no accessible name.
    expect(labels).toContain('Docs')
    expect(labels).toContain('Release')

    // The visible label is hidden from AT so it is not announced twice.
    expect(wrapper.find('.tx-transfer__label').attributes('aria-hidden')).toBe('true')
  })

  describe('select all', () => {
    it('checks every enabled row in the panel and skips disabled ones', async () => {
      const wrapper = mount(TxTransfer, { props: { data, modelValue: [] } })

      await wrapper.find('.tx-transfer__select-all').trigger('click')
      await wrapper.find('.tx-transfer__actions button').trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['docs', 'release'])
    })

    it('only covers rows the filter leaves visible', async () => {
      const wrapper = mount(TxTransfer, {
        props: { data, modelValue: [], filterable: true },
      })

      await wrapper.findAll('.tx-transfer__filter input')[0].setValue('rel')
      await wrapper.find('.tx-transfer__select-all').trigger('click')
      await wrapper.find('.tx-transfer__actions button').trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['release'])
    })

    it('reports a partial selection as mixed', async () => {
      const wrapper = mount(TxTransfer, { props: { data, modelValue: [] } })

      await wrapper.findAll('.tx-transfer__item .tx-checkbox')[0].trigger('click')

      expect(wrapper.find('.tx-transfer__select-all').attributes('aria-checked')).toBe('mixed')
    })

    it('clears the panel when toggled off', async () => {
      const wrapper = mount(TxTransfer, { props: { data, modelValue: [] } })

      const selectAll = wrapper.find('.tx-transfer__select-all')
      await selectAll.trigger('click')
      await selectAll.trigger('click')

      expect(wrapper.find('.tx-transfer__actions button').attributes('disabled')).toBeDefined()
    })
  })

  describe('orderable target panel', () => {
    const ranked = {
      data,
      modelValue: ['docs', 'release', 'blocked'],
      orderable: true,
      filterable: true,
    }

    function rowActions(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('.tx-transfer__row-actions')
    }

    it('numbers target rows by their rank in modelValue', () => {
      const wrapper = mount(TxTransfer, { props: ranked })

      expect(wrapper.findAll('.tx-transfer__order').map(el => el.text())).toEqual(['1', '2', '3'])
    })

    it('moves a row down and keeps the new order', async () => {
      // targetOrder stays at its 'original' default here on purpose: that mode
      // re-derives the order from `data` on every emit, which silently undid the
      // move before orderable opted out of it.
      const wrapper = mount(TxTransfer, {
        props: { ...ranked, modelValue: ['docs', 'release'] },
      })

      await rowActions(wrapper)[0].findAll('button')[1].trigger('click')

      expect(wrapper.emitted('update:modelValue')?.[0][0]).toEqual(['release', 'docs'])
      expect(wrapper.emitted('change')?.[0][0]).toEqual(['release', 'docs'])
    })

    it('disables the move that would run past either end', () => {
      const wrapper = mount(TxTransfer, { props: ranked })
      const rows = rowActions(wrapper)

      expect(rows[0].findAll('button')[0].attributes('disabled')).toBeDefined()
      expect(rows[0].findAll('button')[1].attributes('disabled')).toBeUndefined()
      expect(rows[2].findAll('button')[0].attributes('disabled')).toBeUndefined()
      expect(rows[2].findAll('button')[1].attributes('disabled')).toBeDefined()
    })

    it('keeps rank and bounds tied to the full list while a filter is applied', async () => {
      const wrapper = mount(TxTransfer, { props: ranked })

      await wrapper.findAll('.tx-transfer__filter input')[1].setValue('rel')

      // 'Release' is the only visible row but it is still rank 2 of 3, so neither
      // move is a boundary — reading the rank off the filtered list gets both wrong.
      expect(wrapper.findAll('.tx-transfer__order').map(el => el.text())).toEqual(['2'])
      const buttons = rowActions(wrapper)[0].findAll('button')
      expect(buttons[0].attributes('disabled')).toBeUndefined()
      expect(buttons[1].attributes('disabled')).toBeUndefined()
    })

    it('names each move button after the row it moves', () => {
      const wrapper = mount(TxTransfer, {
        props: { ...ranked, moveUpAriaLabel: '上移', moveDownAriaLabel: '下移' },
      })

      const buttons = rowActions(wrapper)[0].findAll('button')
      expect(buttons[0].attributes('aria-label')).toBe('上移: Docs')
      expect(buttons[1].attributes('aria-label')).toBe('下移: Docs')
    })
  })
})
