// @vitest-environment jsdom
import type { AgentCount } from './agent-registry'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import ResourceAgentBar from './ResourceAgentBar.vue'

const AGENTS: AgentCount[] = [
  { agentId: 'claude', label: 'Claude Code', count: 8 },
  { agentId: 'codex', label: 'Codex', count: 5 },
  { agentId: 'pi', label: 'Pi', count: 2 }
]

function chip(wrapper: ReturnType<typeof mount>, agentId: string) {
  const found = wrapper
    .findAll('button.tx-bui-filter-chips__chip')
    .find((candidate) => candidate.find(`[data-agent-chip="${agentId}"]`).exists())
  if (!found) throw new Error(`no chip for ${agentId}`)
  return found
}

function updates(wrapper: ReturnType<typeof mount>): unknown[] {
  return (wrapper.emitted('update:modelValue') ?? []).map((args) => args[0])
}

describe('resourceAgentBar', () => {
  it('says how much of the list Tuff runs, and lists each agent with its row count', () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: AGENTS, enabled: 3, total: 12, modelValue: null }
    })

    expect(wrapper.find('.ResourceAgentBar-Summary').text()).toBe(
      'settings.resources.enabledLabel 3 / 12'
    )
    const chips = wrapper.findAll('button.tx-bui-filter-chips__chip')
    expect(chips.map((candidate) => candidate.text())).toEqual(['Claude Code8', 'Codex5', 'Pi2'])
    expect(wrapper.find('[role="toolbar"]').attributes('aria-label')).toBe(
      'settings.resources.agentFilterLabel'
    )
  })

  it('filters to an agent on the first click and shows everything on the second', async () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: AGENTS, enabled: 3, total: 12, modelValue: null }
    })

    await chip(wrapper, 'codex').trigger('click')
    // Exactly one writer: the chips' own `update:modelValue` must not echo a second event.
    expect(updates(wrapper)).toEqual(['codex'])

    await wrapper.setProps({ modelValue: 'codex' })
    expect(chip(wrapper, 'codex').attributes('aria-pressed')).toBe('true')

    await chip(wrapper, 'codex').trigger('click')
    expect(updates(wrapper)).toEqual(['codex', null])
  })

  it('moves the filter straight to another agent without clearing in between', async () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: AGENTS, enabled: 3, total: 12, modelValue: 'codex' }
    })

    await chip(wrapper, 'pi').trigger('click')
    expect(updates(wrapper)).toEqual(['pi'])
  })

  /**
   * On a real click the browser runs a microtask checkpoint between listeners, so Vue can re-render
   * after the capture listener and before the chip's own; the chip then sees itself inactive and
   * reports a selection. That report must go nowhere, or the second click would select the agent
   * straight back instead of clearing it.
   */
  it('never forwards the chips’ own selection event, so it cannot undo a clear', async () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: AGENTS, enabled: 3, total: 12, modelValue: null }
    })

    await chip(wrapper, 'pi').trigger('click')
    const chips = wrapper.findComponent(TxFilterChips)
    // The chips did report it…
    expect(chips.emitted('update:modelValue')?.map((args) => args[0])).toEqual(['pi'])
    // …and the bar emitted its own decision once, not a forwarded copy.
    expect(updates(wrapper)).toEqual(['pi'])
  })

  it('drops a filter whose agent a rescan no longer finds', async () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: AGENTS, enabled: 3, total: 12, modelValue: 'pi' }
    })

    await wrapper.setProps({ agents: AGENTS.slice(0, 2) })
    expect(updates(wrapper)).toEqual([null])
  })

  it('ignores clicks while disabled', async () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: AGENTS, enabled: 0, total: 12, modelValue: null, disabled: true }
    })

    await chip(wrapper, 'codex').trigger('click')
    expect(updates(wrapper)).toEqual([])
  })

  it('shows only the summary when no agent on this machine holds a row', () => {
    const wrapper = mount(ResourceAgentBar, {
      props: { agents: [], enabled: 1, total: 1, modelValue: null }
    })

    expect(wrapper.find('[role="toolbar"]').exists()).toBe(false)
    expect(wrapper.find('.ResourceAgentBar-Summary').text()).toBe(
      'settings.resources.enabledLabel 1 / 1'
    )
  })

  it('draws its loading skeleton in the chip row’s own box, hidden from assistive technology', () => {
    const wrapper = mount(ResourceAgentBar, { props: { placeholder: true, placeholderChips: 4 } })

    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(false)
    expect(wrapper.findAll('.ResourceAgentBar-ChipsPlaceholder .tx-skeleton')).toHaveLength(4)
    expect(wrapper.text()).toBe('')
  })
})
