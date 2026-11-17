import fs from 'node:fs'
import path from 'node:path'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TxAiCodeBlock from '../components/content/TxAiCodeBlock.vue'
import TxAiRichBlock from '../components/content/TxAiRichBlock.vue'
import TxAiToolCall from '../components/tool-agent/TxAiToolCall.vue'
import TxAiToolChart from '../components/tool-agent/TxAiToolChart.vue'
import TxAiToolForm from '../components/tool-agent/TxAiToolForm.vue'
import TxAiToolWidget from '../components/tool-agent/TxAiToolWidget.vue'

describe('uikit leaf polish, accessibility & design-rule contracts', () => {
  it('uses English defaults and supports localized labels in TxAiRichBlock & TxAiCodeBlock', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const rich = mount(TxAiRichBlock, {
      props: {
        block: { type: 'card', content: 'Step 1', status: 'running', meta: { kind: 'planning' } },
      },
    })
    expect(rich.text()).toContain('Planning')
    expect(rich.text()).not.toContain('规划中')

    await rich.setProps({
      block: { type: 'card', content: 'Step 1', status: 'running', meta: { kind: 'thought' } },
      labels: { reasoning: 'Chain of thought' },
    })
    expect(rich.text()).toContain('Chain of thought')

    const code = mount(TxAiCodeBlock, {
      props: { code: 'const x = 1', language: 'ts', copyLabel: 'Copy snippet', copiedLabel: 'Done' },
    })
    const copyBtn = code.get('.tx-ai-code-block__copy')
    await copyBtn.trigger('click')
    expect(copyBtn.text()).toBe('Copy snippet')

    await copyBtn.trigger('click')
    expect(copyBtn.text()).toBe('Done')
    code.unmount()
  })

  it('delegates TxAiToolCall to TxToolCallCard when toolCall part is passed', async () => {
    const richCall = mount(TxAiToolCall, {
      props: {
        showRetry: true,
        toolCall: {
          type: 'tool-call',
          id: 'tc-1',
          name: 'search_files',
          status: 'error',
          error: 'Permission denied',
        },
      },
    })

    expect(richCall.find('.tx-ai-tool-call--card').exists()).toBe(true)
    expect(richCall.text()).toContain('search_files')
    await richCall.get('button[class*="retry"], .tx-tool-call-card__retry').trigger('click')
    expect(richCall.emitted('retry')?.[0]).toEqual(['tc-1'])

    const compact = mount(TxAiToolCall, {
      props: { name: 'legacy_tool', status: 'running', description: 'Scanning' },
    })
    expect(compact.find('.tx-ai-loading-hint').exists()).toBe(true)
  })

  it('scopes label IDs across concurrent TxAiToolForm instances and sets error ARIA attrs', async () => {
    const wrapper = mount({
      components: { TxAiToolForm },
      template: `
        <div>
          <TxAiToolForm :spec="spec" />
          <TxAiToolForm :spec="spec" />
        </div>
      `,
      data() {
        return {
          spec: {
            fields: [{ key: 'email', label: 'Email', type: 'text', required: true }],
          },
        }
      },
    })

    const inputs = wrapper.findAll('input[type="text"]')
    const id1 = inputs[0].attributes('aria-labelledby')
    const id2 = inputs[1].attributes('aria-labelledby')
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)

    await wrapper.find('form').trigger('submit')
    expect(inputs[0].attributes('aria-invalid')).toBe('true')
    const describedBy = inputs[0].attributes('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(wrapper.get(`#${describedBy}`).attributes('role')).toBe('alert')
  })

  it('resets local draft when TxAiToolChart spec changes and labels edit inputs', async () => {
    const wrapper = mount(TxAiToolChart, {
      props: {
        spec: {
          type: 'bar',
          title: 'Initial',
          labels: ['Q1'],
          series: [{ name: 'Sales', values: [10] }],
        },
      },
      global: {
        stubs: {
          Teleport: true,
          TxFlipOverlay: {
            props: ['modelValue'],
            template: '<div v-if="modelValue"><slot :close="() => {}" /></div>',
          },
        },
      },
    })

    await wrapper.get('.tx-ai-tool-chart-Edit').trigger('click')
    const tableInputs = wrapper.findAll('tbody input')
    expect(tableInputs[0].attributes('aria-label')).toContain('Label')
    expect(tableInputs[1].attributes('aria-label')).toContain('Sales')

    await tableInputs[0].setValue('Edited')
    await wrapper.setProps({
      spec: {
        type: 'line',
        title: 'Next',
        labels: ['Q2'],
        series: [{ name: 'Users', values: [25] }],
      },
    })
    expect((wrapper.findAll('tbody input')[0].element as HTMLInputElement).value).toBe('Q2')
  })

  it('marks TxAiToolWidget aria-busy while loading and renders skeleton placeholder', () => {
    const sandbox = () => ({
      status: ref<'loading' | 'ready' | 'failed'>('loading'),
      failure: ref(null),
      height: ref(240),
      srcdoc: ref(''),
    })
    const wrapper = mount(TxAiToolWidget, {
      props: { source: '<div>hi</div>', sandbox },
    })

    expect(wrapper.get('.tx-ai-tool-widget').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('.tx-ai-tool-widget-Loading').exists()).toBe(true)
  })

  it('enforces modular TX CSS imports and CSS motion/focus design contracts', () => {
    const scss = fs.readFileSync(path.resolve(__dirname, '../style/index.scss'), 'utf8')
    const footerVue = fs.readFileSync(path.resolve(__dirname, '../components/conversation/TxAiTurnFooter.vue'), 'utf8')

    const forbiddenFullCss = ['@talex-touch/tuffex', 'style.css'].join('/')
    expect(scss).not.toContain(forbiddenFullCss)
    expect(scss).not.toMatch(/from\s+['"]@talex-touch\/tuffex['"]/)

    // Design rule: never transition border-color, background, or color on hover controls.
    expect(scss).not.toContain('border-color 180ms ease')
    expect(footerVue).not.toContain('transition: color 0.15s ease')

    // Focus visibility must never be silently suppressed with outline: none on clickable thought headers.
    expect(scss).toContain('.tx-ai-rich-block__thought-header')
    expect(scss).toContain('&:focus-visible')
    expect(scss).not.toMatch(/\.tx-ai-rich-block__thought-header[\s\S]*?outline:\s*none/)
  })
})
