import type { IconPickerEntry, IconPickerLabels } from '../src/types'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { formatIconIdentifier, parseIconIdentifier } from '../src/identifier'
import TxIconPickerPanel from '../src/TxIconPickerPanel.vue'

describe('icon identifier', () => {
  it('round-trips every type, including values that contain colons', () => {
    // The split is on the *first* colon. A `split(':')` implementation passes
    // the first three rows and truncates the last two, which are exactly the
    // values a real user produces: a URL with a scheme, a Windows path.
    const cases = [
      ['emoji', '🚀'],
      ['class', 'i-ri-rocket-line'],
      ['builtin', 'star'],
      ['url', 'https://cdn.dev/a.svg?v=2#frag'],
      ['file', 'C:/Users/me/a.png'],
    ] as const

    for (const [type, value] of cases) {
      const identifier = `${type}:${value}`
      expect(parseIconIdentifier(identifier)).toEqual({ type, value })
      expect(formatIconIdentifier({ type, value })).toBe(identifier)
    }
  })

  it('accepts a bare emoji, including sequences a pictographic test alone would miss', () => {
    // `\p{Extended_Pictographic}` matches the base of a ZWJ sequence but not
    // its joiner, so an anchored test on it passes 🚀 and rejects 👨‍💻 — the
    // failure this row exists to catch.
    for (const value of ['🚀', '👨‍💻', '🇨🇳', '👍🏽'])
      expect(parseIconIdentifier(value)).toEqual({ type: 'emoji', value })
  })

  it('rejects anything it would have to guess at', () => {
    // An unprefixed class is the important one: resolving it by shape produces
    // an icon that renders as an empty box with no error raised anywhere.
    const rejected = ['', '   ', 'bogus:x', 'class:', ':value', 'plain text', 'i-ri-rocket-line']

    for (const value of rejected)
      expect(parseIconIdentifier(value)).toBeNull()
  })

  it('formats a missing or valueless source as the empty identifier', () => {
    expect(formatIconIdentifier(null)).toBe('')
    expect(formatIconIdentifier(undefined)).toBe('')
    expect(formatIconIdentifier({ type: 'emoji', value: '' })).toBe('')
  })
})

const LABELS: IconPickerLabels = {
  emoji: 'Emoji',
  icon: 'Icons',
  brand: 'Brands',
  file: 'File',
  search: 'Search icons',
  empty: 'No matching icon',
  clear: 'Clear',
  chooseFile: 'Choose local file',
  shape: 'Shape',
  shapeCircle: 'Circle',
  shapeRounded: 'Rounded',
  shapeSquare: 'Square',
}

const ASSISTANT: IconPickerEntry = {
  id: 'class:i-ri-chat-ai-line',
  icon: { type: 'class', value: 'i-ri-chat-ai-line' },
  keywords: 'ai chat assistant',
}
const MESSAGE: IconPickerEntry = {
  id: 'class:i-ri-message-3-line',
  icon: { type: 'class', value: 'i-ri-message-3-line' },
  keywords: 'chat message',
}

/** An explicit catalog, so no assertion depends on the bundled rows. */
const CATALOG = { icon: [ASSISTANT, MESSAGE] }

type PanelWrapper = VueWrapper<InstanceType<typeof TxIconPickerPanel>>

function mountPanel(props: Record<string, unknown> = {}): PanelWrapper {
  return mount(TxIconPickerPanel, {
    props: {
      modelValue: '',
      shape: 'rounded',
      sections: ['icon'],
      catalog: CATALOG,
      shapeSelectable: true,
      labels: LABELS,
      disabled: false,
      accept: 'image/*',
      hasFileChooser: false,
      fileBusy: false,
      ...props,
    },
  })
}

async function search(wrapper: PanelWrapper, query: string): Promise<void> {
  await wrapper.find('.tx-icon-picker-panel__search-input').setValue(query)
  await nextTick()
}

describe('txIconPickerPanel search', () => {
  it('narrows conjunctively across terms', async () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('.tx-icon-picker-panel__cell')).toHaveLength(2)

    // Both entries carry "chat"; only one carries "ai". Matching the joined
    // query, or OR-ing the terms, leaves both.
    await search(wrapper, 'ai chat')

    const cells = wrapper.findAll('.tx-icon-picker-panel__cell')
    expect(cells).toHaveLength(1)
    expect(cells[0].attributes('title')).toBe('i-ri-chat-ai-line')
  })

  it('matches the icon value, not only the keywords', async () => {
    const wrapper = mountPanel()
    // "message-3" appears in no keyword list — only in the class itself.
    await search(wrapper, 'message-3')

    const cells = wrapper.findAll('.tx-icon-picker-panel__cell')
    expect(cells).toHaveLength(1)
    expect(cells[0].attributes('title')).toBe('i-ri-message-3-line')
  })

  it('shows the empty label and no cells when nothing matches', async () => {
    const wrapper = mountPanel()
    await search(wrapper, 'zzz-no-such-icon')

    expect(wrapper.findAll('.tx-icon-picker-panel__cell')).toHaveLength(0)
    expect(wrapper.find('.tx-icon-picker-panel__empty').text()).toBe(LABELS.empty)
  })

  it('restores the full grid through resetQuery', async () => {
    const wrapper = mountPanel()
    await search(wrapper, 'assistant')
    expect(wrapper.findAll('.tx-icon-picker-panel__cell')).toHaveLength(1)

    // The host calls this when the panel closes, so reopening never shows a
    // filter the user did not ask for.
    wrapper.vm.resetQuery()
    await nextTick()

    expect(wrapper.findAll('.tx-icon-picker-panel__cell')).toHaveLength(2)
  })
})

describe('txIconPickerPanel selection', () => {
  it('emits the selected entry', async () => {
    const wrapper = mountPanel()
    await wrapper.findAll('.tx-icon-picker-panel__cell')[1].trigger('click')

    expect(wrapper.emitted('select')).toEqual([[MESSAGE]])
  })

  it('marks only the entry matching modelValue as selected', () => {
    const wrapper = mountPanel({ modelValue: MESSAGE.id })
    const cells = wrapper.findAll('.tx-icon-picker-panel__cell')

    expect(cells[0].attributes('aria-selected')).toBe('false')
    expect(cells[1].attributes('aria-selected')).toBe('true')
  })

  it('enables clear only when an icon is set', async () => {
    const empty = mountPanel()
    const clear = () => empty.findAll('.tx-icon-picker-panel__action').at(-1)!
    expect(clear().attributes('disabled')).toBeDefined()

    await empty.setProps({ modelValue: ASSISTANT.id })
    expect(clear().attributes('disabled')).toBeUndefined()

    await clear().trigger('click')
    expect(empty.emitted('clear')).toHaveLength(1)
  })

  it('routes the file action to the host chooser only when it has one', async () => {
    const hosted = mountPanel({ sections: ['icon', 'file'], hasFileChooser: true })
    await hosted.find('.tx-icon-picker-panel__action').trigger('click')
    expect(hosted.emitted('choose-file')).toHaveLength(1)
    // With a host chooser there is no fallback input to leave lying around.
    expect(hosted.find('.tx-icon-picker-panel__file').exists()).toBe(false)

    const standalone = mountPanel({ sections: ['icon', 'file'], hasFileChooser: false })
    await standalone.find('.tx-icon-picker-panel__action').trigger('click')
    expect(standalone.emitted('choose-file')).toBeUndefined()
    expect(standalone.find('.tx-icon-picker-panel__file').exists()).toBe(true)
  })

  it('omits the file action entirely when the section is not offered', () => {
    const wrapper = mountPanel({ sections: ['icon'] })
    const actions = wrapper.findAll('.tx-icon-picker-panel__action')

    // Only `clear` remains; an action that opens nothing is worse than absent.
    expect(actions).toHaveLength(1)
    expect(actions[0].text()).toBe(LABELS.clear)
  })
})

describe('txIconPickerPanel sections', () => {
  it('hides the tab bar when a single section is offered', () => {
    // A one-tab bar reads as a broken control, not as a choice.
    expect(mountPanel({ sections: ['icon'] }).find('.tx-icon-picker-panel__tabs').exists()).toBe(false)
    expect(mountPanel({ sections: ['icon', 'file'] }).find('.tx-icon-picker-panel__tabs').exists()).toBe(false)

    const many = mountPanel({ sections: ['emoji', 'icon'] })
    expect(many.find('.tx-icon-picker-panel__tabs').exists()).toBe(true)
    expect(many.findAll('.tx-icon-picker-panel__tab')).toHaveLength(2)
  })

  it('falls back to a surviving section when the active one is withdrawn', async () => {
    const wrapper = mountPanel({
      sections: ['emoji', 'icon'],
      catalog: { ...CATALOG, emoji: [] },
    })
    await wrapper.findAll('.tx-icon-picker-panel__tab')[0].trigger('click')
    expect(wrapper.findAll('.tx-icon-picker-panel__cell')).toHaveLength(0)

    // A host narrowing `sections` at runtime would otherwise leave the panel
    // pointed at a section with no tab and no grid behind it.
    await wrapper.setProps({ sections: ['icon'] })

    expect(wrapper.findAll('.tx-icon-picker-panel__cell')).toHaveLength(2)
  })

  it('reports the shape the user pressed', async () => {
    const wrapper = mountPanel({ shape: 'rounded' })
    const shapes = wrapper.findAll('.tx-icon-picker-panel__shape')

    // The row is a radio group: exactly one shape is current, and it is the
    // one the host passed, not whatever was pressed last.
    expect(shapes.map(shape => shape.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
    await shapes[0].trigger('click')

    expect(wrapper.emitted('select-shape')).toEqual([['circle']])
  })
})
