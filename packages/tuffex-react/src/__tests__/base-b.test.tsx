import type { TxFormHandle } from '../components/base-b'
import { act, createRef } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as BaseB from '../components/base-b'
import {
  BASE_B_COMPONENT_IDS,
  BASE_B_REACT_MANIFEST,
  TxCascader,
  TxContextMenu,
  TxContextMenuItem,
  TxDataTable,
  TxDatePicker,
  TxDescriptions,
  TxDescriptionsItem,
  TxDrawerForm,
  TxDropdownItem,
  TxDropdownMenu,
  TxFileUploader,
  TxFilterChips,
  TxFlatDropdown,
  TxFlatRadio,
  TxFlatRadioItem,
  TxFlatSelect,
  TxFlatSelectItem,
  TxForm,
  TxFormErrorSummary,
  TxFormItem,
  TxFormRow,
  TxFormStep,
  TxIconPicker,
  TxImageGallery,
  TxImagePreview,
  TxImageUploader,
  TxModalForm,
  TxNumberInput,
  TxPicker,
  TxRating,
  TxScrubField,
  TxSearchInput,
  TxSearchSelect,
  TxSegmentedSlider,
  TxSelectionActions,
  TxSensitiveInput,
  TxSortableList,
  TxStepsForm,
  TxTagInput,
  TxTransfer,
  TxTree,
  TxTreeSelect,
} from '../components/base-b'
import { TxButton } from '../components/TxButton'
import { TxInput } from '../components/TxInput'
import { cleanupAll, mount } from './render-helper'

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

afterEach(() => {
  cleanupAll()
})

describe('pack B manifest & export contract (33 modules)', () => {
  const LOCKED_IDS = [
    'number-input',
    'search-input',
    'sensitive-input',
    'tag-input',
    'scrub-field',
    'segmented-slider',
    'rating',
    'filter-chips',
    'flat-radio',
    'flat-select',
    'search-select',
    'cascader',
    'tree',
    'tree-select',
    'date-picker',
    'picker',
    'form',
    'modal-form',
    'drawer-form',
    'steps-form',
    'context-menu',
    'dropdown-menu',
    'flat-dropdown',
    'selection-actions',
    'data-table',
    'descriptions',
    'sortable-list',
    'transfer',
    'file-uploader',
    'image-uploader',
    'image-gallery',
    'image-preview',
    'icon-picker',
  ]

  it('locks all 33 Pack B module IDs and exports every declared symbol', () => {
    expect(BASE_B_COMPONENT_IDS).toHaveLength(33)
    expect([...BASE_B_COMPONENT_IDS].sort()).toEqual([...LOCKED_IDS].sort())

    const moduleExports = BaseB as Record<string, unknown>
    for (const id of LOCKED_IDS) {
      const entry = BASE_B_REACT_MANIFEST[id]
      expect(entry, `manifest missing ${id}`).toBeTruthy()
      expect(entry!.id).toBe(id)
      expect(entry!.status).toBe('ready')
      expect(['A', 'B', 'C']).toContain(entry!.tier)
      expect(entry!.sampleTsx.length).toBeGreaterThan(5)
      expect(entry!.exports.length).toBeGreaterThan(0)
      for (const symbol of entry!.exports)
        expect(moduleExports[symbol], `missing export ${symbol} for ${id}`).toBeTruthy()
    }
  })
})

describe('pack B inputs & interactive controls', () => {
  it('txNumberInput steps within bounds and formats precision', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxNumberInput defaultValue={5} min={4} max={6} step={1} precision={1} onChange={onChange} />,
    )
    const input = container.querySelector<HTMLInputElement>('input')!
    const inc = container.querySelector<HTMLButtonElement>('.tx-number-input__control--inc')!
    const dec = container.querySelector<HTMLButtonElement>('.tx-number-input__control--dec')!

    expect(input.value).toBe('5.0')
    act(() => {
      inc.click()
    })
    expect(onChange).toHaveBeenLastCalledWith(6)
    expect(inc.disabled).toBe(true)

    act(() => {
      dec.click()
      dec.click()
    })
    expect(onChange).toHaveBeenLastCalledWith(4)
    expect(dec.disabled).toBe(true)
  })

  it('txSearchInput emits search on input, Enter, and clear', () => {
    const onSearch = vi.fn()
    const onClear = vi.fn()
    const { container } = mount(
      <TxSearchInput defaultValue="hello" searchDebounce={0} onSearch={onSearch} onClear={onClear} />,
    )
    const input = container.querySelector<HTMLInputElement>('input')!
    act(() => {
      setNativeInputValue(input, 'world')
    })
    expect(onSearch).toHaveBeenCalledWith('world')

    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-input__clear')!.click()
    })
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onSearch).toHaveBeenLastCalledWith('')
  })

  it('txSensitiveInput starts masked, reveals on click, hides, and copies', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const onReveal = vi.fn()
    const onMask = vi.fn()
    const onCopy = vi.fn()

    const { container } = mount(
      <TxSensitiveInput
        label="Secret Token"
        defaultValue="sk-test-999"
        onReveal={onReveal}
        onMask={onMask}
        onCopy={onCopy}
      />,
    )

    expect(container.querySelector('.tx-sensitive-input__mask')).toBeTruthy()
    expect(container.querySelector('input')).toBeNull()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.tx-sensitive-input__copy')!.click()
    })
    expect(writeText).toHaveBeenCalledWith('sk-test-999')
    expect(onCopy).toHaveBeenCalledWith('sk-test-999')

    act(() => {
      container.querySelector<HTMLDivElement>('.tx-sensitive-input__mask')!.click()
    })
    expect(onReveal).toHaveBeenCalledTimes(1)
    expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('sk-test-999')

    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-sensitive-input__eye')!.click()
    })
    expect(onMask).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.tx-sensitive-input__mask')).toBeTruthy()
  })

  it('txTagInput adds tags on Enter/separator and removes via Backspace/close', () => {
    const onChange = vi.fn()
    const { container } = mount(<TxTagInput defaultValue={['vue']} onChange={onChange} />)
    const input = container.querySelector<HTMLInputElement>('.tx-tag-input__input')!

    act(() => {
      setNativeInputValue(input, 'react')
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(['vue', 'react'])
    expect(container.querySelectorAll('.tx-tag')).toHaveLength(2)

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith(['vue'])
  })

  it('txScrubField, TxSegmentedSlider, TxRating, and TxFilterChips respond to interactions', () => {
    const onScrub = vi.fn()
    const scrub = mount(<TxScrubField label="W" defaultValue={50} min={0} max={100} step={2} onChange={onScrub} />)
    const scrubInput = scrub.container.querySelector<HTMLInputElement>('.tx-bui-scrub-field__input')!
    act(() => {
      scrubInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }))
    })
    expect(onScrub).toHaveBeenCalledWith(70)

    const onSeg = vi.fn()
    const seg = mount(
      <TxSegmentedSlider
        defaultValue="sm"
        segments={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]}
        onChange={onSeg}
      />,
    )
    act(() => {
      seg.container.querySelectorAll<HTMLButtonElement>('[role="radio"]')[2]!.click()
    })
    expect(onSeg).toHaveBeenCalledWith('lg')

    const onRate = vi.fn()
    const rate = mount(<TxRating defaultValue={2} maxStars={5} showText onChange={onRate} />)
    act(() => {
      rate.container.querySelectorAll<HTMLButtonElement>('.tx-rating__star')[3]!.click()
    })
    expect(onRate).toHaveBeenCalledWith(4)
    expect(rate.container.querySelector('.tx-rating__text')?.textContent).toContain('4 / 5')

    const onChip = vi.fn()
    const chips = mount(
      <TxFilterChips
        defaultValue="all"
        items={[{ value: 'all', label: 'All', count: 10 }, { value: 'active', label: 'Active', count: 3 }]}
        onChange={onChip}
      />,
    )
    act(() => {
      chips.container.querySelectorAll<HTMLButtonElement>('.tx-bui-filter-chips__chip')[1]!.click()
    })
    expect(onChip).toHaveBeenCalledWith('active')
  })
})

describe('pack B selection, tree, cascader, date-picker & picker', () => {
  it('txFlatRadio supports single and multiple modes via Context', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxFlatRadio multiple defaultValue={['a']} onChange={onChange}>
        <TxFlatRadioItem value="a">Alpha</TxFlatRadioItem>
        <TxFlatRadioItem value="b">Beta</TxFlatRadioItem>
      </TxFlatRadio>,
    )
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('.tx-flat-radio-item')[1]!.click()
    })
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
  })

  it('txFlatSelect and TxSearchSelect open portals and update values', () => {
    const onFlatChange = vi.fn()
    const flat = mount(
      <TxFlatSelect defaultValue="en" onChange={onFlatChange}>
        <TxFlatSelectItem value="en" label="English" />
        <TxFlatSelectItem value="zh" label="Chinese" />
      </TxFlatSelect>,
    )
    act(() => {
      flat.container.querySelector<HTMLButtonElement>('.tx-flat-select__trigger')!.click()
    })
    const opts = document.body.querySelectorAll<HTMLElement>('.tx-flat-select-item')
    expect(opts).toHaveLength(2)
    act(() => {
      opts[1]!.click()
    })
    expect(onFlatChange).toHaveBeenCalledWith('zh')
    expect(document.body.querySelector('.tx-flat-select__dropdown')).toBeNull()

    const onSearchSelect = vi.fn()
    const ss = mount(
      <TxSearchSelect
        options={[{ value: 'vue', label: 'Vue 3' }, { value: 'react', label: 'React 19' }]}
        onChange={onSearchSelect}
      />,
    )
    const ssInput = ss.container.querySelector<HTMLInputElement>('input')!
    act(() => {
      ssInput.focus()
      setNativeInputValue(ssInput, 'React')
    })
    const ssItems = document.body.querySelectorAll<HTMLButtonElement>('.tx-search-select__item')
    expect(ssItems).toHaveLength(1)
    act(() => {
      ssItems[0]!.click()
    })
    expect(onSearchSelect).toHaveBeenCalledWith('react')
  })

  it('txCascader drills down columns and commits leaf path', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxCascader
        options={[
          {
            value: 'cn',
            label: 'China',
            children: [{ value: 'sz', label: 'Shenzhen' }],
          },
        ]}
        onChange={onChange}
      />,
    )
    act(() => {
      container.querySelector<HTMLDivElement>('.tx-cascader__value')!.click()
    })
    act(() => {
      document.body.querySelectorAll<HTMLButtonElement>('.tx-cascader__option')[0]!.click()
    })
    const allOpts = document.body.querySelectorAll<HTMLButtonElement>('.tx-cascader__option')
    expect(allOpts).toHaveLength(2)
    act(() => {
      allOpts[1]!.click()
    })
    expect(onChange).toHaveBeenCalledWith(['cn', 'sz'])
    expect(container.querySelector('.tx-cascader__text')?.textContent).toBe('China / Shenzhen')
  })

  it('txTree expands nodes, supports checkable multi-select, and TxTreeSelect selects in portal', () => {
    const onToggle = vi.fn()
    const onChange = vi.fn()
    const nodes = [
      {
        key: 'src',
        label: 'src',
        children: [
          { key: 'index', label: 'index.ts' },
          { key: 'utils', label: 'utils.ts' },
        ],
      },
    ]
    const tree = mount(<TxTree nodes={nodes} checkable onToggle={onToggle} onChange={onChange} />)
    expect(tree.container.querySelectorAll('[role="treeitem"]')).toHaveLength(1)

    act(() => {
      tree.container.querySelector<HTMLButtonElement>('.tx-tree__caret')!.click()
    })
    expect(onToggle).toHaveBeenCalledWith({ key: 'src', expanded: true })
    expect(tree.container.querySelectorAll('[role="treeitem"]')).toHaveLength(3)

    act(() => {
      tree.container.querySelectorAll<HTMLButtonElement>('.tx-tree__label')[1]!.click()
    })
    expect(onChange).toHaveBeenCalledWith(['index'])

    const onTsChange = vi.fn()
    const ts = mount(<TxTreeSelect nodes={nodes} defaultExpandedKeys={['src']} onChange={onTsChange} />)
    act(() => {
      ts.container.querySelector<HTMLDivElement>('.tx-tree-select__value')!.click()
    })
    act(() => {
      document.body.querySelectorAll<HTMLButtonElement>('.tx-tree-select__panel .tx-tree__label')[1]!.click()
    })
    expect(onTsChange).toHaveBeenCalledWith('index')
  })

  it('txDatePicker selects single and range dates and TxPicker confirms columns', () => {
    const onDate = vi.fn()
    const dp = mount(<TxDatePicker defaultValue="2026-11-10" onChange={onDate} />)
    act(() => {
      dp.container.querySelector<HTMLButtonElement>('.tx-date-picker-field')!.click()
    })
    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-date="2026-11-15"]')!.click()
    })
    expect(onDate).toHaveBeenCalledWith('2026-11-15')

    const onRange = vi.fn()
    const rangeDp = mount(<TxDatePicker range defaultValue={['2026-11-01', '2026-11-02']} onChange={onRange} />)
    act(() => {
      rangeDp.container.querySelector<HTMLButtonElement>('.tx-date-picker-field')!.click()
    })
    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-date="2026-11-20"]')!.click()
    })
    act(() => {
      document.body.querySelector<HTMLButtonElement>('[data-date="2026-11-12"]')!.click()
    })
    expect(onRange).toHaveBeenCalledWith(['2026-11-12', '2026-11-20'])

    const onConfirm = vi.fn()
    const picker = mount(
      <TxPicker
        columns={[
          { key: 'plan', options: [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }] },
        ]}
        onConfirm={onConfirm}
      />,
    )
    act(() => {
      picker.container.querySelectorAll<HTMLButtonElement>('.tx-picker__item')[1]!.click()
    })
    act(() => {
      picker.container.querySelector<HTMLButtonElement>('.tx-picker__btn--confirm')!.click()
    })
    expect(onConfirm).toHaveBeenCalledWith(['pro'])
  })
})

describe('pack B forms (TxForm, TxModalForm, TxDrawerForm, TxStepsForm)', () => {
  it('txForm validates required/email rules, renders TxFormErrorSummary, and submits when valid', async () => {
    const formRef = createRef<TxFormHandle>()
    const onSubmitSuccess = vi.fn()
    const { container } = mount(
      <TxForm
        ref={formRef}
        defaultValues={{ email: '' }}
        rules={{ email: [{ required: true }, { type: 'email', message: 'Invalid email' }] }}
        onSubmitSuccess={onSubmitSuccess}
      >
        <TxFormErrorSummary />
        <TxFormRow label="Contact">
          <TxFormItem label="Email" prop="email" hint="Work address">
            <TxInput placeholder="you@example.com" />
          </TxFormItem>
        </TxFormRow>
        <TxButton nativeType="submit">Submit</TxButton>
      </TxForm>,
    )

    let valid = true
    await act(async () => {
      valid = await formRef.current!.validate()
    })
    expect(valid).toBe(false)
    expect(container.querySelector('.tx-form-error-summary')?.textContent).toContain('Email is required')

    await act(async () => {
      formRef.current!.setFieldValue('email', 'ada@tuff.dev')
    })
    await act(async () => {
      valid = await formRef.current!.validate()
    })
    expect(valid).toBe(true)
    expect(container.querySelector('.tx-form-error-summary')).toBeNull()

    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onSubmitSuccess).toHaveBeenCalledWith({ email: 'ada@tuff.dev' })
  })

  it('txModalForm, TxDrawerForm, and TxStepsForm validate and submit cleanly', async () => {
    const onModalSubmit = vi.fn()
    mount(
      <TxModalForm
        defaultOpen
        title="New Project"
        initialValues={{ name: 'Tuff' }}
        rules={{ name: { required: true } }}
        onSubmitSuccess={onModalSubmit}
      >
        {({ values, setFieldValue }) => (
          <TxFormItem label="Name" prop="name">
            <TxInput value={values.name ?? ''} onChange={v => setFieldValue('name', v)} />
          </TxFormItem>
        )}
      </TxModalForm>,
    )
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('New Project')
    await act(async () => {
      document.body.querySelector<HTMLFormElement>('[role="dialog"] form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(onModalSubmit).toHaveBeenCalledWith({ name: 'Tuff' })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    const onDrawerSubmit = vi.fn()
    mount(
      <TxDrawerForm
        defaultOpen
        title="Settings"
        initialValues={{ title: 'Docs' }}
        onSubmitSuccess={onDrawerSubmit}
      >
        <TxFormItem label="Title" prop="title">
          <TxInput defaultValue="Docs" />
        </TxFormItem>
      </TxDrawerForm>,
    )
    await act(async () => {
      document.body.querySelector<HTMLFormElement>('.tx-drawer form')!.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(onDrawerSubmit).toHaveBeenCalledWith({ title: 'Docs' })

    const onStepsSubmit = vi.fn()
    const stepsTree = mount(
      <TxStepsForm defaultValues={{ name: 'Alice' }} onSubmitSuccess={onStepsSubmit}>
        <TxFormStep title="Profile" fields={['name']}>
          <TxFormItem label="Name" prop="name" required>
            <TxInput defaultValue="Alice" />
          </TxFormItem>
        </TxFormStep>
        <TxFormStep title="Review">
          <p>Ready to submit</p>
        </TxFormStep>
      </TxStepsForm>,
    )
    await act(async () => {
      stepsTree.container.querySelector<HTMLButtonElement>('.tx-steps-form__actions button')!.click()
    })
    expect(stepsTree.container.textContent).toContain('Ready to submit')
    await act(async () => {
      stepsTree.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onStepsSubmit).toHaveBeenCalledWith({ name: 'Alice' })
  })
})

describe('pack B menus & floating actions', () => {
  it('txContextMenu, TxDropdownMenu, TxFlatDropdown, and TxSelectionActions interact via portals', () => {
    const onCtxSelect = vi.fn()
    const ctxTree = mount(
      <TxContextMenu
        menu={(
          <>
            <TxContextMenuItem onSelect={onCtxSelect}>Copy</TxContextMenuItem>
            <TxContextMenuItem danger>Delete</TxContextMenuItem>
          </>
        )}
      >
        <div className="ctx-target">Right click area</div>
      </TxContextMenu>,
    )
    act(() => {
      ctxTree.container.querySelector('.tx-context-menu__trigger')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 90 }),
      )
    })
    const ctxItems = document.body.querySelectorAll<HTMLButtonElement>('.tx-context-menu-item')
    expect(ctxItems).toHaveLength(2)
    act(() => {
      ctxItems[0]!.click()
    })
    expect(onCtxSelect).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.tx-context-menu')).toBeNull()

    const onDropSelect = vi.fn()
    const dropTree = mount(
      <TxDropdownMenu label="More">
        <TxDropdownItem checked onSelect={onDropSelect}>Pin tab</TxDropdownItem>
      </TxDropdownMenu>,
    )
    act(() => {
      dropTree.container.querySelector<HTMLElement>('.tx-dropdown')!.click()
    })
    const dropItem = document.body.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!
    expect(dropItem.getAttribute('aria-checked')).toBe('true')
    act(() => {
      dropItem.click()
    })
    expect(onDropSelect).toHaveBeenCalledTimes(1)

    const flatDrop = mount(
      <TxFlatDropdown trigger="click" content={({ close }) => <button type="button" className="fd-close" onClick={close}>Close</button>}>
        <button type="button">Trigger</button>
      </TxFlatDropdown>,
    )
    act(() => {
      flatDrop.container.querySelector<HTMLElement>('.tx-flat-dropdown')!.click()
    })
    expect(document.body.querySelector('.tx-flat-dropdown__panel')).toBeTruthy()
    act(() => {
      document.body.querySelector<HTMLButtonElement>('.fd-close')!.click()
    })
    expect(document.body.querySelector('.tx-flat-dropdown__panel')).toBeNull()

    const onSelAction = vi.fn()
    const onSelSubmit = vi.fn()
    const sel = mount(
      <TxSelectionActions
        inline
        selection={{ text: 'Quick brown fox', rects: [{ left: 10, top: 10, right: 120, bottom: 30, width: 110, height: 20 }] }}
        onAction={onSelAction}
        onSubmit={onSelSubmit}
      />,
    )
    act(() => {
      sel.container.querySelector<HTMLButtonElement>('.tx-bui-selection-actions__control')!.click()
    })
    expect(onSelAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'explain' }))

    const selInput = sel.container.querySelector<HTMLInputElement>('.tx-bui-selection-actions__input')!
    act(() => {
      setNativeInputValue(selInput, 'Make concise')
    })
    act(() => {
      sel.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onSelSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Make concise' }))
  })
})

describe('pack B data & media components', () => {
  it('txDataTable sorts columns, selects rows, expands details, and supports render props', () => {
    const onSortChange = vi.fn()
    const onSelectionChange = vi.fn()
    const rows = [
      { id: 'b', name: 'Bravo', score: 20 },
      { id: 'a', name: 'Alpha', score: 95 },
    ]
    const { container } = mount(
      <TxDataTable
        columns={[
          { key: 'name', title: 'Name', sortable: true, render: val => <strong>{String(val)}</strong> },
          { key: 'score', title: 'Score', sortable: true },
        ]}
        data={rows}
        selectable
        expandable
        renderExpandedRow={row => (
          <div className="detail-row">
            Detail for
            {' '}
            {row.name}
          </div>
        )}
        onSortChange={onSortChange}
        onSelectionChange={onSelectionChange}
      />,
    )

    // Sort ascending by Name
    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-data-table__sort-button')!.click()
    })
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', order: 'asc' })
    const renderedNames = Array.from(container.querySelectorAll('tbody strong')).map(el => el.textContent)
    expect(renderedNames).toEqual(['Alpha', 'Bravo'])

    // Select first row
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('tbody .tx-checkbox')[0]!.click()
    })
    expect(onSelectionChange).toHaveBeenCalledWith(['a'])

    // Expand first row
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('.tx-data-table__expand-toggle')[0]!.click()
    })
    expect(container.querySelector('.detail-row')?.textContent).toContain('Detail for Alpha')
  })

  it('txDescriptions, TxSortableList, and TxTransfer work interactively', () => {
    const desc = mount(
      <TxDescriptions columns={2} emptyText="N/A">
        <TxDescriptionsItem label="Count">{0}</TxDescriptionsItem>
        <TxDescriptionsItem label="Missing" />
      </TxDescriptions>,
    )
    const values = Array.from(desc.container.querySelectorAll('dd')).map(el => el.textContent)
    expect(values).toEqual(['0', 'N/A'])

    const onReorder = vi.fn()
    const sortable = mount(
      <TxSortableList
        defaultValue={[{ id: '1', label: 'First' }, { id: '2', label: 'Second' }]}
        onReorder={onReorder}
      />,
    )
    const firstLi = sortable.container.querySelectorAll<HTMLLIElement>('.tx-sortable-list__item')[0]!
    act(() => {
      firstLi.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    })
    act(() => {
      firstLi.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(onReorder).toHaveBeenCalledWith(expect.objectContaining({ from: 0, to: 1 }))

    const onTransfer = vi.fn()
    const transfer = mount(
      <TxTransfer
        data={[{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }]}
        defaultValue={[]}
        orderable
        onChange={onTransfer}
      />,
    )
    act(() => {
      transfer.container.querySelector<HTMLButtonElement>('.tx-transfer__panel--source .tx-transfer__row .tx-checkbox')!.click()
    })
    act(() => {
      transfer.container.querySelectorAll<HTMLButtonElement>('.tx-transfer__action-btn')[0]!.click()
    })
    expect(onTransfer).toHaveBeenCalledWith(['a'])
  })

  it('txFileUploader, TxImageUploader, TxImageGallery, TxImagePreview, and TxIconPicker work end-to-end', () => {
    const file = new File(['hello'], 'spec.txt', { type: 'text/plain' })
    const onFiles = vi.fn()
    const fu = mount(<TxFileUploader multiple onChange={onFiles} />)
    const fuInput = fu.container.querySelector<HTMLInputElement>('.tx-file-uploader__input')!
    Object.defineProperty(fuInput, 'files', { value: [file], configurable: true })
    act(() => {
      fuInput.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(fu.container.textContent).toContain('spec.txt')

    const onImgRemove = vi.fn()
    const iu = mount(
      <TxImageUploader
        defaultValue={[{ id: 'img-1', url: 'https://example.com/a.png', name: 'Cover' }]}
        onRemove={onImgRemove}
      />,
    )
    act(() => {
      iu.container.querySelector<HTMLButtonElement>('.tx-image-uploader__remove')!.click()
    })
    expect(onImgRemove).toHaveBeenCalledWith({ id: 'img-1', value: [] })

    const gallery = mount(
      <TxImageGallery
        items={[
          { id: '1', url: 'https://example.com/1.png', name: 'First' },
          { id: '2', url: 'https://example.com/2.png', name: 'Second' },
        ]}
      />,
    )
    act(() => {
      gallery.container.querySelectorAll<HTMLButtonElement>('.tx-image-gallery__thumb')[0]!.click()
    })
    const previewDialog = document.body.querySelector<HTMLElement>('.tx-image-preview')!
    expect(previewDialog).toBeTruthy()
    expect(previewDialog.textContent).toContain('1 / 2')
    act(() => {
      previewDialog.querySelector<HTMLButtonElement>('.tx-image-preview__nav--next')!.click()
    })
    expect(previewDialog.textContent).toContain('2 / 2')
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('.tx-image-preview')).toBeNull()

    const onIcon = vi.fn()
    const picker = mount(<TxIconPicker onChange={onIcon} />)
    act(() => {
      picker.container.querySelector<HTMLButtonElement>('.tx-icon-picker__trigger')!.click()
    })
    act(() => {
      document.body.querySelectorAll<HTMLButtonElement>('.tx-icon-picker-panel__cell')[0]!.click()
    })
    expect(onIcon).toHaveBeenCalledWith('emoji:🚀')
  })
})

describe('pack B SSR renderToString smoke across ALL 33 modules', () => {
  it('renders every Pack B component cleanly via react-dom/server without throwing', () => {
    const cases: Array<[string, ReturnType<typeof renderToString>]> = [
      ['number-input', renderToString(<TxNumberInput defaultValue={10} />)],
      ['search-input', renderToString(<TxSearchInput placeholder="Find" />)],
      ['sensitive-input', renderToString(<TxSensitiveInput label="Key" defaultValue="secret" />)],
      ['tag-input', renderToString(<TxTagInput defaultValue={['alpha']} />)],
      ['scrub-field', renderToString(<TxScrubField label="X" defaultValue={12} min={0} max={100} />)],
      ['segmented-slider', renderToString(<TxSegmentedSlider segments={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />)],
      ['rating', renderToString(<TxRating defaultValue={3.5} precision={0.5} showText />)],
      ['filter-chips', renderToString(<TxFilterChips items={[{ value: 'all', label: 'All' }]} />)],
      ['flat-radio', renderToString(<TxFlatRadio defaultValue="a"><TxFlatRadioItem value="a">A</TxFlatRadioItem></TxFlatRadio>)],
      ['flat-select', renderToString(<TxFlatSelect defaultValue="a"><TxFlatSelectItem value="a" label="A" /></TxFlatSelect>)],
      ['search-select', renderToString(<TxSearchSelect options={[{ value: 'a', label: 'A' }]} />)],
      ['cascader', renderToString(<TxCascader options={[{ value: 'a', label: 'A' }]} />)],
      ['tree', renderToString(<TxTree nodes={[{ key: 'a', label: 'A' }]} />)],
      ['tree-select', renderToString(<TxTreeSelect nodes={[{ key: 'a', label: 'A' }]} />)],
      ['date-picker', renderToString(<TxDatePicker defaultValue="2026-11-27" />)],
      ['picker', renderToString(<TxPicker columns={[{ options: [{ value: 'a', label: 'A' }] }]} />)],
      ['form', renderToString(
        <TxForm>
          <TxFormErrorSummary />
          <TxFormRow>
            <TxFormItem label="Name" prop="name">
              <TxInput />
            </TxFormItem>
          </TxFormRow>
        </TxForm>,
      )],
      ['modal-form', renderToString(<TxModalForm open={false} title="Modal Form"><div /></TxModalForm>)],
      ['drawer-form', renderToString(<TxDrawerForm open={false} title="Drawer Form"><div /></TxDrawerForm>)],
      ['steps-form', renderToString(<TxStepsForm steps={[{ title: 'One', content: <div>1</div> }]} />)],
      ['context-menu', renderToString(<TxContextMenu menu={<TxContextMenuItem>Copy</TxContextMenuItem>}><span>Area</span></TxContextMenu>)],
      ['dropdown-menu', renderToString(<TxDropdownMenu label="Menu"><TxDropdownItem>Action</TxDropdownItem></TxDropdownMenu>)],
      ['flat-dropdown', renderToString(<TxFlatDropdown content={<div>Body</div>}><TxButton>Open</TxButton></TxFlatDropdown>)],
      ['selection-actions', renderToString(<TxSelectionActions inline selection={{ text: 'Hi', rects: [] }} />)],
      ['data-table', renderToString(<TxDataTable columns={[{ key: 'name', title: 'Name' }]} data={[{ id: 1, name: 'Ada' }]} />)],
      ['descriptions', renderToString(<TxDescriptions><TxDescriptionsItem label="Env">Prod</TxDescriptionsItem></TxDescriptions>)],
      ['sortable-list', renderToString(<TxSortableList defaultValue={[{ id: '1', label: 'One' }]} />)],
      ['transfer', renderToString(<TxTransfer data={[{ key: '1', label: 'One' }]} />)],
      ['file-uploader', renderToString(<TxFileUploader />)],
      ['image-uploader', renderToString(<TxImageUploader />)],
      ['image-gallery', renderToString(<TxImageGallery items={[{ id: '1', url: 'https://example.com/1.png' }]} />)],
      ['image-preview', renderToString(<TxImagePreview open={false} images={['https://example.com/1.png']} />)],
      ['icon-picker', renderToString(<TxIconPicker defaultValue="emoji:🚀" />)],
    ]

    expect(cases).toHaveLength(33)
    for (const [id, html] of cases) {
      expect(typeof html, `SSR failed for ${id}`).toBe('string')
      if (id !== 'modal-form' && id !== 'drawer-form' && id !== 'image-preview')
        expect(html.length, `SSR empty for ${id}`).toBeGreaterThan(0)
    }
  })
})
