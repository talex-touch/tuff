import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { registerTuffexElements } from '../index'

beforeAll(() => {
  registerTuffexElements()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('tier B custom elements (12 modules / 16 tags)', () => {
  it('handles tx-input and tx-textarea controlled/uncontrolled input events cleanly', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-input placeholder="Username" model-value="alice" clearable></tx-input>
      <tx-textarea placeholder="Bio" rows="3"></tx-textarea>
    `
    document.body.appendChild(container)
    await nextTick()

    const txInput = container.querySelector('tx-input')!
    const nativeInput = txInput.querySelector('input') as HTMLInputElement | null
    expect(nativeInput).not.toBeNull()
    expect(nativeInput?.value).toBe('alice')

    const onInput = vi.fn()
    const onModel = vi.fn()
    txInput.addEventListener('input', onInput)
    container.addEventListener('update:model-value', onModel)

    nativeInput!.value = 'bob'
    nativeInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    // Single CustomEvent (native input bubble suppressed to avoid double firing)
    expect(onInput).toHaveBeenCalledTimes(1)
    expect((onInput.mock.calls[0]![0] as CustomEvent).detail).toBe('bob')
    expect(onModel).toHaveBeenCalledTimes(1)
    expect((onModel.mock.calls[0]![0] as CustomEvent).detail).toBe('bob')
    expect(txInput.modelValue).toBe('bob')

    const txTextarea = container.querySelector('tx-textarea')!
    const nativeTextarea = txTextarea.querySelector('textarea') as HTMLTextAreaElement | null
    expect(nativeTextarea).not.toBeNull()
    nativeTextarea!.value = 'hello world'
    nativeTextarea!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(txTextarea.modelValue).toBe('hello world')
  })

  it('toggles tx-checkbox and emits change + update:model-value', async () => {
    const container = document.createElement('div')
    container.innerHTML = `<tx-checkbox label="Accept terms"></tx-checkbox>`
    document.body.appendChild(container)
    await nextTick()

    const checkbox = container.querySelector('tx-checkbox')!
    const box = checkbox.querySelector('[role="checkbox"]') as HTMLElement | null
    expect(box).not.toBeNull()
    expect(box?.getAttribute('aria-checked')).toBe('false')

    const onChange = vi.fn()
    container.addEventListener('change', onChange)
    box!.click()
    await nextTick()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toBe(true)
    expect(checkbox.modelValue).toBe(true)
    expect(box?.getAttribute('aria-checked')).toBe('true')
  })

  it('coordinates tx-radio-group + tx-radio via promoted Vue 3.5 provide/inject', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-radio-group model-value="vue" type="standard">
        <tx-radio value="vue">Vue 3</tx-radio>
        <tx-radio value="react">React 19</tx-radio>
        <tx-radio value="wc">Web Components</tx-radio>
      </tx-radio-group>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    const group = container.querySelector('tx-radio-group')!
    const radios = Array.from(group.querySelectorAll('button[role="radio"]')) as HTMLButtonElement[]
    expect(radios).toHaveLength(3)
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true')
    expect(radios[2]?.getAttribute('aria-checked')).toBe('false')

    const onChange = vi.fn()
    container.addEventListener('change', onChange)
    radios[2]!.click()
    await nextTick()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toBe('wc')
    expect(group.modelValue).toBe('wc')
    expect(radios[2]?.getAttribute('aria-checked')).toBe('true')
  })

  it('renders tx-slider and emits update:model-value + change on range input', async () => {
    const container = document.createElement('div')
    container.innerHTML = `<tx-slider model-value="25" min="0" max="100" step="5" show-value></tx-slider>`
    document.body.appendChild(container)
    await nextTick()

    const slider = container.querySelector('tx-slider')!
    const rangeInput = slider.querySelector('input[type="range"]') as HTMLInputElement | null
    expect(rangeInput).not.toBeNull()
    expect(rangeInput?.value).toBe('25')

    const onModel = vi.fn()
    container.addEventListener('update:model-value', onModel)
    rangeInput!.value = '60'
    rangeInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    expect(onModel).toHaveBeenCalledTimes(1)
    expect((onModel.mock.calls[0]![0] as CustomEvent).detail).toBe(60)
    expect(slider.modelValue).toBe(60)
  })

  it('switches panels in tx-tabs with nested tx-tab-item elements and emits change', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-tabs model-value="overview" placement="top">
        <tx-tab-item name="overview" label="Overview"><p class="panel-overview">Overview Content</p></tx-tab-item>
        <tx-tab-item name="api" label="API"><p class="panel-api">API Content</p></tx-tab-item>
      </tx-tabs>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    const tabs = container.querySelector('tx-tabs')!
    const tabButtons = Array.from(tabs.querySelectorAll('button[role="tab"]')) as HTMLButtonElement[]
    expect(tabButtons).toHaveLength(2)
    expect(tabButtons[0]?.textContent?.trim()).toBe('Overview')
    expect(tabButtons[1]?.textContent?.trim()).toBe('API')
    expect(tabs.querySelector('.panel-overview')?.textContent).toBe('Overview Content')

    const onChange = vi.fn()
    container.addEventListener('change', onChange)
    tabButtons[1]!.click()
    await nextTick()
    await nextTick()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toBe('api')
    expect(tabs.modelValue).toBe('api')
    expect(tabs.querySelector('.panel-api')?.textContent).toBe('API Content')
  })

  it('toggles tx-collapse + tx-collapse-item in accordion mode via promoted provide/inject', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-collapse accordion model-value="one">
        <tx-collapse-item name="one" title="First Section"><p>First Body</p></tx-collapse-item>
        <tx-collapse-item name="two" title="Second Section"><p>Second Body</p></tx-collapse-item>
      </tx-collapse>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    const collapse = container.querySelector('tx-collapse')!
    const headers = Array.from(collapse.querySelectorAll('.tx-collapse-item__header')) as HTMLButtonElement[]
    expect(headers).toHaveLength(2)
    expect(headers[0]?.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]?.getAttribute('aria-expanded')).toBe('false')

    const onChange = vi.fn()
    container.addEventListener('change', onChange)
    headers[1]!.click()
    await nextTick()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toBe('two')
    expect(headers[0]?.getAttribute('aria-expanded')).toBe('false')
    expect(headers[1]?.getAttribute('aria-expanded')).toBe('true')
  })

  it('opens and closes tx-dialog (modal & bottom variants) and tx-drawer', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-dialog open title="Confirm Deploy">
        <p class="dialog-body">Deploy release v1?</p>
      </tx-dialog>
      <tx-drawer visible title="Inspector Panel">
        <p class="drawer-body">Drawer inspector content</p>
      </tx-drawer>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    // Dialog teleports to document.body
    const dialogEl = document.body.querySelector('.tx-modal__overlay[role="dialog"]')
    expect(dialogEl).not.toBeNull()
    expect(dialogEl?.textContent).toContain('Confirm Deploy')
    expect(dialogEl?.textContent).toContain('Deploy release v1?')

    const onDialogClose = vi.fn()
    const txDialog = container.querySelector('tx-dialog')!
    txDialog.addEventListener('close', onDialogClose)
    const dialogCloseBtn = dialogEl!.querySelector('.tx-modal__close') as HTMLButtonElement
    dialogCloseBtn.click()
    await nextTick()
    expect(onDialogClose).toHaveBeenCalledTimes(1)
    expect(txDialog.open).toBe(false)

    // Bottom dialog variant with JSON btns
    const bottomDialog = document.createElement('tx-dialog')
    bottomDialog.setAttribute('variant', 'bottom')
    bottomDialog.setAttribute('open', '')
    bottomDialog.setAttribute('title', 'Delete Item')
    bottomDialog.setAttribute('message', 'This cannot be undone.')
    bottomDialog.setAttribute('btns', JSON.stringify([{ content: 'Delete', type: 'error' }]))
    container.appendChild(bottomDialog)
    await nextTick()
    const bottomEl = document.body.querySelector('.tx-bottom-dialog[role="dialog"]')
    expect(bottomEl).not.toBeNull()
    expect(bottomEl?.textContent).toContain('Delete Item')
    expect(bottomEl?.textContent).toContain('Delete')
    bottomDialog.open = false
    await nextTick()

    // Drawer teleports to document.body
    const drawerEl = document.body.querySelector('.tx-drawer[role="dialog"]')
    expect(drawerEl).not.toBeNull()
    expect(drawerEl?.classList.contains('tx-drawer--visible')).toBe(true)
    expect(drawerEl?.textContent).toContain('Inspector Panel')
    expect(drawerEl?.textContent).toContain('Drawer inspector content')

    const onDrawerClose = vi.fn()
    const txDrawer = container.querySelector('tx-drawer')!
    txDrawer.addEventListener('close', onDrawerClose)
    const drawerCloseBtn = drawerEl!.querySelector('.tx-drawer__close') as HTMLButtonElement
    drawerCloseBtn.click()
    await nextTick()
    expect(onDrawerClose).toHaveBeenCalledTimes(1)
    expect(txDrawer.visible).toBe(false)
  })

  it('renders tx-tooltip and tx-popover triggers and controls open state', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-tooltip content="Helpful tip" trigger="click"><button class="tip-trigger">Tip</button></tx-tooltip>
      <tx-popover trigger="click">
        <button slot="reference" class="pop-trigger">Open Pop</button>
        <div class="pop-body">Popover Details</div>
      </tx-popover>
    `
    document.body.appendChild(container)
    await nextTick()

    const tooltip = container.querySelector('tx-tooltip')!
    expect(tooltip.querySelector('.tip-trigger')).not.toBeNull()
    tooltip.modelValue = true
    await nextTick()
    expect(document.body.textContent).toContain('Helpful tip')

    const popover = container.querySelector('tx-popover')!
    expect(popover.querySelector('.pop-trigger')).not.toBeNull()
    popover.modelValue = true
    await nextTick()
    expect(document.body.textContent).toContain('Popover Details')
  })

  it('supports tx-select with both JSON options and slotted tx-select-item children', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-select
        class="json-select"
        model-value="vue"
        options='[{"value":"vue","label":"Vue 3"},{"value":"wc","label":"Web Components"}]'
      ></tx-select>
      <tx-select class="slot-select" placeholder="Pick one">
        <tx-select-item value="alpha" label="Alpha Option"></tx-select-item>
        <tx-select-item value="beta">Beta Option</tx-select-item>
      </tx-select>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    const jsonSelect = container.querySelector('.json-select')!
    const jsonInput = jsonSelect.querySelector('input') as HTMLInputElement | null
    expect(jsonInput).not.toBeNull()
    expect(jsonInput?.value).toBe('Vue 3')

    // Open slot-based select and pick an item
    const slotSelect = container.querySelector('.slot-select')! as HTMLElement & { open?: () => void, modelValue?: unknown }
    const onSelectChange = vi.fn()
    slotSelect.addEventListener('change', onSelectChange)

    slotSelect.open?.()
    await nextTick()
    await nextTick()

    const optionItems = Array.from(document.body.querySelectorAll('.tuff-select-item')) as HTMLElement[]
    const betaItem = optionItems.find(el => el.textContent?.includes('Beta Option'))
    expect(betaItem).toBeDefined()
    betaItem!.click()
    await nextTick()

    expect(onSelectChange).toHaveBeenCalledTimes(1)
    expect((onSelectChange.mock.calls[0]![0] as CustomEvent).detail).toBe('beta')
    expect(slotSelect.modelValue).toBe('beta')
  })
})
