// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from '~/modules/lang/en-US.json'
import type { TdsLintIssue } from '~/modules/tds-lint'
import { computeTdsContentDigest } from '~/modules/tds-lint'
import TdsLintPopover from './TdsLintPopover.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': enUS
  }
})

const TxPopoverStub = {
  name: 'TxPopover',
  props: ['modelValue'],
  template: '<div><slot name="reference" /><div v-if="modelValue"><slot /></div></div>'
}

const errorIssue: TdsLintIssue = {
  ruleId: 'remote-asset-url',
  phase: 'static',
  severity: 'error',
  category: 'sandbox',
  message: 'External remote asset URL will fail offline.',
  fixHint: 'Inline SVG assets instead of remote URLs.',
  line: 3,
  column: 10,
  snippet: 'https://cdn.example.com/a.png'
}

const warningIssue: TdsLintIssue = {
  ruleId: 'viewport-unit-canvas',
  phase: 'static',
  severity: 'warning',
  category: 'layout',
  message: 'Viewport unit 100vh overflows fixed frames.',
  fixHint: 'Replace 100vh with 100%.',
  line: 5,
  column: 4
}

describe('TdsLintPopover', () => {
  it('defaults auto-fix opt-in toggle to false with accessible switch semantics and v-model updates', async () => {
    const wrapper = mount(TdsLintPopover, {
      props: {
        issues: [errorIssue],
        aiActionsEnabled: true,
        contentDigest: computeTdsContentDigest('<img src="https://cdn.example.com/a.png" />'),
        open: true
      },
      global: {
        plugins: [i18n],
        stubs: { TxPopover: TxPopoverStub }
      }
    })

    const toggle = wrapper.get('[data-testid="tds-lint-autofix-toggle"]')
    expect(toggle.attributes('role')).toBe('switch')
    expect(toggle.attributes('aria-checked')).toBe('false')

    await toggle.trigger('click')
    expect(wrapper.emitted('update:autoFix')?.[0]).toEqual([true])
    expect(wrapper.emitted('update:autoFixOnError')?.[0]).toEqual([true])
    expect(toggle.attributes('aria-checked')).toBe('true')
  })

  it('hides the auto-fix switch and never triggers when contentDigest is empty or aiActionsEnabled is false', async () => {
    const missingDigestWrapper = mount(TdsLintPopover, {
      props: {
        issues: [errorIssue],
        aiActionsEnabled: true,
        autoFixOnError: true,
        contentDigest: '   ',
        open: true
      },
      global: {
        plugins: [i18n],
        stubs: { TxPopover: TxPopoverStub }
      }
    })

    expect(missingDigestWrapper.find('[data-testid="tds-lint-autofix-toggle"]').exists()).toBe(
      false
    )
    expect(missingDigestWrapper.emitted('auto-fix')).toBeUndefined()
    expect(missingDigestWrapper.emitted('send-to-ai')).toBeUndefined()

    const disabledAiWrapper = mount(TdsLintPopover, {
      props: {
        issues: [errorIssue],
        aiActionsEnabled: false,
        autoFixOnError: true,
        contentDigest: computeTdsContentDigest('<img src="https://cdn.example.com/a.png" />'),
        open: true
      },
      global: {
        plugins: [i18n],
        stubs: { TxPopover: TxPopoverStub }
      }
    })

    expect(disabledAiWrapper.find('[data-testid="tds-lint-autofix-toggle"]').exists()).toBe(false)
    expect(disabledAiWrapper.emitted('auto-fix')).toBeUndefined()
    expect(disabledAiWrapper.emitted('send-to-ai')).toBeUndefined()
  })

  it('triggers bounded 1-pass auto-fix only on error issues and never loops on identical digest or warnings', async () => {
    const digestV1 = computeTdsContentDigest('<img src="https://cdn.example.com/a.png" />')
    const wrapper = mount(TdsLintPopover, {
      props: {
        issues: [warningIssue],
        aiActionsEnabled: true,
        autoFixOnError: true,
        contentDigest: digestV1,
        displayPath: 'Landing',
        open: true
      },
      global: {
        plugins: [i18n],
        stubs: { TxPopover: TxPopoverStub }
      }
    })

    // Warning-only never fires auto-fix
    expect(wrapper.emitted('auto-fix')).toBeUndefined()
    expect(wrapper.emitted('send-to-ai')).toBeUndefined()

    // Error appears on digestV1 -> fires once
    await wrapper.setProps({ issues: [errorIssue, warningIssue] })
    await nextTick()
    expect(wrapper.emitted('auto-fix')).toHaveLength(1)
    expect(wrapper.emitted('send-to-ai')).toHaveLength(1)
    expect(wrapper.emitted('send-to-ai')?.[0]?.[0]).toMatchObject({
      autoFix: true,
      contentDigest: digestV1
    })

    // Re-emitting issues for the exact same digestV1 does NOT loop
    await wrapper.setProps({ issues: [errorIssue] })
    await nextTick()
    expect(wrapper.emitted('auto-fix')).toHaveLength(1)
    expect(wrapper.emitted('send-to-ai')).toHaveLength(1)

    // New digestV2 with error triggers 1 new pass
    const digestV2 = computeTdsContentDigest('<img src="https://cdn.example.com/b.png" />')
    await wrapper.setProps({ contentDigest: digestV2, issues: [errorIssue] })
    await nextTick()
    expect(wrapper.emitted('auto-fix')).toHaveLength(2)
    expect(wrapper.emitted('send-to-ai')).toHaveLength(2)
  })

  it('enforces TDS CSS rules: zero raw colors and zero hover color transitions', () => {
    const sfc = readFileSync(resolve(__dirname, './TdsLintPopover.vue'), 'utf8')
    const styleMatch = /<style[^>]*>([\s\S]*?)<\/style>/.exec(sfc)
    expect(styleMatch).toBeTruthy()
    const styleCss = styleMatch![1]!.replace(/\/\*[\s\S]*?\*\//g, '')

    expect(styleCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styleCss).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/i)

    const transitions = [...styleCss.matchAll(/transition(?:-property)?\s*:([^;]+);/gi)]
    for (const [, value] of transitions) {
      expect(value).not.toMatch(/\b(?:all|color|background(?:-color)?|border(?:-color)?)\b/i)
    }
  })
})
