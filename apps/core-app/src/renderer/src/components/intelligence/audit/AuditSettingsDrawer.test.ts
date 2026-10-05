// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditSettingsDrawer from './AuditSettingsDrawer.vue'

interface ManagerState {
  globalConfig: { value: Record<string, unknown> }
  updateGlobalConfig: ReturnType<typeof vi.fn>
  saveSettings: ReturnType<typeof vi.fn>
}

const manager = vi.hoisted(() => ({ state: null as null | ManagerState }))

vi.mock('~/modules/hooks/useIntelligenceManager', async () => {
  const { ref } = await import('vue')
  const state = {
    globalConfig: ref<Record<string, unknown>>({}),
    updateGlobalConfig: vi.fn((updates: Record<string, unknown>) => {
      state.globalConfig.value = { ...state.globalConfig.value, ...updates }
    }),
    saveSettings: vi.fn(async () => undefined)
  }
  manager.state = state
  return { useIntelligenceManager: () => state }
})

const appSetting = vi.hoisted(() => ({ dev: { developerMode: false } }))
vi.mock('~/modules/storage/app-storage', () => ({ appSetting }))

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))

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

vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

const STUBS = {
  TxDrawer: {
    props: ['visible', 'title'],
    template: '<div v-if="visible" :data-title="title"><slot /></div>'
  },
  TuffGroupBlock: { props: ['name'], template: '<section :data-group="name"><slot /></section>' },
  // Keyed by the components' own names (`TuffSwitch`, `TuffSelect`…), which is what a stub matches.
  TuffSwitch: {
    name: 'TxSwitch',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<button type="button" role="switch" :aria-checked="String(modelValue)" @click="$emit(\'update:modelValue\', !modelValue)" />'
  },
  TuffSelect: {
    name: 'TxSelect',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<div data-stub="select" :data-value="String(modelValue)"><slot /></div>'
  },
  TuffSelectItem: {
    name: 'TxSelectItem',
    props: ['value', 'label'],
    template: '<span data-stub="option" :data-value="String(value)">{{ label }}</span>'
  },
  TxButton: {
    props: ['disabled'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  }
}

function mountDrawer(
  audit: Record<string, unknown> | null = {
    enabled: true,
    retentionMs: 30 * 86_400_000,
    oldestDetailMs: null
  }
) {
  return mount(AuditSettingsDrawer, {
    props: { visible: true, audit: audit as never },
    global: { stubs: STUBS }
  })
}

function optionValues(wrapper: ReturnType<typeof mountDrawer>): Array<string | undefined> {
  return wrapper.findAll('[data-stub="option"]').map((option) => option.attributes('data-value'))
}

beforeEach(() => {
  manager.state!.globalConfig.value = {
    enableAudit: true,
    enableCache: true,
    cacheExpiration: 3600
  }
  manager.state!.updateGlobalConfig.mockClear()
  manager.state!.saveSettings.mockClear()
  appSetting.dev.developerMode = false
  router.push.mockClear()
})

describe('AuditSettingsDrawer', () => {
  it('has one control for the response cache, and none duplicated for audit', async () => {
    const wrapper = mountDrawer()

    // One cache control: a single choice, off or how long. No separate switch, no seconds field.
    const selects = wrapper.findAllComponents({ name: 'TxSelect' })
    expect(selects).toHaveLength(1)
    expect(selects[0]!.attributes('data-testid')).toBe('audit-settings-cache')
    expect(wrapper.findAll('input')).toHaveLength(0)
    // One switch: audit itself.
    const switches = wrapper.findAllComponents({ name: 'TxSwitch' })
    expect(switches).toHaveLength(1)
    expect(switches[0]!.attributes('data-testid')).toBe('audit-settings-enable')

    expect(selects[0]!.attributes('data-value')).toBe('3600')
    expect(optionValues(wrapper)).toEqual(['off', '300', '900', '3600', '21600', '86400'])
    wrapper.unmount()
  })

  it('turns the cache off, or on for a duration, through that one control', async () => {
    const wrapper = mountDrawer()
    const select = wrapper.findComponent({ name: 'TxSelect' })

    select.vm.$emit('update:modelValue', 'off')
    await flushPromises()
    expect(manager.state!.updateGlobalConfig).toHaveBeenLastCalledWith({ enableCache: false })

    select.vm.$emit('update:modelValue', 900)
    await flushPromises()
    expect(manager.state!.updateGlobalConfig).toHaveBeenLastCalledWith({
      enableCache: true,
      cacheExpiration: 900
    })
    expect(manager.state!.saveSettings).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('keeps a stored duration outside the presets selectable as itself', () => {
    manager.state!.globalConfig.value = {
      enableAudit: true,
      enableCache: true,
      cacheExpiration: 600
    }
    const wrapper = mountDrawer()
    expect(optionValues(wrapper)).toContain('600')
    expect(wrapper.findComponent({ name: 'TxSelect' }).attributes('data-value')).toBe('600')
    wrapper.unmount()
  })

  it('switches audit, saves, and tells the page to read again', async () => {
    const wrapper = mountDrawer()
    await wrapper.find('[data-testid="audit-settings-enable"]').trigger('click')
    await flushPromises()
    expect(manager.state!.updateGlobalConfig).toHaveBeenCalledWith({ enableAudit: false })
    expect(manager.state!.saveSettings).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('changed')).toHaveLength(1)
    // The description states what is kept and for how long.
    expect(wrapper.text()).toContain('intelligenceAudit.settings.enableAuditDescription')
    expect(wrapper.text()).toContain('intelligenceAudit.duration.days')
    expect(wrapper.text()).toMatch(/count\\?":\\?"30\\?"/)
    wrapper.unmount()
  })

  it('leads to retention and deletion only where that page can open', async () => {
    const closed = mountDrawer()
    const button = closed.find('[data-testid="audit-settings-privacy"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(closed.text()).toContain('intelligenceAudit.settings.privacyNeedsDeveloperMode')
    closed.unmount()

    appSetting.dev.developerMode = true
    const open = mountDrawer()
    await open.find('[data-testid="audit-settings-privacy"]').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/setting/storage-usage')
    expect(open.emitted('update:visible')).toEqual([[false]])
    open.unmount()
  })
})
