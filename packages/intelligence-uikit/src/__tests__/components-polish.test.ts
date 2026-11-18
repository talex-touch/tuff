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

  it('preserves local draft, view, and hidden series on identical spec re-parses and resets when spec content changes', async () => {
    const wrapper = mount(TxAiToolChart, {
      props: {
        spec: {
          type: 'bar',
          title: 'Initial',
          labels: ['Q1'],
          series: [
            { name: 'Sales', values: [10] },
            { name: 'Costs', values: [4] },
          ],
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

    const seriesChips = wrapper.findAll('.tx-ai-tool-chart-Chip')
    await seriesChips[1].trigger('click')
    expect(seriesChips[1].classes()).toContain('is-off')

    const viewButtons = wrapper.findAll('.tx-ai-tool-chart-View')
    await viewButtons[0].trigger('click')
    expect(viewButtons[0].classes()).toContain('is-active')

    await wrapper.get('.tx-ai-tool-chart-Edit').trigger('click')
    const tableInputs = wrapper.findAll('tbody input')
    expect(tableInputs[0].attributes('aria-label')).toContain('Label')
    expect(tableInputs[1].attributes('aria-label')).toContain('Sales')

    await tableInputs[0].setValue('Edited')

    // Re-parsed object with identical content must keep local workbench state intact.
    await wrapper.setProps({
      spec: {
        type: 'bar',
        title: 'Initial',
        labels: ['Q1'],
        series: [
          { name: 'Sales', values: [10] },
          { name: 'Costs', values: [4] },
        ],
      },
    })
    expect((wrapper.findAll('tbody input')[0].element as HTMLInputElement).value).toBe('Edited')
    expect(wrapper.findAll('.tx-ai-tool-chart-Chip')[1].classes()).toContain('is-off')
    expect(wrapper.findAll('.tx-ai-tool-chart-View')[0].classes()).toContain('is-active')

    // Genuine content change resets draft, view, and hidden series.
    await wrapper.setProps({
      spec: {
        type: 'line',
        title: 'Next',
        labels: ['Q2'],
        series: [
          { name: 'Users', values: [25] },
          { name: 'Active', values: [18] },
        ],
      },
    })
    expect((wrapper.findAll('tbody input')[0].element as HTMLInputElement).value).toBe('Q2')
    expect(wrapper.findAll('.tx-ai-tool-chart-Chip')[1].classes()).not.toContain('is-off')
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

    // Message rail resting bar must maintain >= 3:1 WCAG 1.4.11 contrast across light and dark themes.
    const railVue = fs.readFileSync(path.resolve(__dirname, '../components/conversation/TxAiMessageRail.vue'), 'utf8')
    expect(railVue).toContain('var(--tx-text-color-regular, #475569)')
    expect(railVue).toContain('opacity: 0.76;')

    const toLinear = (c: number) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const parseHex = (hex: string) => {
      const v = Number.parseInt(hex.slice(1), 16)
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const
    }
    const luminance = ([r, g, b]: readonly [number, number, number]) =>
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    const contrastAtAlpha = (fgHex: string, bgHex: string, alpha: number) => {
      const fg = parseHex(fgHex)
      const bg = parseHex(bgHex)
      const blended: [number, number, number] = [
        fg[0] * alpha + bg[0] * (1 - alpha),
        fg[1] * alpha + bg[1] * (1 - alpha),
        fg[2] * alpha + bg[2] * (1 - alpha),
      ]
      const l1 = luminance(blended)
      const l2 = luminance(bg)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }

    expect(contrastAtAlpha('#606266', '#ffffff', 0.76)).toBeGreaterThanOrEqual(3)
    expect(contrastAtAlpha('#606266', '#f2f3f5', 0.76)).toBeGreaterThanOrEqual(3)
    expect(contrastAtAlpha('#475569', '#ffffff', 0.76)).toBeGreaterThanOrEqual(3)
    expect(contrastAtAlpha('#cfd3dc', '#141414', 0.76)).toBeGreaterThanOrEqual(3)
  })
})
