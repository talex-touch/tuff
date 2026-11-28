import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent } from 'vue'
import VersionCapsule, {
  TxVersionCapsule,
  TxVersionDownloadPanel,
  TxVersionHistoryPanel,
} from '../index'

const PopoverStub = defineComponent({
  name: 'TxPopover',
  props: {
    modelValue: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    closeOnClickOutside: { type: Boolean, default: true },
    closeOnEsc: { type: Boolean, default: true },
  },
  emits: ['update:modelValue'],
  template: `
    <div class="tx-popover-stub" :data-open="String(modelValue)">
      <div class="tx-popover-stub__reference">
        <slot name="reference" />
      </div>
      <div v-if="modelValue" class="tx-popover-stub__content">
        <slot />
      </div>
    </div>
  `,
})

function mountCapsule(props: Record<string, unknown> = {}, slots?: Record<string, string>) {
  return mount(TxVersionCapsule, {
    attachTo: document.body,
    props: {
      version: 'v2.4.13-beta.19',
      channel: 'BETA',
      ...props,
    },
    slots: slots ?? {
      download: '<div class="download-slot">download</div>',
      history: '<div class="history-slot">history</div>',
    },
    global: {
      stubs: {
        TxPopover: PopoverStub,
      },
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('txVersionCapsule', () => {
  it('renders the channel and version, with both panels closed', () => {
    const wrapper = mountCapsule()

    expect(wrapper.find('.tx-version-capsule__channel').text()).toBe('BETA')
    expect(wrapper.find('.tx-version-capsule__version').text()).toBe('v2.4.13-beta.19')
    expect(wrapper.find('.download-slot').exists()).toBe(false)
    expect(wrapper.find('.history-slot').exists()).toBe(false)
  })

  it('opens only the download pane from the left segment via TxPopover', async () => {
    const wrapper = mountCapsule()

    await wrapper.find('.tx-version-capsule__segment--download').trigger('click')

    expect(wrapper.findComponent(PopoverStub).props('modelValue')).toBe(true)
    expect(wrapper.find('.download-slot').exists()).toBe(true)
    expect(wrapper.find('.history-slot').exists()).toBe(false)
    expect(wrapper.emitted('download')).toHaveLength(1)
    expect(wrapper.emitted('update:panel')?.[0]).toEqual(['download'])
  })

  it('opens only the history pane from the right segment via TxPopover', async () => {
    const wrapper = mountCapsule()

    await wrapper.find('.tx-version-capsule__segment--history').trigger('click')

    expect(wrapper.findComponent(PopoverStub).props('modelValue')).toBe(true)
    expect(wrapper.find('.history-slot').exists()).toBe(true)
    expect(wrapper.find('.download-slot').exists()).toBe(false)
    expect(wrapper.emitted('history')).toHaveLength(1)
  })

  it('slides to history via the bottom View more button and returns via Back', async () => {
    const wrapper = mountCapsule({ viewMoreLabel: 'View more', backLabel: 'Back' })

    await wrapper.find('.tx-version-capsule__segment--download').trigger('click')
    expect(wrapper.find('.download-slot').exists()).toBe(true)
    expect(wrapper.find('.tx-version-capsule__more-btn').text()).toContain('View more')

    await wrapper.find('.tx-version-capsule__more-btn').trigger('click')
    expect(wrapper.find('.download-slot').exists()).toBe(false)
    expect(wrapper.find('.history-slot').exists()).toBe(true)
    expect(wrapper.emitted('update:panel')?.[1]).toEqual(['history'])

    await wrapper.find('.tx-version-capsule__back-btn').trigger('click')
    expect(wrapper.find('.download-slot').exists()).toBe(true)
    expect(wrapper.find('.history-slot').exists()).toBe(false)
    expect(wrapper.emitted('update:panel')?.[2]).toEqual(['download'])
  })

  it('toggles the same panel closed on a second click', async () => {
    const wrapper = mountCapsule()
    const segment = wrapper.find('.tx-version-capsule__segment--download')

    await segment.trigger('click')
    await segment.trigger('click')

    expect(wrapper.find('.download-slot').exists()).toBe(false)
    expect(wrapper.emitted('update:panel')?.[1]).toEqual([null])
  })

  it('closes when TxPopover emits modelValue=false (Escape / outside click)', async () => {
    const wrapper = mountCapsule({ closeOnClickOutside: true, closeOnEsc: true })
    const popover = wrapper.findComponent(PopoverStub)

    expect(popover.props('closeOnClickOutside')).toBe(true)
    expect(popover.props('closeOnEsc')).toBe(true)

    await wrapper.find('.tx-version-capsule__segment--history').trigger('click')
    expect(wrapper.find('.history-slot').exists()).toBe(true)

    popover.vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.history-slot').exists()).toBe(false)
    expect(wrapper.emitted('update:panel')?.[1]).toEqual([null])
  })

  it('honours a controlled panel prop', async () => {
    const wrapper = mountCapsule({ panel: 'history' })
    expect(wrapper.find('.history-slot').exists()).toBe(true)

    await wrapper.setProps({ panel: null })
    expect(wrapper.find('.history-slot').exists()).toBe(false)
  })

  it('dismisses controlled open panel when TxPopover closes', async () => {
    const wrapper = mountCapsule({ panel: 'download' })
    expect(wrapper.find('.download-slot').exists()).toBe(true)

    wrapper.findComponent(PopoverStub).vm.$emit('update:modelValue', false)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:panel')?.[0]).toEqual([null])
  })

  it('does not open while disabled, and closes when disabled mid-flight', async () => {
    const disabled = mountCapsule({ disabled: true })
    await disabled.find('.tx-version-capsule__segment--download').trigger('click')
    expect(disabled.find('.download-slot').exists()).toBe(false)

    const wrapper = mountCapsule()
    await wrapper.find('.tx-version-capsule__segment--download').trigger('click')
    expect(wrapper.find('.download-slot').exists()).toBe(true)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.find('.download-slot').exists()).toBe(false)
  })

  it('acts as a plain trigger when a panel slot is absent', async () => {
    const wrapper = mountCapsule({}, { download: '<div class="download-slot">download</div>' })

    await wrapper.find('.tx-version-capsule__segment--history').trigger('click')

    expect(wrapper.emitted('history')).toHaveLength(1)
    expect(wrapper.findComponent(PopoverStub).props('modelValue')).toBe(false)
    expect(wrapper.emitted('update:panel')).toBeUndefined()

    await wrapper.find('.tx-version-capsule__segment--download').trigger('click')
    expect(wrapper.find('.download-slot').exists()).toBe(true)
    expect(wrapper.find('.tx-version-capsule__more-btn').exists()).toBe(false)
  })

  it('registers the component through install', () => {
    const app = createApp({})
    const component = vi.spyOn(app, 'component')

    app.use(VersionCapsule)

    expect(component).toHaveBeenCalledWith('TxVersionCapsule', VersionCapsule)
  })
})

describe('txVersionDownloadPanel', () => {
  const builds = [
    { id: 'mac-arm', name: 'macOS · Apple silicon', meta: '.dmg · 126 MB', href: '/a.dmg', recommended: true },
    { id: 'mac-x64', name: 'macOS · Intel', meta: '.dmg · 131 MB', href: '/b.dmg' },
    { id: 'win', name: 'Windows · x64', meta: '.exe · 118 MB' },
  ]

  it('renders the notice with its bullet points', () => {
    const wrapper = mount(TxVersionDownloadPanel, {
      props: {
        notice: { title: 'Preview channel build', description: 'Not certified yet:', points: ['Pre-release', 'Unverified'] },
        builds,
      },
    })

    expect(wrapper.find('.tx-version-download-panel__notice-title').text()).toBe('Preview channel build')
    expect(wrapper.findAll('.tx-version-download-panel__points li')).toHaveLength(2)
    expect(wrapper.find('.tx-version-download-panel__notice--warning').exists()).toBe(true)
  })

  it('gives the labelled button to the recommended build only', () => {
    const wrapper = mount(TxVersionDownloadPanel, { props: { builds } })

    const ctas = wrapper.findAll('.tx-version-download-panel__cta')
    expect(ctas).toHaveLength(1)
    expect(wrapper.find('.is-recommended .tx-version-download-panel__build-name').text()).toBe('macOS · Apple silicon')
  })

  it('renders a link for downloadable builds and a button otherwise', () => {
    const wrapper = mount(TxVersionDownloadPanel, { props: { builds } })

    const rows = wrapper.findAll('.tx-version-download-panel__build')
    expect(rows[0]!.element.tagName).toBe('A')
    expect(rows[2]!.element.tagName).toBe('BUTTON')
  })

  it('emits the build id on select', async () => {
    const wrapper = mount(TxVersionDownloadPanel, { props: { builds } })

    await wrapper.findAll('.tx-version-download-panel__build')[1]!.trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual(['mac-x64'])
  })

  it('falls back to the empty text with no builds', () => {
    const wrapper = mount(TxVersionDownloadPanel, { props: { emptyText: 'Nothing here' } })

    expect(wrapper.find('.tx-version-download-panel__empty').text()).toBe('Nothing here')
  })
})

describe('txVersionHistoryPanel', () => {
  const latest = { id: '1', tag: 'v2.4.13-beta.19', channel: 'BETA', tone: 'preview' as const, date: 'Jul 21', note: 'Icon self-healing' }
  const entries = [
    { id: '2', tag: 'v2.4.13-beta.18', channel: 'BETA', tone: 'preview' as const, date: 'Jul 21' },
    { id: '3', tag: 'v2.4.12', channel: 'RELEASE', tone: 'stable' as const, date: 'Jul 12' },
  ]

  it('renders the latest card above the list', () => {
    const wrapper = mount(TxVersionHistoryPanel, { props: { latest, entries, countLabel: '3 releases' } })

    expect(wrapper.find('.tx-version-history-panel__latest-tag').text()).toBe('v2.4.13-beta.19')
    expect(wrapper.find('.tx-version-history-panel__latest-note').text()).toBe('Icon self-healing')
    expect(wrapper.find('.tx-version-history-panel__count').text()).toBe('3 releases')
    expect(wrapper.findAll('.tx-version-history-panel__row')).toHaveLength(2)
  })

  it('resolves the tone class per entry so a stable row stays distinct', () => {
    const wrapper = mount(TxVersionHistoryPanel, { props: { entries } })

    const rows = wrapper.findAll('.tx-version-history-panel__row')
    expect(rows[0]!.classes()).toContain('tx-version-history-panel--preview')
    expect(rows[1]!.classes()).toContain('tx-version-history-panel--stable')
  })

  it('emits the entry on select', async () => {
    const wrapper = mount(TxVersionHistoryPanel, { props: { entries } })

    await wrapper.findAll('.tx-version-history-panel__row')[1]!.trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([entries[1]])
  })

  it('shows the empty text with neither latest nor entries', () => {
    const wrapper = mount(TxVersionHistoryPanel, { props: { emptyText: 'No releases' } })

    expect(wrapper.find('.tx-version-history-panel__empty').text()).toBe('No releases')
  })

  it('renders no-href latest and rows as keyboard-reachable buttons', () => {
    const wrapper = mount(TxVersionHistoryPanel, { props: { latest, entries } })

    const latestEl = wrapper.find('.tx-version-history-panel__latest')
    expect(latestEl.element.tagName).toBe('BUTTON')
    expect(latestEl.attributes('type')).toBe('button')

    const rows = wrapper.findAll('.tx-version-history-panel__row')
    for (const row of rows) {
      expect(row.element.tagName).toBe('BUTTON')
      expect(row.attributes('type')).toBe('button')
    }

    const linked = mount(TxVersionHistoryPanel, {
      props: { entries: [{ id: '9', tag: 'v1.0.0', tone: 'preview' as const, href: '/releases/1' }] },
    })
    expect(linked.find('.tx-version-history-panel__row').element.tagName).toBe('A')
  })

  it('filters releases by channel with auto-derived and custom filters', async () => {
    const wrapper = mount(TxVersionHistoryPanel, {
      props: {
        latest,
        entries,
        filters: [
          { value: 'all', label: 'All' },
          { value: 'beta', label: 'Beta' },
          { value: 'release', label: 'Release' },
        ],
      },
    })

    const filters = wrapper.findAll('.tx-version-history-panel__filter')
    expect(filters.map(item => item.text())).toEqual(['All', 'Beta', 'Release'])
    expect(wrapper.find('.tx-version-history-panel__latest').exists()).toBe(true)
    expect(wrapper.findAll('.tx-version-history-panel__row')).toHaveLength(2)

    await filters[2]!.trigger('click')
    expect(wrapper.emitted('update:filter')?.[0]).toEqual(['release'])
    expect(wrapper.find('.tx-version-history-panel__latest').exists()).toBe(false)
    expect(wrapper.findAll('.tx-version-history-panel__row')).toHaveLength(1)
    expect(wrapper.find('.tx-version-history-panel__row-tag').text()).toBe('v2.4.12')

    await filters[1]!.trigger('click')
    expect(wrapper.find('.tx-version-history-panel__latest').exists()).toBe(true)
    expect(wrapper.findAll('.tx-version-history-panel__row')).toHaveLength(1)
    expect(wrapper.find('.tx-version-history-panel__row-tag').text()).toBe('v2.4.13-beta.18')
  })
})
