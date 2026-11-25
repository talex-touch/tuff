import { act, createRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReactiveStreamPacer,
  TxButton,
  TxDialog,
  TxDrawer,
  TxMarkdownView,
  TxPopover,
  TxSelect,
  TxSelectItem,
  TxStreamText,
  TxTooltip,
} from '../index'
import type { TxStreamTextHandle } from '../index'
import { cleanupAll, mount } from './render-helper'

afterEach(() => {
  cleanupAll()
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-theme')
})

describe('Tier B portal overlays (TxTooltip, TxPopover, TxDialog, TxDrawer, TxSelect)', () => {
  it('TxTooltip portals content, sets aria-describedby, and closes on Escape', () => {
    const { container } = mount(
      <TxTooltip content="Shortcut ⌘K" trigger="click">
        <TxButton>Trigger</TxButton>
      </TxTooltip>,
    )
    const refEl = container.querySelector<HTMLElement>('.tx-tooltip__reference')!
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()

    act(() => {
      refEl.click()
    })
    const tip = document.body.querySelector('[role="tooltip"]')!
    expect(tip).toBeTruthy()
    expect(tip.textContent).toBe('Shortcut ⌘K')
    expect(refEl.getAttribute('aria-describedby')).toBe(tip.id)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })

  it('TxPopover opens in portal and dismisses on outside click and Escape', () => {
    const onOpenChange = vi.fn()
    const { container } = mount(
      <TxPopover content={<div>Popover Body</div>} onOpenChange={onOpenChange}>
        <button type="button">Open</button>
      </TxPopover>,
    )
    const trigger = container.querySelector<HTMLElement>('.tx-popover__reference')!
    act(() => {
      trigger.click()
    })
    expect(document.body.querySelector('.tx-popover__panel')?.textContent).toBe('Popover Body')
    expect(onOpenChange).toHaveBeenCalledWith(true)

    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(document.body.querySelector('.tx-popover__panel')).toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('TxDialog portals modal dialog with ARIA roles and closes via Escape and close button', () => {
    const onClose = vi.fn()
    mount(
      <TxDialog defaultOpen title="Delete item" description="This cannot be undone." onClose={onClose}>
        <span>Details</span>
      </TxDialog>,
    )

    const dialog = document.body.querySelector<HTMLDivElement>('[role="dialog"]')!
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(dialog.textContent).toContain('Delete item')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('TxDrawer portals directional drawer and closes on mask click and Escape', () => {
    const onClose = vi.fn()
    mount(
      <TxDrawer defaultOpen title="Settings" direction="left" size={320} onClose={onClose}>
        <p>Drawer content</p>
      </TxDrawer>,
    )
    const drawer = document.body.querySelector<HTMLDivElement>('.tx-drawer')!
    expect(drawer.className).toContain('tx-drawer--left')
    expect(drawer.className).toContain('tx-drawer--visible')
    expect(drawer.textContent).toContain('Drawer content')

    act(() => {
      drawer.querySelector<HTMLDivElement>('.tx-drawer__mask')!.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(drawer.className).not.toContain('tx-drawer--visible')
  })

  it('TxSelect + TxSelectItem support single, multiple, and options-driven selection in portal', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxSelect defaultValue="vue" onChange={onChange}>
        <TxSelectItem value="vue" label="Vue 3" />
        <TxSelectItem value="react" label="React 19" />
        <TxSelectItem value="wc" label="Web Components" />
      </TxSelect>,
    )

    const trigger = container.querySelector<HTMLElement>('.tuff-select__trigger')!
    expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('Vue 3')

    act(() => {
      trigger.click()
    })
    const options = document.body.querySelectorAll<HTMLElement>('[role="option"]')
    expect(options).toHaveLength(3)

    act(() => {
      options[1]!.click()
    })
    expect(onChange).toHaveBeenCalledWith('react')
    expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('React 19')
    expect(document.body.querySelector('[role="listbox"]')).toBeNull()

    // Multiple mode with options prop
    const multiChange = vi.fn()
    const multi = mount(
      <TxSelect
        multiple
        defaultValue={['a']}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        onChange={multiChange}
      />,
    )
    act(() => {
      multi.container.querySelector<HTMLElement>('.tuff-select__trigger')!.click()
    })
    act(() => {
      document.body.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click()
    })
    expect(multiChange).toHaveBeenCalledWith(['a', 'b'])
    expect(multi.container.querySelectorAll('.tuff-select__tag')).toHaveLength(2)
  })
})

describe('Tier C components (TxStreamText & TxMarkdownView)', () => {
  it('TxStreamText renders text, inline marks, safe links, caret while streaming, and imperative skip/replay', () => {
    const ref = createRef<TxStreamTextHandle>()
    const onCite = vi.fn()
    const tree = mount(
      <TxStreamText
        ref={ref}
        content={[
          { type: 'text', text: 'Hello ', marks: ['strong'] },
          { type: 'text', text: 'docs', href: 'https://tuff.tagzxia.com' },
          { type: 'text', text: ' bad', href: 'javascript:alert(1)' },
          { type: 'citation', source: { id: 's1', title: 'Spec' }, index: 1 },
        ]}
        streaming
        paced={false}
        reveal="aurora"
        onCite={onCite}
      />,
    )

    expect(tree.container.querySelector('.tx-stream-text')?.className).toContain('is-reveal-aurora')
    expect(tree.container.querySelector('strong')?.textContent).toBe('Hello')
    expect(tree.container.querySelector('a.tx-stream-text__link')?.getAttribute('href')).toBe('https://tuff.tagzxia.com')
    // javascript: link must NOT render an anchor
    expect(tree.container.querySelectorAll('a')).toHaveLength(1)
    expect(tree.container.querySelector('.tx-stream-caret')).toBeTruthy()

    act(() => {
      tree.container.querySelector<HTMLButtonElement>('.tx-stream-text__citation')!.click()
    })
    expect(onCite).toHaveBeenCalledWith({ id: 's1', title: 'Spec' })

    // Transition to finished & skip
    tree.rerender(
      <TxStreamText
        ref={ref}
        content="Complete answer."
        streaming={false}
        paced={false}
      />,
    )
    act(() => {
      ref.current?.skip()
    })
    expect(ref.current?.state).toBe('done')
    expect(tree.container.textContent).toContain('Complete answer.')
  })

  it('TxMarkdownView renders GFM markdown, sanitizes XSS with dompurify, and tracks auto theme', () => {
    document.documentElement.classList.add('dark')
    const { container } = mount(
      <TxMarkdownView
        content={'# Title\n\n**Bold** and `code`\n\n<script>window.__xss = 1</script><img src="x" onerror="alert(1)">'}
      />,
    )

    const root = container.querySelector('.tx-markdown-view')!
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(container.querySelector('h1')?.textContent).toBe('Title')
    expect(container.querySelector('strong')?.textContent).toBe('Bold')
    expect(container.querySelector('code')?.textContent).toBe('code')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull()
  })

  it('createReactiveStreamPacer paces units frame-by-frame and transitions streaming -> draining -> done', () => {
    let clock = 0
    let pendingFrame: ((time: number) => void) | null = null
    let totalUnits = 4
    let isStreaming = true
    const states: string[] = []

    const pacer = createReactiveStreamPacer({
      total: () => totalUnits,
      streaming: () => isStreaming,
      wordMs: () => 20,
      drainMs: () => 40,
      settleMs: () => 0,
      appear: true,
      now: () => clock,
      requestFrame: (cb) => {
        pendingFrame = cb
        return 1
      },
      cancelFrame: () => {
        pendingFrame = null
      },
      onState: next => states.push(next),
    })

    expect(pacer.revealed.value).toBe(0)
    expect(pacer.state.value).toBe('streaming')

    // First frame releases 1 word
    clock = 20
    pendingFrame?.(clock)
    expect(pacer.revealed.value).toBeGreaterThanOrEqual(1)

    // Source ends while backlog remains -> draining -> done
    isStreaming = false
    pacer.sync()
    expect(pacer.state.value).toBe('draining')

    clock = 100
    pendingFrame?.(clock)
    expect(pacer.revealed.value).toBe(4)
    expect(pacer.state.value).toBe('done')
    expect(states).toContain('draining')
    expect(states).toContain('done')
    pacer.stop()
  })

  it('TxSelect supports searchable filtering and allowCreate in children mode, and TxDialog supports controlled open', () => {
    const onCreate = vi.fn()
    const { container } = mount(
      <TxSelect searchable allowCreate createText="Create item" onCreate={onCreate}>
        <TxSelectItem value="vue" label="Vue" />
        <TxSelectItem value="react" label="React" />
      </TxSelect>,
    )

    act(() => {
      container.querySelector<HTMLElement>('.tuff-select__trigger')!.click()
    })
    const searchInput = document.body.querySelector<HTMLInputElement>('.tuff-select__search input')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(searchInput, 'Solid')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(0)

    const createBtn = document.body.querySelector<HTMLButtonElement>('.tuff-select__create')!
    expect(createBtn).toBeTruthy()
    act(() => {
      createBtn.click()
    })
    expect(onCreate).toHaveBeenCalledWith({ value: 'Solid', label: 'Solid' })
    expect(container.querySelector<HTMLInputElement>('input')!.value).toBe('Solid')

    // Controlled TxDialog
    function ControlledDialog() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" data-testid="open-dialog" onClick={() => setOpen(true)}>Open</button>
          <TxDialog open={open} onOpenChange={setOpen} title="Controlled">Body</TxDialog>
        </>
      )
    }
    const dlgTree = mount(<ControlledDialog />)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    act(() => {
      dlgTree.container.querySelector<HTMLButtonElement>('[data-testid="open-dialog"]')!.click()
    })
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Controlled')
    act(() => {
      document.body.querySelector<HTMLButtonElement>('.tx-modal__close')!.click()
    })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})
