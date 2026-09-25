import type { VueWrapper } from '@vue/test-utils'
import type { ChoiceSelectPayload, ChoiceStep } from '../src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TxChoiceCard from '../src/TxChoiceCard.vue'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
})

const start: ChoiceStep = {
  id: 'start',
  title: 'Where do we start?',
  options: [
    { id: 'write', label: 'Write a weekly report', description: 'Sum up what shipped this week', icon: 'i-carbon-edit' },
    { id: 'plan', label: 'Plan tomorrow', description: 'Three priorities, in order', icon: { type: 'emoji', value: '🗓' } },
    { id: 'mail', label: 'Clear the inbox', description: 'Reply, file, archive', disabled: true },
    { id: 'learn', label: 'Learn something' },
  ],
}

const report: ChoiceStep = {
  id: 'report',
  title: 'Which report?',
  options: [
    { id: 'team', label: 'Team update' },
    { id: 'self', label: 'Personal log' },
  ],
}

function gridStep(count: number, disabled: number[] = []): ChoiceStep {
  return {
    id: `grid-${count}`,
    title: 'Pick one',
    options: Array.from({ length: count }, (_, index) => ({
      id: `o${index}`,
      label: `Option ${index}`,
      disabled: disabled.includes(index),
    })),
  }
}

function mountCard(props: Record<string, unknown>): VueWrapper {
  return mount(TxChoiceCard, { props: props as never, attachTo: document.body })
}

function optionButtons(wrapper: VueWrapper): HTMLButtonElement[] {
  return wrapper.findAll<HTMLButtonElement>('button.tx-choice-card__option').map(item => item.element)
}

function focusedIndex(wrapper: VueWrapper): number {
  return optionButtons(wrapper).indexOf(document.activeElement as HTMLButtonElement)
}

async function press(wrapper: VueWrapper, key: string): Promise<KeyboardEvent> {
  const target = document.activeElement as HTMLElement
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  await nextTick()
  return event
}

function navButtons(wrapper: VueWrapper): { prev: HTMLButtonElement, next: HTMLButtonElement } {
  const [prev, next] = wrapper.findAll<HTMLButtonElement>('.tx-choice-card__nav').map(item => item.element)
  return { prev: prev!, next: next! }
}

describe('txChoiceCard', () => {
  it('renders the question and one native button per option', () => {
    const wrapper = mountCard({ steps: [start] })

    expect(wrapper.find('h3.tx-choice-card__title').text()).toBe('Where do we start?')
    const buttons = optionButtons(wrapper)
    expect(buttons).toHaveLength(4)
    expect(buttons.every(button => button.getAttribute('type') === 'button')).toBe(true)
    expect(buttons[0]!.querySelector('.tx-choice-card__label')!.textContent).toBe('Write a weekly report')
    expect(buttons[0]!.querySelector('.tx-choice-card__desc')!.textContent).toBe('Sum up what shipped this week')
    // A real list around the buttons: a `listitem` role on the button itself would strip
    // its button semantics.
    expect(wrapper.find('ul.tx-choice-card__options').attributes('role')).toBe('list')
    expect(wrapper.findAll('li.tx-choice-card__item')).toHaveLength(4)
  })

  it('renders no pager for a single step', () => {
    const wrapper = mountCard({ steps: [start] })
    expect(wrapper.find('.tx-choice-card__pager').exists()).toBe(false)
  })

  it('renders nothing without steps, unless it is loading', async () => {
    const wrapper = mountCard({ steps: [] })
    expect(wrapper.find('.tx-choice-card').exists()).toBe(false)

    await wrapper.setProps({ loading: true })
    expect(wrapper.find('.tx-choice-card').exists()).toBe(true)
    expect(wrapper.find('h3').exists()).toBe(false)
    expect(wrapper.find('.tx-choice-card__title.is-placeholder .tx-skeleton').exists()).toBe(true)
  })

  it('names the card and its list by the question', () => {
    const wrapper = mountCard({ steps: [start] })
    const labelledBy = wrapper.find('section.tx-choice-card').attributes('aria-labelledby')!

    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy)!.textContent!.trim()).toBe('Where do we start?')
    expect(wrapper.find('ul.tx-choice-card__options').attributes('aria-labelledby')).toBe(labelledBy)
    // The id is on a wrapper, never on the heading a docs outline would collect.
    expect(wrapper.find('h3').attributes('id')).toBeUndefined()
  })

  it('names each option by its label and describes it by its description', () => {
    const wrapper = mountCard({ steps: [start] })
    const [write, , , learn] = optionButtons(wrapper)

    expect(document.getElementById(write!.getAttribute('aria-labelledby')!)!.textContent).toBe('Write a weekly report')
    expect(document.getElementById(write!.getAttribute('aria-describedby')!)!.textContent).toBe('Sum up what shipped this week')
    expect(learn!.hasAttribute('aria-describedby')).toBe(false)
  })

  it('reads a string icon as an icon class and passes an icon object through', () => {
    const wrapper = mountCard({ steps: [start] })
    const icons = wrapper.findAll('.tx-choice-card__option .tx-choice-card__icon')

    // Every row keeps the icon column once one row has an icon, so the labels line up.
    expect(icons).toHaveLength(4)
    expect(icons[0]!.find('.tuff-icon').attributes('data-icon-type')).toBe('class')
    expect(icons[0]!.find('.tuff-icon').attributes('data-icon-value')).toBe('i-carbon-edit')
    expect(icons[1]!.find('.tuff-icon').attributes('data-icon-type')).toBe('emoji')
    expect(icons[3]!.find('.tuff-icon').exists()).toBe(false)
    expect(icons.every(icon => icon.attributes('aria-hidden') === 'true')).toBe(true)
  })

  it('draws no icon column for a step without icons', () => {
    const wrapper = mountCard({ steps: [report] })
    expect(wrapper.find('.tx-choice-card__icon').exists()).toBe(false)
  })

  it('renders on the server', async () => {
    // Nexus registers every Tx* export as a Nuxt global, so this renders in SSR.
    const html = await renderToString(h(TxChoiceCard, { steps: [start, report], selected: 'plan' }))

    expect(html).toContain('Where do we start?')
    expect(html).toContain('Write a weekly report')
    expect(html).toContain('1 / 2')
    expect(html).toContain('is-selected')
  })
})

describe('txChoiceCard pager', () => {
  it('enables each arrow only when there is a step on that side', async () => {
    const wrapper = mountCard({ steps: [start, report], step: 0 })
    let { prev, next } = navButtons(wrapper)

    expect(wrapper.find('.tx-choice-card__count').text()).toBe('1 / 2')
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)

    await wrapper.setProps({ step: 1 })
    ;({ prev, next } = navButtons(wrapper))
    expect(wrapper.find('.tx-choice-card__count').text()).toBe('2 / 2')
    expect(prev.disabled).toBe(false)
    expect(next.disabled).toBe(true)
  })

  it('binds v-model:step in both directions', async () => {
    const wrapper = mountCard({
      'steps': [start, report],
      'step': 0,
      'onUpdate:step': (index: number) => wrapper.setProps({ step: index }),
    })

    await wrapper.findAll('.tx-choice-card__nav')[1]!.trigger('click')
    expect(wrapper.emitted('update:step')).toEqual([[1]])
    expect(wrapper.find('h3').text()).toBe('Which report?')

    await wrapper.setProps({ step: 0 })
    expect(wrapper.find('h3').text()).toBe('Where do we start?')

    await wrapper.findAll('.tx-choice-card__nav')[0]!.trigger('click')
    // Already on the first step: the disabled arrow emits nothing more.
    expect(wrapper.emitted('update:step')).toEqual([[1]])
  })

  it('keeps its own page when the host passes no step', async () => {
    const wrapper = mountCard({ steps: [start, report] })

    await wrapper.findAll('.tx-choice-card__nav')[1]!.trigger('click')
    expect(wrapper.emitted('update:step')).toEqual([[1]])
    expect(wrapper.find('h3').text()).toBe('Which report?')
  })

  it('stays on the page a controlled host keeps', async () => {
    const wrapper = mountCard({ steps: [start, report], step: 0 })

    await wrapper.findAll('.tx-choice-card__nav')[1]!.trigger('click')
    expect(wrapper.emitted('update:step')).toEqual([[1]])
    expect(wrapper.find('h3').text()).toBe('Where do we start?')
  })

  it('clamps a step outside the range', async () => {
    const wrapper = mountCard({ steps: [start, report], step: 5 })
    expect(wrapper.find('h3').text()).toBe('Which report?')

    await wrapper.setProps({ step: -3 })
    expect(wrapper.find('h3').text()).toBe('Where do we start?')
  })

  it('takes every visible and spoken string from props', () => {
    const wrapper = mountCard({
      steps: [start, report],
      prevLabel: '上一步',
      nextLabel: '下一步',
      stepLabel: (current: number, total: number) => `第 ${current} 步，共 ${total} 步`,
    })
    const [prev, next] = wrapper.findAll('.tx-choice-card__nav')

    expect(prev!.attributes('aria-label')).toBe('上一步')
    expect(next!.attributes('aria-label')).toBe('下一步')
    expect(wrapper.find('.tx-choice-card__count').text()).toBe('第 1 步，共 2 步')
    // The counter changes when the page does, so it is a polite live region.
    expect(wrapper.find('.tx-choice-card__count').attributes('role')).toBe('status')
  })

  it('defaults its strings to English', () => {
    const wrapper = mountCard({ steps: [start, report] })
    const [prev, next] = wrapper.findAll('.tx-choice-card__nav')

    expect(prev!.attributes('aria-label')).toBe('Previous')
    expect(next!.attributes('aria-label')).toBe('Next')
  })
})

describe('txChoiceCard selection', () => {
  it('emits the step, its index and the option, and does not advance', async () => {
    const wrapper = mountCard({ steps: [start, report] })

    await wrapper.findAll('button.tx-choice-card__option')[1]!.trigger('click')

    const payload: ChoiceSelectPayload = { step: start, stepIndex: 0, option: start.options[1]! }
    expect(wrapper.emitted('select')).toEqual([[payload]])
    expect(wrapper.emitted('update:step')).toBeUndefined()
    expect(wrapper.find('h3').text()).toBe('Where do we start?')
  })

  it('reports the index of the page the option was on', async () => {
    const wrapper = mountCard({ steps: [start, report], step: 1 })

    await wrapper.findAll('button.tx-choice-card__option')[0]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([[{ step: report, stepIndex: 1, option: report.options[0] }]])
  })

  it('emits nothing for a disabled option', async () => {
    const wrapper = mountCard({ steps: [start] })
    const mail = wrapper.findAll('button.tx-choice-card__option')[2]!

    expect(mail.attributes('disabled')).toBeDefined()
    await mail.trigger('click')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('marks the selected option with a tint, a check and aria-current', () => {
    const wrapper = mountCard({ steps: [start], selected: 'plan' })
    const buttons = wrapper.findAll('button.tx-choice-card__option')

    expect(buttons[1]!.classes()).toContain('is-selected')
    expect(buttons[1]!.attributes('aria-current')).toBe('true')
    expect(buttons[1]!.find('.tx-choice-card__check').exists()).toBe(true)
    for (const index of [0, 2, 3]) {
      expect(buttons[index]!.classes()).not.toContain('is-selected')
      expect(buttons[index]!.attributes('aria-current')).toBeUndefined()
      expect(buttons[index]!.find('.tx-choice-card__check').exists()).toBe(false)
    }
  })
})

describe('txChoiceCard keyboard', () => {
  it('puts only one option in the tab order: the selected one, else the first enabled', async () => {
    const wrapper = mountCard({ steps: [start] })
    expect(optionButtons(wrapper).map(button => button.tabIndex)).toEqual([0, -1, -1, -1])

    await wrapper.setProps({ selected: 'learn' })
    expect(optionButtons(wrapper).map(button => button.tabIndex)).toEqual([-1, -1, -1, 0])

    // A disabled selection cannot hold the tab stop.
    await wrapper.setProps({ selected: 'mail', steps: [gridStep(3, [0, 2])] })
    expect(optionButtons(wrapper).map(button => button.tabIndex)).toEqual([-1, 0, -1])
  })

  it('moves focus with Up and Down, skipping disabled options and wrapping', async () => {
    const wrapper = mountCard({ steps: [start] })
    optionButtons(wrapper)[0]!.focus()

    const down = await press(wrapper, 'ArrowDown')
    expect(down.defaultPrevented).toBe(true)
    expect(focusedIndex(wrapper)).toBe(1)

    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(3)

    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(0)

    await press(wrapper, 'ArrowUp')
    expect(focusedIndex(wrapper)).toBe(3)
    // The tab stop follows focus.
    expect(optionButtons(wrapper).map(button => button.tabIndex)).toEqual([-1, -1, -1, 0])
  })

  it('jumps to the first and last enabled option with Home and End', async () => {
    const wrapper = mountCard({ steps: [gridStep(5, [0, 4])] })
    optionButtons(wrapper)[2]!.focus()

    await press(wrapper, 'End')
    expect(focusedIndex(wrapper)).toBe(3)

    await press(wrapper, 'Home')
    expect(focusedIndex(wrapper)).toBe(1)
  })

  it('leaves Left and Right alone in one column', async () => {
    const wrapper = mountCard({ steps: [start] })
    optionButtons(wrapper)[0]!.focus()

    const right = await press(wrapper, 'ArrowRight')
    expect(right.defaultPrevented).toBe(false)
    expect(focusedIndex(wrapper)).toBe(0)
  })

  it('leaves modified arrows to the page', async () => {
    const wrapper = mountCard({ steps: [start] })
    optionButtons(wrapper)[0]!.focus()

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true })
    document.activeElement!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(focusedIndex(wrapper)).toBe(0)
  })

  it('moves along the row with Left and Right and down the column with Up and Down in two columns', async () => {
    // [0 1]
    // [2 3]
    // [4  ]
    const wrapper = mountCard({ steps: [gridStep(5)], columns: 2 })
    expect(wrapper.find('.tx-choice-card').classes()).toContain('is-two-columns')
    optionButtons(wrapper)[0]!.focus()

    await press(wrapper, 'ArrowRight')
    expect(focusedIndex(wrapper)).toBe(1)
    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(3)
    // Column 1 has no third row: Down wraps to its top.
    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(1)
    await press(wrapper, 'ArrowLeft')
    expect(focusedIndex(wrapper)).toBe(0)
    await press(wrapper, 'ArrowUp')
    expect(focusedIndex(wrapper)).toBe(4)
    // Reading order continues onto the next row, and wraps at the end.
    await press(wrapper, 'ArrowRight')
    expect(focusedIndex(wrapper)).toBe(0)
    await press(wrapper, 'ArrowLeft')
    expect(focusedIndex(wrapper)).toBe(4)
  })

  it('skips a disabled option in its column', async () => {
    const wrapper = mountCard({ steps: [gridStep(6, [2])], columns: 2 })
    optionButtons(wrapper)[0]!.focus()

    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(4)
  })

  it('follows the columns the container query renders, not the prop', async () => {
    const original = window.getComputedStyle.bind(window)
    let tracks = '320px'
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
      if (element instanceof HTMLElement && element.classList.contains('tx-choice-card__options'))
        return { gridTemplateColumns: tracks } as CSSStyleDeclaration
      return original(element, pseudo)
    })

    const wrapper = mountCard({ steps: [gridStep(4)], columns: 2 })
    optionButtons(wrapper)[0]!.focus()

    // One rendered track: Down is the next row, and Right has no neighbour to go to.
    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(1)
    const right = await press(wrapper, 'ArrowRight')
    expect(right.defaultPrevented).toBe(false)
    expect(focusedIndex(wrapper)).toBe(1)

    tracks = '236px 236px'
    await press(wrapper, 'ArrowDown')
    expect(focusedIndex(wrapper)).toBe(3)
  })

  it('carries focus to the next page when the host advances after a choice', async () => {
    const wrapper = mountCard({
      steps: [start, report],
      step: 0,
      onSelect: () => wrapper.setProps({ step: 1 }),
    })
    const plan = optionButtons(wrapper)[1]!
    plan.focus()

    plan.click()
    await nextTick()
    await nextTick()

    expect(wrapper.find('h3').text()).toBe('Which report?')
    expect(document.activeElement).toBe(optionButtons(wrapper)[0])
    expect(document.activeElement!.textContent).toContain('Team update')
  })

  it('hands focus to the other arrow when the one in use is disabled by the move', async () => {
    const wrapper = mountCard({
      'steps': [start, report],
      'step': 0,
      'onUpdate:step': (index: number) => wrapper.setProps({ step: index }),
    })
    const { next } = navButtons(wrapper)
    next.focus()

    next.click()
    await nextTick()
    await nextTick()

    expect(next.disabled).toBe(true)
    expect(document.activeElement).toBe(navButtons(wrapper).prev)
  })

  it('leaves focus on an arrow that is still usable', async () => {
    const wrapper = mountCard({
      'steps': [start, report, gridStep(2)],
      'step': 0,
      'onUpdate:step': (index: number) => wrapper.setProps({ step: index }),
    })
    const { next } = navButtons(wrapper)
    next.focus()

    next.click()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.tx-choice-card__count').text()).toBe('2 / 3')
    expect(document.activeElement).toBe(next)
  })
})

describe('txChoiceCard loading', () => {
  it('draws skeleton rows in place of the options and no option buttons', () => {
    const wrapper = mountCard({ steps: [start], loading: true })

    expect(wrapper.find('button.tx-choice-card__option').exists()).toBe(false)
    expect(wrapper.find('ul.tx-choice-card__options').exists()).toBe(false)
    const rows = wrapper.findAll('.tx-choice-card__option.is-placeholder')
    expect(rows).toHaveLength(3)

    // Built from the loaded row's own boxes: icon, label line, description line.
    for (const row of rows) {
      expect(row.find('.tx-choice-card__icon .tx-skeleton').exists()).toBe(true)
      expect(row.find('.tx-choice-card__label .tx-skeleton').exists()).toBe(true)
      expect(row.find('.tx-choice-card__desc .tx-skeleton').exists()).toBe(true)
    }

    expect(wrapper.find('.tx-choice-card__options.is-placeholder').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('section').attributes('aria-busy')).toBe('true')
    // The question stays: only the options are pending.
    expect(wrapper.find('h3').text()).toBe('Where do we start?')
  })

  it('draws as many rows as loadingRows asks for', () => {
    const wrapper = mountCard({ steps: [start], loading: true, loadingRows: 5 })
    expect(wrapper.findAll('.tx-choice-card__option.is-placeholder')).toHaveLength(5)
  })

  it('lays the skeleton out in the same columns as the options', () => {
    const wrapper = mountCard({ steps: [start], loading: true, columns: 2 })
    expect(wrapper.find('.tx-choice-card').classes()).toContain('is-two-columns')
    expect(wrapper.find('.tx-choice-card__options.is-placeholder').exists()).toBe(true)
  })

  it('brings the options in when loading ends', async () => {
    const wrapper = mountCard({ steps: [start], loading: true })

    await wrapper.setProps({ loading: false })
    expect(optionButtons(wrapper)).toHaveLength(4)
    expect(wrapper.find('section').attributes('aria-busy')).toBeUndefined()
    expect(wrapper.find('ul.tx-choice-card__options').classes()).toContain('is-appearing')
  })
})

describe('txChoiceCard entrance', () => {
  it('staggers the options in on first render', () => {
    const wrapper = mountCard({ steps: [gridStep(10)] })
    const items = wrapper.findAll('li.tx-choice-card__item')

    expect(wrapper.find('ul.tx-choice-card__options').classes()).toContain('is-appearing')
    expect(items[0]!.attributes('style')).toContain('--tx-choice-card-index: 0')
    expect(items[3]!.attributes('style')).toContain('--tx-choice-card-index: 3')
    // Capped, so a long list does not keep its last rows waiting.
    expect(items[9]!.attributes('style')).toContain('--tx-choice-card-index: 8')
  })

  it('renders with no entrance when appear is off', () => {
    const wrapper = mountCard({ steps: [start], appear: false })
    const list = wrapper.find('ul.tx-choice-card__options')

    expect(list.classes()).not.toContain('is-appearing')
    expect(list.classes()).not.toContain('is-stepping')
  })

  it('blur-fades a new page in as one, heading included', async () => {
    const wrapper = mountCard({ steps: [start, report], step: 0 })
    const before = wrapper.find('ul.tx-choice-card__options').element

    await wrapper.setProps({ step: 1 })
    const list = wrapper.find('ul.tx-choice-card__options')

    // A fresh node, so the animation runs on it.
    expect(list.element).not.toBe(before)
    expect(list.classes()).toContain('is-stepping')
    expect(list.classes()).not.toContain('is-appearing')
    expect(wrapper.find('.tx-choice-card__heading').classes()).toContain('is-stepping')
  })

  it('replays the step entrance when the page is replaced in place', async () => {
    const wrapper = mountCard({ steps: [start], appear: false })
    const before = wrapper.find('ul.tx-choice-card__options').element

    await wrapper.setProps({ steps: [report] })
    const list = wrapper.find('ul.tx-choice-card__options')

    expect(list.element).not.toBe(before)
    expect(list.classes()).toContain('is-stepping')
  })
})
