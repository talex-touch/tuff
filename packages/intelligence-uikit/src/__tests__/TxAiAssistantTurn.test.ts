import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxAiAssistantTurnProps, TxAiSegment, TxAiWidgetSandbox } from '../types'
import { CHART_RESULT_PREFIX, FORM_RESULT_PREFIX, WIDGET_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'
import TxAiAssistantTurn from '../components/conversation/TxAiAssistantTurn.vue'

// Canvas is the only external rendering boundary; tool cards and action controls are real.
vi.mock('echarts', () => ({ init: () => ({ setOption() {}, resize() {}, dispose() {} }) }))
vi.mock('@talex-touch/tuffex/thinking-orb', () => ({ TxThinkingOrb: { name: 'TxThinkingOrb', props: ['label'], template: '<span class="mock-thinking-orb">{{ label }}</span>' } }))
enableAutoUnmount(afterEach)

function tool(overrides: Partial<AiToolCallPart> = {}): AiToolCallPart {
  return { type: 'tool-call', id: 'call-1', name: 'lookup', status: 'done', output: 'Lookup result', ...overrides }
}
function segment(part: AiToolCallPart): TxAiSegment {
  return { kind: 'tool', id: part.id, part }
}
function mountTurn(props: Partial<TxAiAssistantTurnProps> = {}, slots = {}) {
  return mount(TxAiAssistantTurn, { props: { segments: [], motion: 'none', ...props }, slots })
}
const chartSpec = { type: 'bar', title: 'Quarterly revenue', labels: ['Q1'], series: [{ name: 'Revenue', values: [12] }] }
const formSpec = { title: 'Choose a destination', fields: [{ key: 'city', label: 'City', type: 'text' }] }
const widgetSpec = { title: 'Weather panel', source: 'host-sandbox-source' }
const sandbox: TxAiWidgetSandbox = source => ({
  status: ref('ready'), failure: ref(null), height: ref(120), srcdoc: ref(`<p>${source.value}</p>`),
})

describe('txAiAssistantTurn tool registry', () => {
  it.each([
    { name: 'named chart', toolName: 'tuff_render_chart', prefix: CHART_RESULT_PREFIX, spec: chartSpec, selector: '.tx-ai-tool-chart' },
    { name: 'prefixed chart', toolName: 'custom-chart', prefix: CHART_RESULT_PREFIX, spec: chartSpec, selector: '.tx-ai-tool-chart' },
    { name: 'named form', toolName: 'tuff_render_form', prefix: FORM_RESULT_PREFIX, spec: formSpec, selector: '.tx-ai-tool-form' },
    { name: 'prefixed form', toolName: 'custom-form', prefix: FORM_RESULT_PREFIX, spec: formSpec, selector: '.tx-ai-tool-form' },
    { name: 'named widget', toolName: 'tuff_render_widget', prefix: WIDGET_RESULT_PREFIX, spec: widgetSpec, selector: '.tx-ai-tool-widget' },
    { name: 'prefixed widget', toolName: 'custom-widget', prefix: WIDGET_RESULT_PREFIX, spec: widgetSpec, selector: '.tx-ai-tool-widget' },
  ])('renders the $name face instead of the generic card', async ({ toolName, prefix, spec, selector }) => {
    const part = tool({ name: toolName, output: prefix + JSON.stringify(spec) })
    const wrapper = mountTurn({ segments: [segment(part)], widgetSandbox: sandbox })
    await flushPromises()
    expect(wrapper.find(selector).exists()).toBe(true)
    expect(wrapper.find('.tx-tool-call-card').exists()).toBe(false)
    if (selector === '.tx-ai-tool-form') expect(wrapper.get('.tx-ai-tool-form-Label').text()).toBe('City')
    if (selector === '.tx-ai-tool-widget') expect(wrapper.get('iframe').attributes('srcdoc')).toBe('<p>host-sandbox-source</p>')
    if (selector === '.tx-ai-tool-chart') expect(wrapper.get('.tx-ai-tool-chart-Chip').text()).toBe('Revenue')
  })

  it.each([
    { name: 'unmatched tool', part: tool() },
    { name: 'unfinished result', part: tool({ name: 'tuff_render_form', status: 'running', output: FORM_RESULT_PREFIX + JSON.stringify(formSpec) }) },
    { name: 'malformed envelope', part: tool({ name: 'tuff_render_chart', output: `${CHART_RESULT_PREFIX  }{` }) },
    { name: 'invalid face spec', part: tool({ output: `${FORM_RESULT_PREFIX  }{"title":"No fields"}` }) },
    { name: 'widget without sandbox', part: tool({ name: 'tuff_render_widget', output: WIDGET_RESULT_PREFIX + JSON.stringify(widgetSpec) }) },
  ])('keeps $name on the generic tool card', ({ part }) => {
    const wrapper = mountTurn({ segments: [segment(part)] })
    expect(wrapper.get('.tx-tool-call-card__name').text()).toBe(part.name)
    expect(wrapper.find('.tx-ai-turn__face').exists()).toBe(false)
  })

  it('gives the host tool slot precedence, and lets its predicate delegate other calls back to the registry', async () => {
    const form = tool({ id: 'form', name: 'tuff_render_form', output: FORM_RESULT_PREFIX + JSON.stringify(formSpec) })
    const generic = tool({ id: 'generic' })
    const wrapper = mountTurn({ segments: [segment(form), segment(generic)] }, {
      tool: ({ segment: item }: { segment: Extract<TxAiSegment, { kind: 'tool' }> }) => h('p', { class: 'host-tool' }, `${item.id}: ${item.part.output}`),
    })
    expect(wrapper.findAll('.host-tool').map(item => item.text())).toEqual([`form: ${form.output}`, 'generic: Lookup result'])
    expect(wrapper.find('.tx-ai-tool-form').exists()).toBe(false)
    expect(wrapper.find('.tx-tool-call-card').exists()).toBe(false)

    await wrapper.setProps({ hasToolFace: (part: AiToolCallPart) => part.id === generic.id })
    expect(wrapper.get('.host-tool').text()).toBe('generic: Lookup result')
    expect(wrapper.get('.tx-ai-tool-form-Title').text()).toBe('Choose a destination')
  })

  it('restores host drafts, emits edits and one submission with their originating part, and exposes the payload action', async () => {
    const part = tool({ name: 'tuff_render_form', output: FORM_RESULT_PREFIX + JSON.stringify(formSpec) })
    const wrapper = mountTurn({
      segments: [segment(part)], formDrafts: new Map([[part.id, { city: 'Kyoto' }]]),
      showToolPayload: true, payloadLabel: 'Inspect source',
    })
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Kyoto')
    await wrapper.get('input').setValue('Oslo')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('.tx-ai-turn__payload').trigger('click')
    expect(wrapper.emitted('form-change')).toEqual([[part, { city: 'Oslo' }]])
    expect(wrapper.emitted('form-submit')).toEqual([[part, { city: 'Oslo' }]])
    expect(wrapper.emitted('payload')).toEqual([[part]])
    expect(wrapper.get('.tx-ai-turn__payload').text()).toBe('Inspect source')
  })

  it.each(['part', 'host'] as const)('does not resubmit a form marked answered by the %s', async (owner) => {
    const part = tool({ name: 'tuff_render_form', output: FORM_RESULT_PREFIX + JSON.stringify(formSpec), submitted: owner === 'part' })
    const wrapper = mountTurn({ segments: [segment(part)], submittedForms: new Set(owner === 'host' ? [part.id] : []) })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('form-submit')).toBeUndefined()
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
  })
})

describe('txAiAssistantTurn presentation and actions', () => {
  it('shows host waiting text independently of streaming, and only shows compaction during streaming', async () => {
    const wrapper = mountTurn({ waiting: true, streaming: false, compacting: true, thinkingVerb: 'Searching', thinkingLabel: 'Finding sources', compactingLabel: 'Summarizing context' })
    expect(wrapper.get('.tx-ai-turn__thinking').text()).toContain('Finding sources')
    expect(wrapper.find('.tx-ai-turn__compacting').exists()).toBe(false)
    await wrapper.setProps({ streaming: true, waiting: false })
    expect(wrapper.find('.tx-ai-turn__thinking').exists()).toBe(false)
    expect(wrapper.get('.tx-ai-turn__compacting').text()).toBe('Summarizing context')
    await wrapper.setProps({ compacting: false })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('renders host footer/error props and forwards user actions without inventing payloads', async () => {
    const wrapper = mountTurn({
      footer: { content: 'Copy **exact** answer', resting: false, regenerable: true, branchable: true, labels: { copy: 'Copy answer', regenerate: 'Try again', speak: 'Read answer', branch: 'Fork answer' } },
      error: { title: 'Host-resolved failure', detail: 'Host detail', retryable: true, retryLabel: 'Retry request' },
    })
    expect(wrapper.get('[role="alert"]').text()).toContain('Host-resolved failure')
    expect(wrapper.get('[role="alert"]').text()).toContain('Host detail')
    for (const label of ['Copy answer', 'Try again', 'Read answer', 'Fork answer']) await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
    await wrapper.get('.tx-ai-error-block-Action').trigger('click')
    expect(wrapper.emitted('copy')).toEqual([['Copy **exact** answer']])
    for (const event of ['regenerate', 'speak', 'branch', 'retry']) expect(wrapper.emitted(event)).toEqual([[]])
    await wrapper.setProps({ error: { title: 'Host-resolved failure', actionLabel: 'Recover account', retryable: true } })
    await wrapper.get('.tx-ai-error-block-Action').trigger('click')
    expect(wrapper.emitted('error-action')).toEqual([[]])
    expect(wrapper.emitted('retry')).toEqual([[]])
  })

  it('lets error/footer slots replace built-ins and retains the default extension slot', () => {
    const wrapper = mountTurn({ error: { title: 'Hidden error' }, footer: { content: 'Hidden answer' } }, {
      error: '<aside>Host recovery</aside>', footer: '<nav>Host actions</nav>', default: '<small>Host extension</small>',
    })
    expect(wrapper.text()).toBe('Host recoveryHost actionsHost extension')
    expect(wrapper.find('.tx-ai-error-block').exists()).toBe(false)
    expect(wrapper.find('.tx-ai-turn-footer').exists()).toBe(false)
  })

  it('preserves independent open and closed choices after a streaming rollback remounts and realigns segments', async () => {
    const reasoning = (id: string, status: 'active' | 'done'): TxAiSegment => ({ kind: 'reasoning', id, step: { id, kind: 'thinking', title: id, body: 'Reasoning detail', status } })
    const openThought = reasoning('open-thought', 'done')
    const closedThought = reasoning('closed-thought', 'active')
    const openTool = segment(tool({ id: 'open-tool', name: 'open-tool' }))
    const closedTool = segment(tool({ id: 'closed-tool', name: 'closed-tool', status: 'running' }))
    const wrapper = mountTurn({ streaming: true, segments: [openThought, closedThought, openTool, closedTool] })
    const header = (text: string) => wrapper.findAll('button[aria-expanded]').find(button => button.text().includes(text))!
    for (const id of ['open-thought', 'closed-thought', 'open-tool', 'closed-tool']) await header(id).trigger('click')
    const expected = { 'open-thought': 'true', 'closed-thought': 'false', 'open-tool': 'true', 'closed-tool': 'false' }
    for (const [id, open] of Object.entries(expected)) expect(header(id).attributes('aria-expanded')).toBe(open)
    // A rollback temporarily withdraws segments before a delta rebuilds the ordered trail.
    await wrapper.setProps({ segments: [{ kind: 'text', id: 'delta', text: 'New answer', streaming: true }] })
    await wrapper.setProps({ segments: [closedTool, reasoning('closed-thought', 'active'), openTool, reasoning('open-thought', 'done')] })
    for (const [id, open] of Object.entries(expected)) expect(header(id).attributes('aria-expanded')).toBe(open)
  })
})
