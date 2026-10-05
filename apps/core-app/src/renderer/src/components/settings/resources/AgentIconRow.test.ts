// @vitest-environment jsdom
import type { AgentRef } from './agent-registry'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

/** The tooltip anchor reads the reduced-motion preference on mount; jsdom has no media queries. */
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

/**
 * jsdom lays nothing out and has no ResizeObserver. The strip's width is set on its element by the
 * test, and `resize()` delivers the observation the browser would.
 */
const observed = vi.hoisted(() => ({ callbacks: [] as Array<() => void> }))
vi.hoisted(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: (entries: unknown[], observer: unknown) => void) {
        observed.callbacks.push(() => callback([], this))
      }

      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
})

async function resize(element: Element, width: number): Promise<void> {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
  for (const callback of observed.callbacks) callback()
  await nextTick()
}

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    locale: ref('en-US')
  })
}))

import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import AgentIconRow from './AgentIconRow.vue'

const AGENTS: AgentRef[] = [
  { agentId: 'claude', label: 'Claude Code' },
  { agentId: 'codex', label: 'Codex' },
  { agentId: 'pi', label: 'Pi' }
]

function marks(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.AgentIconRow-Item').map((item) => ({
    agentId: item.attributes('data-agent-id'),
    configured: item.attributes('data-configured'),
    dim: item.classes().includes('is-dim')
  }))
}

describe('agentIconRow', () => {
  it('draws every agent of the page in order, lit where configured and dimmed elsewhere', () => {
    const wrapper = mount(AgentIconRow, {
      props: { agents: AGENTS, configured: ['codex', 'claude'] }
    })

    expect(marks(wrapper)).toEqual([
      { agentId: 'claude', configured: 'true', dim: false },
      { agentId: 'codex', configured: 'true', dim: false },
      { agentId: 'pi', configured: 'false', dim: true }
    ])
  })

  it('explains each mark on hover in the words of its state', () => {
    const wrapper = mount(AgentIconRow, { props: { agents: AGENTS, configured: ['pi'] } })

    const contents = wrapper.findAllComponents(TxTooltip).map((tooltip) => tooltip.props('content'))
    expect(contents).toEqual([
      'settings.resources.agentNotConfigured:{"agent":"Claude Code"}',
      'settings.resources.agentNotConfigured:{"agent":"Codex"}',
      'settings.resources.agentConfigured:{"agent":"Pi"}'
    ])
  })

  it('names the configured agents in one sentence for assistive technology, marks hidden', () => {
    const wrapper = mount(AgentIconRow, {
      props: { agents: AGENTS, configured: ['claude', 'pi'] }
    })

    expect(wrapper.find('.AgentIconRow-Sr').text()).toBe(
      'settings.resources.configuredBy:{"agents":"Claude Code and Pi"}'
    )
    expect(wrapper.find('.AgentIconRow-Icons').attributes('aria-hidden')).toBe('true')
  })

  it('says so when no agent configures the item, as for a hand-entered server', () => {
    const wrapper = mount(AgentIconRow, { props: { agents: AGENTS, configured: [] } })

    expect(wrapper.find('.AgentIconRow-Sr').text()).toBe('settings.resources.configuredByNone')
    expect(marks(wrapper).every((mark) => mark.dim)).toBe(true)
  })

  it('keeps a holder the page did not list instead of dropping it', () => {
    const wrapper = mount(AgentIconRow, {
      props: { agents: AGENTS.slice(0, 1), configured: ['claude', 'kiro'] }
    })

    expect(marks(wrapper).map((mark) => mark.agentId)).toEqual(['claude', 'kiro'])
    expect(wrapper.find('.AgentIconRow-Sr').text()).toContain('Claude Code and Kiro')
  })

  it('is never a control: nothing focusable and no event to listen for', () => {
    const wrapper = mount(AgentIconRow, { props: { agents: AGENTS, configured: ['codex'] } })

    expect(wrapper.findAll('button, a, input, select, textarea, [tabindex]')).toHaveLength(0)
    expect((AgentIconRow as { emits?: unknown }).emits).toBeUndefined()
  })

  it('draws a brand glyph where the set has one and a monogram badge elsewhere', () => {
    const wrapper = mount(AgentIconRow, {
      props: {
        agents: [
          { agentId: 'codex', label: 'Codex' },
          { agentId: 'kilocode', label: 'Kilo Code' }
        ],
        configured: ['codex', 'kilocode']
      }
    })

    const glyphs = wrapper.findAll('.AgentGlyph')
    expect(glyphs[0]!.find('i').classes()).toContain('i-simple-icons-openai')
    expect(glyphs[1]!.find('.AgentGlyph-Monogram').text()).toBe('KC')
  })
})

describe('agentIconRow: a strip too narrow for every mark', () => {
  /** The eleven agents of one machine's skills page (2026-10-03), in the bar's order. */
  const ELEVEN: AgentRef[] = [
    'Pi',
    'Claude Code',
    'Factory',
    'Kilo Code',
    'Kiro',
    'Oh My Pi',
    'CodeBuddy',
    'Qoder',
    'Reasonix',
    'OpenCode',
    'Gemini CLI'
  ].map((label, index) => ({
    agentId: [
      'pi',
      'claude',
      'factory',
      'kilocode',
      'kiro',
      'oh-my-pi',
      'codebuddy',
      'qoder',
      'reasonix',
      'opencode',
      'gemini'
    ][index]!,
    label
  }))

  it('asks the row for room for every mark, whatever it shows', () => {
    const wrapper = mount(AgentIconRow, { props: { agents: ELEVEN, configured: ['pi'] } })

    // 11 marks of 16px with 4px between them.
    expect(wrapper.attributes('style')).toContain('--agent-strip-full: 216px')
    expect(wrapper.find('.AgentIconRow-Sizer').exists()).toBe(true)
  })

  it('shows every mark while they fit', async () => {
    const wrapper = mount(AgentIconRow, { props: { agents: ELEVEN, configured: ['pi'] } })
    await resize(wrapper.element, 216)

    expect(marks(wrapper)).toHaveLength(11)
    expect(wrapper.find('.AgentIconRow-More').exists()).toBe(false)
  })

  it('folds the marks that do not fit into +N, keeping the lit ones in view', async () => {
    const wrapper = mount(AgentIconRow, {
      props: { agents: ELEVEN, configured: ['pi', 'gemini'] }
    })
    await resize(wrapper.element, 122)

    expect(marks(wrapper).map((mark) => mark.agentId)).toEqual([
      'pi',
      'claude',
      'factory',
      'kilocode',
      'gemini'
    ])
    const more = wrapper.find('.AgentIconRow-More')
    expect(more.text()).toBe('+6')
    expect(more.attributes('data-folded')).toBe('kiro oh-my-pi codebuddy qoder reasonix opencode')
    // The sentence for assistive technology still names every holder.
    expect(wrapper.find('.AgentIconRow-Sr').text()).toContain('Pi and Gemini CLI')
  })

  it('lists the folded agents and their state when the pointer rests on +N', async () => {
    const wrapper = mount(AgentIconRow, {
      props: { agents: ELEVEN, configured: ['pi', 'gemini'] },
      attachTo: document.body
    })
    await resize(wrapper.element, 122)

    const moreTooltip = wrapper
      .findAllComponents(TxTooltip)
      .find((tooltip) => tooltip.find('.AgentIconRow-More').exists())!
    await moreTooltip.find('.tx-tooltip__reference').trigger('mouseenter')
    // The tooltip opens after its own delay; wait for the list rather than for a fixed time, which
    // a loaded batch run can outlast.
    await vi.waitFor(
      () =>
        expect(document.querySelectorAll('.AgentIconRow-FoldedList li').length).toBeGreaterThan(0),
      { timeout: 5000, interval: 20 }
    )
    await flushPromises()

    const items = [...document.querySelectorAll('.AgentIconRow-FoldedList li')].map((item) =>
      item.textContent?.trim()
    )
    expect(items).toEqual([
      'settings.resources.agentNotConfigured:{"agent":"Kiro"}',
      'settings.resources.agentNotConfigured:{"agent":"Oh My Pi"}',
      'settings.resources.agentNotConfigured:{"agent":"CodeBuddy"}',
      'settings.resources.agentNotConfigured:{"agent":"Qoder"}',
      'settings.resources.agentNotConfigured:{"agent":"Reasonix"}',
      'settings.resources.agentNotConfigured:{"agent":"OpenCode"}'
    ])
    wrapper.unmount()
  })

  it('unfolds again when the row widens', async () => {
    const wrapper = mount(AgentIconRow, { props: { agents: ELEVEN, configured: ['pi'] } })
    await resize(wrapper.element, 82)
    expect(wrapper.find('.AgentIconRow-More').text()).toBe('+8')

    await resize(wrapper.element, 400)
    expect(marks(wrapper)).toHaveLength(11)
    expect(wrapper.find('.AgentIconRow-More').exists()).toBe(false)
  })
})
