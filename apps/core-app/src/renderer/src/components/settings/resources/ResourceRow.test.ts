// @vitest-environment jsdom
import type { AgentRef } from './agent-registry'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'

vi.hoisted(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    locale: ref('en-US')
  })
}))

import ResourceRow from './ResourceRow.vue'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'

const AGENTS: AgentRef[] = [
  { agentId: 'claude', label: 'Claude Code' },
  { agentId: 'codex', label: 'Codex' }
]

function mountRow(props: Record<string, unknown> = {}, trailing?: () => unknown) {
  return mount(ResourceRow, {
    props: {
      name: 'context7',
      description: 'npx -y @upstash/context7-mcp',
      descriptionMono: true,
      tags: [{ label: 'stdio' }, { label: 'Secrets', tone: 'warning' }],
      agents: AGENTS,
      configured: ['codex'],
      ...props
    },
    slots: trailing ? { trailing } : {}
  })
}

describe('resourceRow', () => {
  it('shows the name, its labels, a one-line description and which agents hold it', () => {
    const wrapper = mountRow()

    expect(wrapper.find('.ResourceRow-Name').text()).toBe('context7')
    expect(wrapper.findAll('.ResourceRow-Tags .SettingChip').map((tag) => tag.text())).toEqual([
      'stdio',
      'Secrets'
    ])
    expect(wrapper.find('.ResourceRow-Tags .SettingChip.tone-warning').text()).toBe('Secrets')
    expect(wrapper.find('.ResourceRow-Desc').text()).toBe('npx -y @upstash/context7-mcp')
    expect(wrapper.find('.ResourceRow-Desc').classes()).toContain('is-mono')
    expect(
      wrapper.findAll('.AgentIconRow-Item').map((item) => item.attributes('data-configured'))
    ).toEqual(['false', 'true'])
  })

  it('opens its details from one real button named after the item', async () => {
    const wrapper = mountRow()
    const hit = wrapper.find('button.ResourceRow-Hit')

    expect(hit.attributes('aria-label')).toBe('settings.resources.openDetails:{"name":"context7"}')
    expect(hit.attributes('aria-haspopup')).toBe('dialog')
    await hit.trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('keeps the trailing control out of the open button: using it opens nothing', async () => {
    const toggled = vi.fn()
    const wrapper = mountRow({}, () =>
      h('button', { type: 'button', class: 'Probe', onClick: toggled }, 'switch')
    )

    // Siblings, not nested: a control inside a button is invalid HTML.
    expect(wrapper.find('button.ResourceRow-Hit button').exists()).toBe(false)
    await wrapper.find('.ResourceRow-Trailing .Probe').trigger('click')
    expect(toggled).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('marks the row whose details are open', () => {
    const wrapper = mountRow({ active: true })

    expect(wrapper.classes()).toContain('is-active')
    expect(wrapper.find('button.ResourceRow-Hit').attributes('aria-expanded')).toBe('true')
  })

  it('takes a page-supplied accessible name and leaves out what it was not given', () => {
    const wrapper = mountRow({ openLabel: 'Open context7', description: undefined, tags: [] })

    expect(wrapper.find('button.ResourceRow-Hit').attributes('aria-label')).toBe('Open context7')
    expect(wrapper.find('.ResourceRow-Desc').exists()).toBe(false)
    expect(wrapper.find('.ResourceRow-Tags').exists()).toBe(false)
    expect(wrapper.find('.ResourceRow-Trailing').exists()).toBe(false)
  })

  it('draws its loading skeleton from the same containers, hidden and inert', () => {
    const wrapper = mount(ResourceRow, {
      props: { placeholder: true, descriptionMono: true, placeholderAgents: 2 }
    })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('button').exists()).toBe(false)
    // The same line boxes as a loaded row: name, a real label chip, a description line.
    expect(wrapper.find('.ResourceRow-Head .ResourceRow-Name').exists()).toBe(true)
    expect(wrapper.find('.ResourceRow-Tags .SettingChip').exists()).toBe(true)
    expect(wrapper.find('.ResourceRow-Desc').classes()).toContain('is-mono')
    expect(wrapper.findAll('.ResourceRow-AgentsPlaceholder .tx-skeleton')).toHaveLength(2)
    expect(wrapper.find('.ResourceRow-Trailing .tx-skeleton').exists()).toBe(true)
  })

  it('shows a label’s hint on hover, and only a hinted label takes the pointer', () => {
    const wrapper = mountRow({
      tags: [{ label: '本地', hint: '/Users/me/.claude/skills/apple-design' }, { label: 'stdio' }]
    })

    const tooltips = wrapper.findAllComponents(TxTooltip)
    // The agent strip's marks carry their own tooltips; the label's is the one with its path.
    expect(tooltips.map((tooltip) => tooltip.props('content'))).toContain(
      '/Users/me/.claude/skills/apple-design'
    )
    const hinted = wrapper.find('.ResourceRow-HintedTag')
    expect(hinted.text()).toBe('本地')
    expect(wrapper.findAll('.ResourceRow-Tags .SettingChip').map((chip) => chip.text())).toEqual([
      '本地',
      'stdio'
    ])
    expect(wrapper.findAll('.ResourceRow-HintedTag')).toHaveLength(1)
  })

  it('leaves out the agent strip for an item no agent can hold', () => {
    const wrapper = mountRow({ agents: [], configured: [] })

    // No strip at all: an empty one would still announce "no agent configures it".
    expect(wrapper.find('.AgentIconRow').exists()).toBe(false)
    expect(wrapper.find('.ResourceRow-Name').text()).toBe('context7')
  })

  it('keeps the strip when the page lists agents, even if none holds this item', () => {
    const wrapper = mountRow({ configured: [] })

    expect(wrapper.find('.AgentIconRow').exists()).toBe(true)
    expect(
      wrapper.findAll('.AgentIconRow-Item').map((item) => item.attributes('data-configured'))
    ).toEqual(['false', 'false'])
  })

  it('names what opening does with a hint that is not a second control', async () => {
    const wrapper = mountRow({
      agents: [],
      configured: [],
      openHint: 'Configure',
      openLabel: 'Configure context7'
    })
    const hint = wrapper.find('.ResourceRow-Hint')

    expect(hint.text()).toBe('Configure')
    expect(hint.attributes('aria-hidden')).toBe('true')
    expect(hint.find('button').exists()).toBe(false)
    // One button in the row, and it is the one the hint describes.
    expect(wrapper.findAll('button')).toHaveLength(1)
    await wrapper.find('button.ResourceRow-Hit').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('draws the skeleton of a row with no label, no agents and an open hint', () => {
    const wrapper = mount(ResourceRow, {
      props: {
        placeholder: true,
        placeholderTags: false,
        placeholderAgents: 0,
        placeholderSwitch: false,
        placeholderHint: true
      }
    })

    expect(wrapper.find('.ResourceRow-Tags').exists()).toBe(false)
    expect(wrapper.find('.ResourceRow-AgentsPlaceholder').exists()).toBe(false)
    expect(wrapper.find('.ResourceRow-Trailing').exists()).toBe(false)
    expect(wrapper.find('.ResourceRow-Hint .tx-skeleton').exists()).toBe(true)
  })
})
