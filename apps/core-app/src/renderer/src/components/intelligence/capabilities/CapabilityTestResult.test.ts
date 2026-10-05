// @vitest-environment jsdom
import type { CapabilityTestResult } from './types'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from '~/modules/lang/en-US.json'
import zhCN from '~/modules/lang/zh-CN.json'
import CapabilityTestResultView from './CapabilityTestResult.vue'

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    emits: ['click'],
    template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

/**
 * What a capability test the usage limit refused carries: the projection main gives the app's own
 * renderer (`[CODE:capability] reason`), here for a limit that resets at 2026-10-05 00:00 in
 * Shanghai.
 */
const REFUSED =
  '[USAGE_LIMIT_REACHED:text.chat] The usage limit you set is reached (requestsPerDay: 1 / 1); it resets at 2026-10-05 00:00 local time (2026-10-04T16:00:00.000Z).'

function render(result: CapabilityTestResult, locale: 'zh-CN' | 'en-US') {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { 'zh-CN': zhCN, 'en-US': enUS }
  })
  return mount(CapabilityTestResultView, {
    props: { result },
    global: { plugins: [i18n] }
  })
}

describe('CapabilityTestResult under the usage limit', () => {
  const originalTimeZone = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'Asia/Shanghai'
    routerMocks.push.mockReset()
  })

  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  it('says which limit refused the test and when it resets, in Chinese, with the way to Audit', async () => {
    const wrapper = render({ success: false, message: REFUSED, timestamp: 1 }, 'zh-CN')

    const notice = wrapper.get('[data-testid="capability-test-usage-limit"]')
    expect(notice.text()).toContain('已达到你在「审计」里设置的 AI 用量上限，10月5日 00:00 重置。')
    // Main's English sentence and its ISO instant are not what the reader sees.
    expect(wrapper.text()).not.toContain('The usage limit you set')
    expect(wrapper.text()).not.toContain('2026-10-04T16:00:00.000Z')

    const button = wrapper.get('[data-testid="capability-test-open-usage-limits"]')
    expect(button.text()).toBe('打开审计')
    await button.trigger('click')
    expect(routerMocks.push).toHaveBeenCalledWith('/setting/intelligence/audit')
  })

  it('says the same in English', () => {
    const wrapper = render({ success: false, message: REFUSED, timestamp: 1 }, 'en-US')

    expect(wrapper.get('[data-testid="capability-test-usage-limit"]').text()).toContain(
      "You've reached the AI usage limit you set in Audit. It resets Oct 5, 00:00."
    )
    expect(wrapper.get('[data-testid="capability-test-open-usage-limits"]').text()).toBe(
      'Open Audit'
    )
  })

  it('leaves every other failure, and a success, as they came', () => {
    const failed = render(
      { success: false, message: 'Provider rejected the request.', timestamp: 1 },
      'zh-CN'
    )
    expect(failed.find('[data-testid="capability-test-usage-limit"]').exists()).toBe(false)
    expect(failed.text()).toContain('Provider rejected the request.')

    // A success whose reply happens to mention the code is a reply, not a refusal.
    const succeeded = render(
      { success: true, message: 'echo USAGE_LIMIT_REACHED', timestamp: 1 },
      'zh-CN'
    )
    expect(succeeded.find('[data-testid="capability-test-usage-limit"]').exists()).toBe(false)
    expect(succeeded.text()).toContain('echo USAGE_LIMIT_REACHED')
  })
})
