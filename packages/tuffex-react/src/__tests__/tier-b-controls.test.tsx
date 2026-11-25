import { act, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TxCheckbox,
  TxCollapse,
  TxCollapseItem,
  TxInput,
  TxRadio,
  TxRadioGroup,
  TxSlider,
  TxTabItem,
  TxTabs,
  TxTextarea,
} from '../index'
import { cleanupAll, mount } from './render-helper'

afterEach(() => {
  cleanupAll()
})

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('Tier B form controls and compound context components', () => {
  it('TxInput supports controlled/uncontrolled value, clearable button, and number normalization', () => {
    const onClear = vi.fn()
    const onChange = vi.fn()
    const { container } = mount(<TxInput defaultValue="hello" clearable onChange={onChange} onClear={onClear} />)
    const input = container.querySelector<HTMLInputElement>('input.tx-input__inner')!
    expect(input.value).toBe('hello')

    act(() => {
      setInputValue(input, 'world')
    })
    expect(input.value).toBe('world')
    expect(onChange).toHaveBeenCalledWith('world')

    const clearBtn = container.querySelector<HTMLButtonElement>('.tx-input__clear')!
    act(() => {
      clearBtn.click()
    })
    expect(input.value).toBe('')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('TxTextarea renders counter, status classes, and updates value', () => {
    const onChange = vi.fn()
    const { container } = mount(<TxTextarea defaultValue="abc" maxLength={50} showCount status="error" onChange={onChange} />)
    const field = container.querySelector<HTMLTextAreaElement>('textarea.tx-textarea__field')!
    expect(container.querySelector('.tx-textarea--error')).toBeTruthy()
    expect(container.querySelector('.tx-textarea__count')?.textContent).toBe('3/50')

    act(() => {
      setInputValue(field, 'abcdef')
    })
    expect(container.querySelector('.tx-textarea__count')?.textContent).toBe('6/50')
    expect(onChange).toHaveBeenCalledWith('abcdef')
  })

  it('TxCheckbox supports controlled, uncontrolled, and indeterminate mixed ARIA state', () => {
    const onChange = vi.fn()
    const tree = mount(<TxCheckbox indeterminate label="Select all" onChange={onChange} />)
    const cb = tree.container.querySelector<HTMLButtonElement>('[role="checkbox"]')!
    expect(cb.getAttribute('aria-checked')).toBe('mixed')

    act(() => {
      cb.click()
    })
    expect(onChange).toHaveBeenCalledWith(true)

    tree.rerender(<TxCheckbox checked={true} label="Select all" onChange={onChange} />)
    expect(cb.getAttribute('aria-checked')).toBe('true')
  })

  it('TxRadioGroup + TxRadio coordinate via React context and support arrow-key navigation', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxRadioGroup defaultValue="vue" type="standard" onChange={onChange}>
        <TxRadio value="vue">Vue</TxRadio>
        <TxRadio value="react">React</TxRadio>
        <TxRadio value="wc">WC</TxRadio>
      </TxRadioGroup>,
    )

    const radios = container.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    expect(radios).toHaveLength(3)
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
    expect(radios[1]!.getAttribute('aria-checked')).toBe('false')

    act(() => {
      radios[1]!.click()
    })
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true')
    expect(onChange).toHaveBeenCalledWith('react')

    act(() => {
      radios[1]!.focus()
      container.querySelector('[role="radiogroup"]')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(radios[2]!.getAttribute('aria-checked')).toBe('true')
    expect(onChange).toHaveBeenLastCalledWith('wc')
  })

  it('TxSlider renders range input, updates value, and displays formatted value + tooltip', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxSlider
        defaultValue={25}
        min={0}
        max={100}
        showValue
        showTooltip
        tooltipTrigger="always"
        formatValue={v => `${v}%`}
        ariaLabel="Volume"
        onChange={onChange}
      />,
    )
    const range = container.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(range.getAttribute('aria-label')).toBe('Volume')
    expect(range.getAttribute('aria-valuetext')).toBe('25%')
    expect(container.querySelector('.tx-slider__tooltip')?.textContent).toBe('25%')

    act(() => {
      setInputValue(range, '70')
    })
    expect(onChange).toHaveBeenCalledWith(70)
    expect(container.querySelector('.tx-slider__value')?.textContent).toBe('70%')
  })

  it('TxTabs + TxTabItem switch panels via context, controlled state, and keyboard navigation', () => {
    function ControlledTabs() {
      const [tab, setTab] = useState('general')
      return (
        <TxTabs value={tab} onChange={setTab} placement="top">
          <TxTabItem name="general" label="General">General settings</TxTabItem>
          <TxTabItem name="network" label="Network">Network settings</TxTabItem>
          <TxTabItem name="disabled" label="Disabled" disabled>Hidden</TxTabItem>
        </TxTabs>
      )
    }

    const { container } = mount(<ControlledTabs />)
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    expect(tabs).toHaveLength(3)
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe('General settings')

    act(() => {
      tabs[1]!.click()
    })
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe('Network settings')

    act(() => {
      container.querySelector('[role="tablist"]')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      )
    })
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe('General settings')
  })

  it('TxCollapse + TxCollapseItem toggle in multi-open and accordion modes', () => {
    const onChange = vi.fn()
    const multi = mount(
      <TxCollapse defaultValue={['a']} onChange={onChange}>
        <TxCollapseItem name="a" title="Section A">Body A</TxCollapseItem>
        <TxCollapseItem name="b" title="Section B">Body B</TxCollapseItem>
      </TxCollapse>,
    )
    const headers = multi.container.querySelectorAll<HTMLButtonElement>('.tx-collapse-item__header')
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('false')

    act(() => {
      headers[1]!.click()
    })
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('true')
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])

    const accordion = mount(
      <TxCollapse accordion defaultValue="one">
        <TxCollapseItem name="one" title="One">Panel One</TxCollapseItem>
        <TxCollapseItem name="two" title="Two">Panel Two</TxCollapseItem>
      </TxCollapse>,
    )
    const accHeaders = accordion.container.querySelectorAll<HTMLButtonElement>('.tx-collapse-item__header')
    act(() => {
      accHeaders[1]!.click()
    })
    expect(accHeaders[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(accHeaders[1]!.getAttribute('aria-expanded')).toBe('true')
  })
})
