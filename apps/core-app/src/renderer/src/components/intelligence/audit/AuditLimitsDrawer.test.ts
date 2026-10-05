// @vitest-environment jsdom
import type { UsageLimits } from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { insightsFixture } from './audit-fixtures'
import AuditLimitsDrawer from './AuditLimitsDrawer.vue'

const sdk = vi.hoisted(() => ({ getUsageLimits: vi.fn(), setUsageLimits: vi.fn() }))

/** Like the real transport: a payload that cannot be structured-cloned fails. */
vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    getUsageLimits: () => sdk.getUsageLimits(),
    setUsageLimits: (limits: unknown) => {
      structuredClone(limits)
      return sdk.setUsageLimits(limits)
    }
  })
}))

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { ref } = await import('vue')
  return { useIntelligenceManager: () => ({ providers: ref([]), capabilities: ref({}) }) }
})
vi.mock('~/stores/plugin', () => ({ usePluginStore: () => ({ plugins: new Map() }) }))

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
      locale: ref('en-US')
    })
  }
})

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('vue-sonner', () => ({ toast }))

const NO_LIMITS: UsageLimits = {
  requestsPerDay: null,
  requestsPerMonth: null,
  tokensPerDay: null,
  tokensPerMonth: null,
  costUsdPerDay: null,
  costUsdPerMonth: null
}

const STUBS = {
  TxDrawer: {
    props: ['visible', 'title'],
    template: '<div v-if="visible"><slot /><slot name="footer" /></div>'
  },
  TxNumberInput: {
    name: 'TxNumberInput',
    props: ['modelValue', 'min', 'precision', 'placeholder', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue ?? \'\'" :placeholder="placeholder" :data-min="min" :data-precision="precision" />'
  }
}

async function mountDrawer(props: Record<string, unknown> = {}) {
  const wrapper = mount(AuditLimitsDrawer, {
    props: { visible: false, ...props },
    global: { stubs: STUBS },
    attachTo: document.body
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

function field(wrapper: Awaited<ReturnType<typeof mountDrawer>>, key: keyof UsageLimits) {
  return wrapper
    .findAllComponents({ name: 'TxNumberInput' })
    .find((input) => input.attributes('data-testid') === `audit-limit-${key}`)!
}

beforeEach(() => {
  sdk.getUsageLimits.mockReset()
  sdk.setUsageLimits.mockReset()
  toast.success.mockClear()
})

describe('AuditLimitsDrawer', () => {
  it('has six fields, starts from the limits in force, and marks the cost ones as estimates', async () => {
    const wrapper = await mountDrawer({ limits: { ...NO_LIMITS, requestsPerDay: 100 } })
    expect(wrapper.findAllComponents({ name: 'TxNumberInput' })).toHaveLength(6)
    expect(field(wrapper, 'requestsPerDay').attributes('value')).toBe('100')
    expect(field(wrapper, 'tokensPerMonth').attributes('value')).toBe('')
    expect(field(wrapper, 'costUsdPerDay').attributes('data-precision')).toBe('2')
    const costRow = wrapper.find('[data-metric="cost"]')
    expect(costRow.text()).toContain('intelligenceAudit.limits.estimated')
    expect(wrapper.text()).toContain('intelligenceAudit.limits.costNote')
    wrapper.unmount()
  })

  it('reads the limits on open when the page has none to hand', async () => {
    sdk.getUsageLimits.mockResolvedValue({ ...NO_LIMITS, tokensPerDay: 50_000 })
    const wrapper = await mountDrawer({ limits: null })
    expect(sdk.getUsageLimits).toHaveBeenCalledTimes(1)
    expect(field(wrapper, 'tokensPerDay').attributes('value')).toBe('50000')
    wrapper.unmount()
  })

  it('lists the models a cost limit cannot see', async () => {
    const wrapper = await mountDrawer({
      limits: NO_LIMITS,
      zeroCostModels: insightsFixture().zeroCostModels
    })
    const list = wrapper.find('[data-testid="audit-zero-cost-list"]')
    expect(list.text()).toContain('qwen2.5:3b')
    expect(list.text()).toContain('mystery-model-9')
    wrapper.unmount()
  })

  it('saves all six as a plain object, empty fields as no limit', async () => {
    sdk.setUsageLimits.mockImplementation(async (limits: UsageLimits) => limits)
    const wrapper = await mountDrawer({ limits: { ...NO_LIMITS, requestsPerDay: 100 } })
    field(wrapper, 'requestsPerDay').vm.$emit('update:modelValue', null)
    field(wrapper, 'tokensPerDay').vm.$emit('update:modelValue', 20_000)
    field(wrapper, 'costUsdPerMonth').vm.$emit('update:modelValue', 5)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(sdk.setUsageLimits).toHaveBeenCalledWith({
      ...NO_LIMITS,
      tokensPerDay: 20_000,
      costUsdPerMonth: 5
    })
    const expected = { ...NO_LIMITS, tokensPerDay: 20_000, costUsdPerMonth: 5 }
    expect(wrapper.emitted('saved')).toEqual([[expected]])
    expect(wrapper.emitted('update:visible')).toEqual([[false]])
    expect(toast.success).toHaveBeenCalledWith('intelligenceAudit.limits.saved')
    wrapper.unmount()
  })

  it('names the field a bad value is in and does not save it', async () => {
    const wrapper = await mountDrawer({ limits: NO_LIMITS })
    field(wrapper, 'requestsPerMonth').vm.$emit('update:modelValue', 2.5)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sdk.setUsageLimits).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="audit-limits-error"]').text()).toContain(
      'intelligenceAudit.limits.invalidCount:{"field":"intelligenceAudit.limits.items.requestsPerMonth"}'
    )

    field(wrapper, 'requestsPerMonth').vm.$emit('update:modelValue', null)
    field(wrapper, 'costUsdPerDay').vm.$emit('update:modelValue', 0)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sdk.setUsageLimits).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="audit-limits-error"]').text()).toContain(
      'intelligenceAudit.limits.invalidCost'
    )
    wrapper.unmount()
  })

  it('refuses a count past the safe integer range here, as main does, instead of sending it', async () => {
    // 2^53 is an integer to `Number.isInteger` but not a safe one; main's `Number.isSafeInteger`
    // rejects it, so passing it on would only trade a named field for the host's refusal.
    const wrapper = await mountDrawer({ limits: NO_LIMITS })
    field(wrapper, 'tokensPerMonth').vm.$emit('update:modelValue', 2 ** 53)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(sdk.setUsageLimits).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="audit-limits-error"]').text()).toContain(
      'intelligenceAudit.limits.invalidCount:{"field":"intelligenceAudit.limits.items.tokensPerMonth"}'
    )
    wrapper.unmount()
  })

  it('keeps the input and says so when the host refuses', async () => {
    sdk.setUsageLimits.mockRejectedValue(new Error('INVALID_REQUEST'))
    const wrapper = await mountDrawer({ limits: NO_LIMITS })
    field(wrapper, 'requestsPerDay').vm.$emit('update:modelValue', 3)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="audit-limits-error"]').text()).toContain(
      'intelligenceAudit.limits.saveFailed'
    )
    expect(field(wrapper, 'requestsPerDay').attributes('value')).toBe('3')
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })
})
