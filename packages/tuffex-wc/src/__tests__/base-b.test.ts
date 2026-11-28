import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { BASE_B_BUNDLES, registerTuffexElements } from '../index'

beforeAll(() => {
  registerTuffexElements()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('base Pack B custom elements (33 modules / 41 tags)', () => {
  it('mounts every Pack B tag with zero Vue dev warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const container = document.createElement('div')
      // Mount context-dependent child elements inside their real parent hosts so
      // Vue context-requirement warnings (e.g. TxFormErrorSummary / TxFlatRadioItem) do not fire.
      const nestedChildren = new Set([
        'tx-flat-radio-item',
        'tx-flat-select-item',
        'tx-form-item',
        'tx-form-row',
        'tx-form-error-summary',
        'tx-context-menu-item',
        'tx-dropdown-item',
        'tx-descriptions-item',
      ])

      for (const bundle of BASE_B_BUNDLES) {
        if (nestedChildren.has(bundle.tag))
          continue
        const el = document.createElement(bundle.tag)
        if (bundle.tag === 'tx-flat-radio') {
          el.appendChild(document.createElement('tx-flat-radio-item'))
        }
        else if (bundle.tag === 'tx-flat-select') {
          el.appendChild(document.createElement('tx-flat-select-item'))
        }
        else if (bundle.tag === 'tx-form') {
          el.appendChild(document.createElement('tx-form-error-summary'))
          const row = document.createElement('tx-form-row')
          row.appendChild(document.createElement('tx-form-item'))
          el.appendChild(row)
        }
        else if (bundle.tag === 'tx-context-menu') {
          const item = document.createElement('tx-context-menu-item')
          item.setAttribute('slot', 'menu')
          el.appendChild(item)
        }
        else if (bundle.tag === 'tx-dropdown-menu') {
          el.appendChild(document.createElement('tx-dropdown-item'))
        }
        else if (bundle.tag === 'tx-descriptions') {
          el.appendChild(document.createElement('tx-descriptions-item'))
        }
        container.appendChild(el)
      }
      document.body.appendChild(container)
      await nextTick()
      await nextTick()

      const warnings = warnSpy.mock.calls.map(args => args.map(String).join(' '))
      expect(warnings).toEqual([])
    }
    finally {
      warnSpy.mockRestore()
    }
  })

  it('handles number-input, search-input, sensitive-input, tag-input, scrub-field, segmented-slider, rating, and filter-chips', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-number-input model-value="5" min="0" max="10" step="1"></tx-number-input>
      <tx-search-input placeholder="Find component"></tx-search-input>
      <tx-sensitive-input label="Secret Token" model-value="tok_12345"></tx-sensitive-input>
      <tx-tag-input model-value='["alpha","beta"]'></tx-tag-input>
      <tx-scrub-field label="W" model-value="40" min="0" max="100" suffix="px"></tx-scrub-field>
      <tx-segmented-slider model-value="md" segments='[{"value":"sm","label":"SM"},{"value":"md","label":"MD"},{"value":"lg","label":"LG"}]'></tx-segmented-slider>
      <tx-rating model-value="3" max-stars="5" show-text></tx-rating>
      <tx-filter-chips model-value="all" items='[{"value":"all","label":"All"},{"value":"active","label":"Active","count":4}]'></tx-filter-chips>
    `
    document.body.appendChild(container)
    await nextTick()

    // NumberInput increment button
    const numInput = container.querySelector('tx-number-input')!
    const onNumChange = vi.fn()
    numInput.addEventListener('change', onNumChange)
    const incBtn = numInput.querySelector('button[aria-label="Increase value"]') as HTMLButtonElement
    expect(incBtn).not.toBeNull()
    incBtn.click()
    await nextTick()
    expect(onNumChange).toHaveBeenCalledTimes(1)
    expect((onNumChange.mock.calls[0]![0] as CustomEvent).detail).toBe(6)
    expect(numInput.modelValue).toBe(6)

    // SearchInput
    const searchInput = container.querySelector('tx-search-input')!
    const searchEl = searchInput.querySelector('input') as HTMLInputElement
    searchEl.value = 'table'
    searchEl.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(searchInput.modelValue).toBe('table')

    // SensitiveInput reveal
    const sensitive = container.querySelector('tx-sensitive-input')!
    expect(sensitive.textContent).toContain('Secret Token')

    // TagInput JSON coercion
    expect(container.querySelector('tx-tag-input')?.textContent).toContain('alpha')
    expect(container.querySelector('tx-tag-input')?.textContent).toContain('beta')

    // ScrubField
    expect(container.querySelector('tx-scrub-field')?.textContent).toContain('W')

    // SegmentedSlider
    const seg = container.querySelector('tx-segmented-slider')!
    expect(seg.textContent).toContain('SM')
    expect(seg.textContent).toContain('LG')

    // Rating click 5th star
    const rating = container.querySelector('tx-rating')!
    const onRateChange = vi.fn()
    rating.addEventListener('change', onRateChange)
    const stars = Array.from(rating.querySelectorAll('.tx-rating__star, button')) as HTMLElement[]
    expect(stars.length).toBeGreaterThanOrEqual(5)
    stars[4]!.click()
    await nextTick()
    expect(onRateChange).toHaveBeenCalledTimes(1)
    expect((onRateChange.mock.calls[0]![0] as CustomEvent).detail).toBe(5)
    expect(rating.modelValue).toBe(5)

    // FilterChips click
    const chips = container.querySelector('tx-filter-chips')!
    const onChipChange = vi.fn()
    chips.addEventListener('change', onChipChange)
    const activeChip = Array.from(chips.querySelectorAll('button')).find(b => b.textContent?.includes('Active'))
    expect(activeChip).toBeDefined()
    activeChip!.click()
    await nextTick()
    expect(onChipChange).toHaveBeenCalledTimes(1)
    expect((onChipChange.mock.calls[0]![0] as CustomEvent).detail).toBe('active')
  })

  it('coordinates flat-radio, flat-select, search-select, cascader, tree, tree-select, date-picker, and picker', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-flat-radio model-value="a">
        <tx-flat-radio-item value="a" label="Option A"></tx-flat-radio-item>
        <tx-flat-radio-item value="b" label="Option B"></tx-flat-radio-item>
      </tx-flat-radio>
      <tx-flat-select model-value="en" placeholder="Choose">
        <tx-flat-select-item value="en" label="English"></tx-flat-select-item>
        <tx-flat-select-item value="zh" label="中文"></tx-flat-select-item>
      </tx-flat-select>
      <tx-search-select placeholder="Model" options='[{"value":"g","label":"Gemini"}]'></tx-search-select>
      <tx-cascader placeholder="Path" options='[{"value":"a","label":"Root","children":[{"value":"b","label":"Leaf"}]}]'></tx-cascader>
      <tx-tree default-expanded-keys='["root"]' nodes='[{"key":"root","label":"Packages","children":[{"key":"wc","label":"tuffex-wc"}]}]'></tx-tree>
      <tx-tree-select placeholder="Node" nodes='[{"key":"root","label":"Workspace"}]'></tx-tree-select>
      <tx-date-picker variant="field" model-value="2026-11-27"></tx-date-picker>
      <tx-picker popup="false" columns='[{"options":[{"value":"mac","label":"macOS"},{"value":"win","label":"Windows"}]}]'></tx-picker>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    // FlatRadio coordination
    const flatRadio = container.querySelector('tx-flat-radio')!
    const onRadioChange = vi.fn()
    flatRadio.addEventListener('change', onRadioChange)
    const optionB = Array.from(flatRadio.querySelectorAll('.tx-flat-radio-item')).find(el => el.textContent?.includes('Option B')) as HTMLElement
    expect(optionB).toBeDefined()
    optionB.click()
    await nextTick()
    expect(onRadioChange).toHaveBeenCalledTimes(1)
    expect((onRadioChange.mock.calls[0]![0] as CustomEvent).detail).toBe('b')

    // FlatSelect coordination
    const flatSelect = container.querySelector('tx-flat-select')!
    const onSelectChange = vi.fn()
    flatSelect.addEventListener('change', onSelectChange)
    const zhItem = Array.from(flatSelect.querySelectorAll('.tx-flat-select-item')).find(el => el.textContent?.includes('中文')) as HTMLElement
    expect(zhItem).toBeDefined()
    zhItem.click()
    await nextTick()
    expect(onSelectChange).toHaveBeenCalledTimes(1)
    expect((onSelectChange.mock.calls[0]![0] as CustomEvent).detail).toBe('zh')

    // Tree JSON nodes + selection
    const tree = container.querySelector('tx-tree')!
    expect(tree.textContent).toContain('Packages')
    expect(tree.textContent).toContain('tuffex-wc')
    const onTreeSelect = vi.fn()
    tree.addEventListener('select', onTreeSelect)
    const wcNode = Array.from(tree.querySelectorAll('[role="treeitem"]')).find(el => el.textContent?.includes('tuffex-wc')) as HTMLElement
    expect(wcNode).toBeDefined()
    wcNode.click()
    await nextTick()
    expect(onTreeSelect).toHaveBeenCalledTimes(1)
    expect((onTreeSelect.mock.calls[0]![0] as CustomEvent).detail.key).toBe('wc')

    // DatePicker & Picker
    expect(container.querySelector('tx-date-picker')?.textContent).toContain('2026-11-27')
    expect(container.querySelector('tx-picker')?.textContent).toContain('macOS')
    expect(container.querySelector('tx-search-select .tx-search-select')).not.toBeNull()
    expect(container.querySelector('tx-cascader .tx-cascader')).not.toBeNull()
    expect(container.querySelector('tx-tree-select .tx-tree-select')).not.toBeNull()
  })

  it('coordinates tx-form (+ form-item/form-row/form-error-summary), modal-form, drawer-form, and steps-form', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-form id="profile-form" layout="stacked" model='{"email":""}'>
        <tx-form-error-summary title="Fix errors"></tx-form-error-summary>
        <tx-form-row label="Contact">
          <tx-form-item label="Email" prop="email" required>
            <tx-input placeholder="you@example.com"></tx-input>
          </tx-form-item>
        </tx-form-row>
      </tx-form>
      <tx-modal-form open title="Edit Record">
        <p class="mf-body">Modal Form Body</p>
      </tx-modal-form>
      <tx-drawer-form visible title="Quick Edit">
        <p class="df-body">Drawer Form Body</p>
      </tx-drawer-form>
      <tx-steps-form steps='[{"title":"Account","content":"Step One"},{"title":"Confirm","content":"Step Two"}]'></tx-steps-form>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    const form = container.querySelector('tx-form') as HTMLElement & { validate?: () => Promise<boolean> }
    expect(form.querySelector('form.tx-form')).not.toBeNull()
    expect(form.querySelector('label.tx-form-item__label')?.textContent).toContain('Email')
    expect(typeof form.validate).toBe('function')

    const valid = await form.validate?.()
    await nextTick()
    expect(valid).toBe(false)
    expect(form.textContent).toContain('Email is required')

    // ModalForm & DrawerForm open in document.body
    expect(document.body.textContent).toContain('Edit Record')
    expect(document.body.textContent).toContain('Modal Form Body')
    expect(document.body.textContent).toContain('Quick Edit')
    expect(document.body.textContent).toContain('Drawer Form Body')

    // StepsForm renders step header + action button
    const stepsForm = container.querySelector('tx-steps-form')!
    expect(stepsForm.textContent).toContain('Account')
    expect(stepsForm.textContent).toContain('Confirm')
    expect(stepsForm.textContent).toContain('Step One')
  })

  it('renders context-menu, dropdown-menu, flat-dropdown, selection-actions, data-table (JSON columns/data), descriptions, sortable-list, transfer, uploaders, gallery, preview, icon-picker', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-context-menu trigger="both">
        <div slot="trigger" class="cm-trigger">Target</div>
        <tx-context-menu-item slot="menu">Inspect</tx-context-menu-item>
      </tx-context-menu>
      <tx-dropdown-menu>
        <button slot="trigger" class="dd-trigger">Menu</button>
        <tx-dropdown-item>Rename</tx-dropdown-item>
      </tx-dropdown-menu>
      <tx-flat-dropdown trigger="click">
        <button slot="trigger" class="fd-trigger">Flat</button>
        <div class="fd-panel">Flat Body</div>
      </tx-flat-dropdown>
      <tx-selection-actions state="idle"></tx-selection-actions>
      <tx-data-table
        row-key="id"
        selectable
        columns='[{"key":"name","title":"Name","dataIndex":"name","sortable":true},{"key":"tier","title":"Tier","dataIndex":"tier"}]'
        data='[{"id":"1","name":"Button","tier":"A"},{"id":"2","name":"DataTable","tier":"B"}]'
      ></tx-data-table>
      <tx-descriptions columns="2">
        <tx-descriptions-item label="Package">@talex-touch/tuffex-wc</tx-descriptions-item>
        <tx-descriptions-item label="Coverage">99 / 99</tx-descriptions-item>
      </tx-descriptions>
      <tx-sortable-list model-value='[{"id":"First"},{"id":"Second"}]'></tx-sortable-list>
      <tx-transfer data='[{"key":"a","label":"Alpha"},{"key":"b","label":"Beta"}]' model-value='["a"]'></tx-transfer>
      <tx-file-uploader button-text="Browse"></tx-file-uploader>
      <tx-image-uploader upload-text="Add image"></tx-image-uploader>
      <tx-image-gallery items='[{"id":"1","url":"https://example.com/a.png","name":"Shot A"}]'></tx-image-gallery>
      <tx-image-preview images='["https://example.com/a.png"]'></tx-image-preview>
      <tx-icon-picker model-value="emoji:🚀" shape="rounded"></tx-icon-picker>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    // DataTable JSON columns & data + row-click event
    const table = container.querySelector('tx-data-table')!
    expect(table.querySelector('table')).not.toBeNull()
    expect(table.textContent).toContain('Button')
    expect(table.textContent).toContain('DataTable')

    const onRowClick = vi.fn()
    table.addEventListener('row-click', onRowClick)
    const firstRow = table.querySelector('tbody tr') as HTMLTableRowElement
    expect(firstRow).not.toBeNull()
    firstRow.click()
    await nextTick()
    expect(onRowClick).toHaveBeenCalledTimes(1)
    expect((onRowClick.mock.calls[0]![0] as CustomEvent).detail.row.name).toBe('Button')

    // Descriptions + promoted context
    const descriptions = container.querySelector('tx-descriptions')!
    expect(descriptions.textContent).toContain('@talex-touch/tuffex-wc')
    expect(descriptions.textContent).toContain('99 / 99')

    // DropdownMenu open + item select (slotted tx-dropdown-item teleports into document.body when opened)
    const dd = container.querySelector('tx-dropdown-menu')!
    const onDdSelect = vi.fn()
    document.body.addEventListener('select', onDdSelect)
    dd.modelValue = true
    await nextTick()
    await nextTick()
    const menuItemEl = document.body.querySelector('tx-dropdown-item [role="menuitem"]') as HTMLElement | null
    expect(menuItemEl).not.toBeNull()
    menuItemEl!.click()
    await new Promise(resolveTimer => setTimeout(resolveTimer, 200))
    await nextTick()
    document.body.removeEventListener('select', onDdSelect)
    expect(onDdSelect).toHaveBeenCalledTimes(1)

    // Remaining controls rendered
    expect(container.querySelector('tx-context-menu .cm-trigger')).not.toBeNull()
    expect(container.querySelector('tx-flat-dropdown .fd-trigger')).not.toBeNull()
    expect(container.querySelector('tx-sortable-list')?.textContent).toContain('First')
    expect(container.querySelector('tx-transfer')?.textContent).toContain('Alpha')
    expect(container.querySelector('tx-transfer')?.textContent).toContain('Beta')
    expect(container.querySelector('tx-file-uploader')?.textContent).toContain('Browse')
    expect(container.querySelector('tx-image-uploader')?.textContent).toContain('Add image')
    expect(container.querySelector('tx-image-gallery img')).not.toBeNull()
    expect(container.querySelector('tx-icon-picker')?.textContent).toContain('🚀')
  })

  it('dynamically imports built dist/index.js with zero _export_sfc TDZ errors when built', async () => {
    const distEntryPath = resolve(process.cwd(), 'dist/index.js')
    if (!existsSync(distEntryPath))
      return

    const distMod = await import(/* @vite-ignore */ pathToFileURL(distEntryPath).href)
    expect(distMod.WC_READY_COMPONENT_IDS).toHaveLength(100)
    expect(distMod.ALL_TUFFEX_ELEMENT_BUNDLES).toHaveLength(123)
    expect(typeof distMod.registerTuffexElements).toBe('function')
    expect(typeof distMod.defineTxDataTable).toBe('function')
  })
})
