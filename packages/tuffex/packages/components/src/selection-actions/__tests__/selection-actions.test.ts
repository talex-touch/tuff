import type { SelectionPayload } from '../src/types'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import TxSelectionActions from '../src/TxSelectionActions.vue'

function rect(top: number, bottom: number, left: number, right: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect
}

function selection(overrides: Partial<SelectionPayload> = {}): SelectionPayload {
  return {
    text: 'Churn it first thing Saturday.',
    rects: [rect(100, 118, 40, 300), rect(120, 138, 40, 210)],
    ...overrides,
  }
}

const mounted: Array<{ unmount: () => void }> = []

function mountBar(props: Record<string, unknown> = {}) {
  const wrapper = mount(TxSelectionActions, {
    attachTo: document.body,
    props: { selection: selection(), ...props },
  })
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  // Panels are teleported to body, so a stale instance would shadow the next test.
  while (mounted.length) mounted.pop()?.unmount()
  document.body.innerHTML = ''
})

describe('txSelectionActions', () => {
  it('stays hidden until there is a selection', async () => {
    const wrapper = mountBar({ selection: null })
    expect(document.querySelector('.tx-bui-selection-actions')).toBeNull()

    await wrapper.setProps({ selection: selection() })
    expect(document.querySelector('.tx-bui-selection-actions')).not.toBeNull()
  })

  it('names itself as a group rather than a toolbar, since it holds a text field', () => {
    mountBar()

    const bar = document.querySelector('.tx-bui-selection-actions')!
    expect(bar.getAttribute('role')).toBe('group')
    expect(bar.getAttribute('aria-label')).toBe('Selection actions')
  })

  it('anchors under the last selected line, centred on the whole selection', () => {
    const wrapper = mountBar()
    const reference = (wrapper.vm.$.subTree as never as { props: Record<string, any> })

    // Read the virtual reference the component handed to the anchor.
    const anchor = wrapper.findComponent({ name: 'TxBaseAnchor' })
    const virtual = anchor.props('virtualReference') as { getBoundingClientRect: () => DOMRect }
    const box = virtual.getBoundingClientRect()

    expect(reference).toBeTruthy()
    // Bottom of the *last* rect, not of the union.
    expect(box.top).toBe(138)
    expect(box.bottom).toBe(138)
    expect(box.height).toBe(0)
    // Horizontally spans the whole selection.
    expect(box.left).toBe(40)
    expect(box.right).toBe(300)
    expect(box.width).toBe(260)
  })

  it('survives a selection with no rects', () => {
    const wrapper = mountBar({ selection: selection({ rects: [] }) })

    const virtual = wrapper.findComponent({ name: 'TxBaseAnchor' })
      .props('virtualReference') as { getBoundingClientRect: () => DOMRect }
    expect(virtual.getBoundingClientRect().width).toBe(0)
  })

  it('opts out of flip so the bar keeps its side while text reflows', () => {
    const wrapper = mountBar()
    const anchor = wrapper.findComponent({ name: 'TxBaseAnchor' })

    expect(anchor.props('disableFlip')).toBe(true)
    expect(anchor.props('placement')).toBe('bottom')
  })

  it('shows the inline actions and folds the rest away', () => {
    mountBar()

    const labels = Array.from(document.querySelectorAll('.tx-bui-selection-actions__control'))
      .map(node => node.textContent?.trim())
    expect(labels).toEqual(['Explain', 'Improve', 'Shorten', 'Tone', 'Grammar'])

    const folded = document.querySelector('.tx-bui-selection-actions__group.is-folded')!
    expect(folded.classList.contains('is-shown')).toBe(false)
  })

  it('keeps folded actions out of the tab order until they are revealed', async () => {
    const wrapper = mountBar()
    const foldedButtons = () => Array.from(
      document.querySelectorAll('.tx-bui-selection-actions__group.is-folded .tx-bui-selection-actions__control'),
    )

    expect(foldedButtons().every(node => node.getAttribute('tabindex') === '-1')).toBe(true)

    await wrapper.setProps({ expanded: true })
    expect(foldedButtons().every(node => node.getAttribute('tabindex') === null)).toBe(true)
  })

  it('toggles the folded group through an accessible control', async () => {
    const wrapper = mountBar()
    const toggle = document.querySelector('.tx-bui-selection-actions__icon-button')! as HTMLElement

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    toggle.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:expanded')?.at(-1)).toEqual([true])
    expect(document.querySelector('.tx-bui-selection-actions__group.is-folded')!.classList).toContain('is-shown')
  })

  it('emits every action with the selected text, Explain included', async () => {
    const wrapper = mountBar()
    const controls = Array.from(document.querySelectorAll('.tx-bui-selection-actions__control')) as HTMLElement[]

    controls[0]!.click()
    await wrapper.vm.$nextTick()

    const payload = wrapper.emitted('action')?.[0]?.[0] as { id: string, selection: SelectionPayload }
    expect(payload.id).toBe('explain')
    expect(payload.selection.text).toBe('Churn it first thing Saturday.')

    controls[2]!.click()
    await wrapper.vm.$nextTick()
    expect((wrapper.emitted('action')?.[1]?.[0] as { id: string }).id).toBe('shorten')
  })

  it('collapses the folded group once an action runs', async () => {
    const wrapper = mountBar({ expanded: undefined })
    const toggle = document.querySelector('.tx-bui-selection-actions__icon-button')! as HTMLElement

    toggle.click()
    await wrapper.vm.$nextTick()

    const controls = Array.from(document.querySelectorAll('.tx-bui-selection-actions__control')) as HTMLElement[]
    controls[0]!.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:expanded')?.at(-1)).toEqual([false])
  })

  it('reveals the send control only once the prompt has content', async () => {
    const wrapper = mountBar()
    const sendGroup = () => document.querySelector('.tx-bui-selection-actions__group.is-send')!

    expect(sendGroup().classList.contains('is-shown')).toBe(false)

    await wrapper.setProps({ prompt: 'make it warmer' })
    expect(sendGroup().classList.contains('is-shown')).toBe(true)
  })

  it('submits the trimmed prompt with the selection', async () => {
    const wrapper = mountBar({ prompt: '  make it warmer  ' })

    const send = document.querySelector('.tx-bui-selection-actions__send')! as HTMLElement
    send.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      prompt: 'make it warmer',
      selection: expect.objectContaining({ text: 'Churn it first thing Saturday.' }),
    })
  })

  it('refuses to submit an empty prompt', async () => {
    const wrapper = mountBar({ prompt: '   ' })

    const send = document.querySelector('.tx-bui-selection-actions__send')! as HTMLElement
    send.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('reports typing through v-model', async () => {
    const wrapper = mountBar()
    const input = document.querySelector('.tx-bui-selection-actions__input')! as HTMLInputElement

    input.value = 'shorter please'
    input.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:prompt')?.at(-1)).toEqual(['shorter please'])
  })

  it('shows a shimmering label while thinking and a plain one while streaming', async () => {
    const wrapper = mountBar({ state: 'thinking', activeActionId: 'improve' })

    const label = () => document.querySelector('.tx-bui-selection-actions__busy-label')!
    expect(label().textContent).toBe('Improving…')
    expect(label().classList.contains('is-shimmering')).toBe(true)

    await wrapper.setProps({ state: 'streaming' })
    expect(label().classList.contains('is-shimmering')).toBe(false)
  })

  it('falls back to generic busy wording for an action without its own', () => {
    mountBar({
      state: 'thinking',
      activeActionId: 'custom',
      actions: [{ id: 'custom', label: 'Custom' }],
    })

    expect(document.querySelector('.tx-bui-selection-actions__busy-label')!.textContent).toBe('Editing…')
  })

  it('offers keep, discard and retry once a result is in', async () => {
    const wrapper = mountBar({ state: 'result' })

    ;(document.querySelector('.tx-bui-selection-actions__primary')! as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('keep')).toHaveLength(1)

    ;(document.querySelector('.tx-bui-selection-actions__control')! as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('discard')).toHaveLength(1)

    ;(document.querySelector('.tx-bui-selection-actions__icon-button')! as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('swallows pointerdown on the bar so the selection is not destroyed', () => {
    mountBar()

    const bar = document.querySelector('.tx-bui-selection-actions')!
    const event = new Event('pointerdown', { bubbles: true, cancelable: true })
    bar.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('lets pointerdown reach the text field so it can take focus', () => {
    mountBar()

    const input = document.querySelector('.tx-bui-selection-actions__input')!
    const event = new Event('pointerdown', { bubbles: true, cancelable: true })
    input.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('exposes updatePosition and focusInput', () => {
    const wrapper = mountBar()
    const vm = wrapper.vm as unknown as Record<string, unknown>

    // The forwarding itself is proven end to end in selection-actions-position.test.ts.
    expect(typeof vm.updatePosition).toBe('function')
    expect(typeof vm.focusInput).toBe('function')
  })

  it('can hide the prompt affordance entirely', () => {
    mountBar({ hidePrompt: true })

    expect(document.querySelector('.tx-bui-selection-actions__input')).toBeNull()
    expect(document.querySelector('.tx-bui-selection-actions__send')).toBeNull()
    expect(document.querySelectorAll('.tx-bui-selection-actions__control').length).toBeGreaterThan(0)
  })
})
