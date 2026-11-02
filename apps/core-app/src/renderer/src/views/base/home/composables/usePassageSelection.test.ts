// @vitest-environment jsdom
import type { SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'
import { usePassageSelection } from './usePassageSelection'

const passageText = 'A passage worth quoting.'
let wrapper: VueWrapper | undefined
let fixture: HTMLElement | undefined

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  window.getSelection()?.removeAllRanges()
  fixture?.remove()
  fixture = undefined
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function selectPassage(barKind: 'element' | 'component' | 'unresolved' = 'element') {
  fixture = document.createElement('section')
  const body = document.createElement('article')
  body.textContent = passageText
  const bar = document.createElement('div')
  const action = document.createElement('button')
  action.textContent = 'Quote'
  bar.append(action)
  fixture.append(body, bar)
  document.body.append(fixture)

  const barRef = shallowRef<unknown>(
    barKind === 'element' ? bar : { $el: barKind === 'component' ? bar : null }
  )
  let passageSelection = shallowRef<SelectionPayload | null>(null)
  wrapper = mount(
    defineComponent({
      setup() {
        passageSelection = usePassageSelection({
          body: shallowRef(body),
          bar: barRef,
          input: ref(null),
          draft: ref(''),
          conversationId: ref('thread-one'),
          autoGrow: () => {}
        }).passageSelection
        return () => null
      }
    }),
    {
      attachTo: fixture,
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en: {} } })]
      }
    }
  )

  const range = document.createRange()
  range.selectNodeContents(body)
  // jsdom has real Selection/Range semantics, but no layout engine for the anchor geometry.
  Object.defineProperty(range, 'getClientRects', {
    value: () => [new DOMRect(20, 40, 180, 20)]
  })
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
  await nextTick()
  await vi.runAllTimersAsync()

  // Every dismissal test starts with a real tracked highlight, never a hand-seeded snapshot.
  expect(passageSelection.value?.text).toBe(passageText)
  expect(selection.toString()).toBe(passageText)

  return { passageSelection, selection, body, bar, action }
}

function press(target: EventTarget) {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }))
}

describe('usePassageSelection', () => {
  it('retracts the snapshot and removes the live highlight when the window loses focus', async () => {
    const { passageSelection, selection } = await selectPassage()

    window.dispatchEvent(new Event('blur'))

    expect(passageSelection.value).toBeNull()
    expect(selection.rangeCount).toBe(0)
  })

  it('only retracts the snapshot and live highlight for the Escape key', async () => {
    const { passageSelection, selection, body } = await selectPassage()

    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(passageSelection.value?.text).toBe(passageText)
    expect(selection.toString()).toBe(passageText)

    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(passageSelection.value).toBeNull()
    expect(selection.rangeCount).toBe(0)
  })

  it.each(['element', 'component', 'unresolved'] as const)(
    'retracts on a transcript press outside the %s bar',
    async (barKind) => {
      const { passageSelection, selection, body } = await selectPassage(barKind)

      press(body)

      expect(passageSelection.value).toBeNull()
      expect(selection.rangeCount).toBe(0)
    }
  )

  it.each(['element', 'component'] as const)(
    'keeps the passage when pressing the %s bar or its action child',
    async (barKind) => {
      const { passageSelection, selection, bar, action } = await selectPassage(barKind)
      const snapshot = passageSelection.value

      press(bar)
      expect(passageSelection.value).toBe(snapshot)
      expect(selection.toString()).toBe(passageText)

      press(action)
      expect(passageSelection.value).toBe(snapshot)
      expect(selection.toString()).toBe(passageText)
    }
  )

  it('clears a collapsed snapshot immediately even while a bar action holds focus', async () => {
    const { passageSelection, selection, action } = await selectPassage('component')
    action.focus()
    expect(document.activeElement).toBe(action)

    selection.collapseToEnd()
    document.dispatchEvent(new Event('selectionchange'))

    // Do not advance the anchor debounce: the passage handler must clear the snapshot now.
    expect(passageSelection.value).toBeNull()
    expect(selection.isCollapsed).toBe(true)
    expect(selection.rangeCount).toBe(1)
    expect(selection.toString()).toBe('')
  })
})
