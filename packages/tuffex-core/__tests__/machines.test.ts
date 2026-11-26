import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCheckboxMachine } from '../src/machines/checkbox'
import { createCollapseMachine } from '../src/machines/collapse'
import { createDialogMachine } from '../src/machines/dialog'
import { createSelectMachine } from '../src/machines/select'
import { createSliderMachine } from '../src/machines/slider'
import { createSwitchMachine } from '../src/machines/switch'
import { createTabsMachine } from '../src/machines/tabs'
import { createZIndexAllocator } from '../src/utils/z-index-manager'

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  delete document.body.dataset.txFlipOverlayLockCount
  delete document.body.dataset.txFlipOverlayLockOverflow
  delete document.body.dataset.txFlipOverlayLockPaddingRight
})

describe('headless state machines', () => {
  it('createTabsMachine navigates tabs skipping disabled items and looping', () => {
    const onChange = vi.fn()
    const tabs = createTabsMachine({
      defaultValue: 'a',
      tabs: () => [
        { value: 'a' },
        { value: 'b', disabled: true },
        { value: 'c' },
      ],
      onChange,
    })

    expect(tabs.activeValue.value).toBe('a')
    expect(tabs.select('b')).toBe(false)

    const preventDefault = vi.fn()
    expect(tabs.handleKeydown({ key: 'ArrowRight', preventDefault })).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    expect(tabs.activeValue.value).toBe('c')
    expect(onChange).toHaveBeenCalledWith('c')

    tabs.selectNext()
    expect(tabs.activeValue.value).toBe('a')
    expect(tabs.getTabProps('a')['aria-selected']).toBe(true)
  })

  it('createCollapseMachine handles multi-open and accordion modes', () => {
    const multi = createCollapseMachine({ defaultValue: ['one'] })
    expect(multi.isOpen('one')).toBe(true)
    multi.toggle('two')
    expect(multi.expandedKeys.value).toEqual(['one', 'two'])
    multi.close('one')
    expect(multi.expandedKeys.value).toEqual(['two'])

    const accordion = createCollapseMachine({ accordion: true, defaultValue: 'first' })
    accordion.open('second')
    expect(accordion.expandedKeys.value).toEqual(['second'])
    accordion.toggle('second')
    expect(accordion.expandedKeys.value).toEqual([])
  })

  it('createDialogMachine manages z-index, body scroll lock, Escape, and backdrop dismissal', () => {
    const allocator = createZIndexAllocator()
    const onOpenChange = vi.fn()
    const dialog = createDialogMachine({
      zIndexAllocator: allocator,
      onOpenChange,
    })

    expect(dialog.isOpen.value).toBe(false)
    dialog.open()
    expect(dialog.isOpen.value).toBe(true)
    expect(dialog.zIndex.value).toBeGreaterThan(2000)
    expect(document.body.style.overflow).toBe('hidden')

    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    expect(dialog.handleKeydown(esc)).toBe(true)
    expect(dialog.isOpen.value).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    dialog.open()
    expect(dialog.handleBackdropClick()).toBe(true)
    expect(dialog.isOpen.value).toBe(false)
    dialog.destroy()
  })

  it('createSelectMachine supports single/multiple selection, filtering, and keyboard navigation', () => {
    const items = [
      { value: 'vue', label: 'Vue 3' },
      { value: 'react', label: 'React 19' },
      { value: 'wc', label: 'Web Components', disabled: true },
    ]
    const select = createSelectMachine({
      options: () => items,
      filterable: true,
    })

    select.openMenu()
    expect(select.isOpen.value).toBe(true)
    expect(select.highlightedIndex.value).toBe(0)

    select.highlightNext()
    expect(select.highlightedIndex.value).toBe(1)

    const preventDefault = vi.fn()
    select.handleKeydown({ key: 'Enter', preventDefault })
    expect(select.selectedValue.value).toBe('react')
    expect(select.isOpen.value).toBe(false)

    select.setSearchQuery('vue')
    expect(select.filteredOptions.value).toHaveLength(1)

    const multi = createSelectMachine({ options: () => items, multiple: true })
    multi.select('vue')
    multi.select('react')
    expect(multi.selectedValues.value).toEqual(['vue', 'react'])
    multi.select('vue')
    expect(multi.selectedValues.value).toEqual(['react'])
  })

  it('createSliderMachine clamps, snaps to step, computes percentage, and handles keyboard', () => {
    const slider = createSliderMachine({ min: 0, max: 10, step: 0.5, defaultValue: 2.3 })
    expect(slider.value.value).toBe(2.5)
    expect(slider.percentage.value).toBe(25)

    slider.setFromRatio(0.75)
    expect(slider.value.value).toBe(7.5)

    const preventDefault = vi.fn()
    slider.handleKeydown({ key: 'ArrowRight', preventDefault })
    expect(slider.value.value).toBe(8)
    slider.handleKeydown({ key: 'End', preventDefault })
    expect(slider.value.value).toBe(10)
    slider.handleKeydown({ key: 'Home', preventDefault })
    expect(slider.value.value).toBe(0)
  })

  it('createSwitchMachine and createCheckboxMachine handle toggle, disabled, and indeterminate states', () => {
    let isDisabled = false
    const sw = createSwitchMachine({ defaultChecked: false, disabled: () => isDisabled })
    expect(sw.toggle()).toBe(true)
    expect(sw.checked.value).toBe(true)
    expect(sw.getAriaProps()['aria-checked']).toBe(true)

    isDisabled = true
    expect(sw.toggle()).toBe(false)
    expect(sw.checked.value).toBe(true)

    const cb = createCheckboxMachine({ defaultIndeterminate: true })
    expect(cb.ariaChecked.value).toBe('mixed')
    cb.toggle()
    expect(cb.indeterminate.value).toBe(false)
    expect(cb.checked.value).toBe(true)
    expect(cb.ariaChecked.value).toBe('true')
    cb.toggle()
    expect(cb.checked.value).toBe(false)
    expect(cb.ariaChecked.value).toBe('false')
  })
})
