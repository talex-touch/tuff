// @vitest-environment jsdom
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { PluginApiUninstallResponse } from '@talex-touch/utils/transport/events/types'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PluginInfo from './PluginInfo.vue'

const pluginInfoMocks = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof import('vue')
  return {
    route: reactive({
      path: '/plugin/synthetic-plugin',
      params: {},
      query: {} as Record<string, string | undefined>
    }),
    pluginSdk: {
      disable: vi.fn(),
      enable: vi.fn(),
      openFolder: vi.fn(),
      reconnectDevServer: vi.fn(),
      reload: vi.fn(),
      uninstall: vi.fn()
    },
    toast: {
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn()
    },
    logger: {
      error: vi.fn(),
      warn: vi.fn()
    }
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => pluginInfoMocks.route
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key
      return `${key}:${Object.values(params).join(':')}`
    }
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxSplitButton: {
    name: 'TxSplitButton',
    props: ['disabled', 'loading'],
    emits: ['click'],
    methods: { close: () => undefined },
    template:
      '<div><button data-testid="plugin-primary-action" type="button" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button><div data-testid="plugin-action-menu"><slot name="menu" :close="close" /></div></div>'
  }
}))

vi.mock('@talex-touch/tuffex/dialog', () => ({
  TxBottomDialog: {
    name: 'TxBottomDialog',
    props: ['title', 'message', 'btns', 'close'],
    methods: {
      async run(button: { onClick: () => boolean | Promise<boolean> }) {
        await button.onClick()
      }
    },
    template:
      '<section role="dialog" data-testid="legacy-uninstall-dialog"><h2>{{ title }}</h2><p>{{ message }}</p><button v-for="(button, index) in btns" :key="index" type="button" :data-testid="`legacy-dialog-button-${index}`" @click="run(button)">{{ button.content }}</button></section>'
  }
}))

vi.mock('@talex-touch/tuffex/tabs', () => ({
  TxTabs: {
    name: 'TxTabs',
    props: ['modelValue'],
    template: '<output>{{ modelValue }}</output>'
  },
  TxTabItem: {
    name: 'TxTabItem',
    template: '<div><slot /></div>'
  }
}))

vi.mock('~/components/base/StatusIcon.vue', () => ({
  default: { name: 'StatusIcon', template: '<span />' }
}))
vi.mock('~/components/base/dialog/FlipDialog.vue', () => ({
  default: { name: 'FlipDialog', template: '<div />' }
}))
vi.mock('~/components/plugin/PluginFab.vue', () => ({
  default: { name: 'PluginFab', template: '<div />' }
}))
vi.mock('./tabs/PluginDetails.vue', () => ({
  default: { name: 'PluginDetails', template: '<div />' }
}))
vi.mock('./tabs/PluginFeatures.vue', () => ({
  default: { name: 'PluginFeatures', template: '<div />' }
}))
vi.mock('./tabs/PluginIssues.vue', () => ({
  default: { name: 'PluginIssues', template: '<div />' }
}))
vi.mock('./tabs/PluginLogs.vue', () => ({
  default: { name: 'PluginLogs', template: '<div />' }
}))
vi.mock('./tabs/PluginOverview.vue', () => ({
  default: { name: 'PluginOverview', template: '<div />' }
}))
vi.mock('./tabs/PluginPermissions.vue', () => ({
  default: { name: 'PluginPermissions', template: '<div />' }
}))
vi.mock('./tabs/PluginStorage.vue', () => ({
  default: { name: 'PluginStorage', template: '<div />' }
}))
vi.mock('./tabs/PluginStructure.vue', () => ({
  default: { name: 'PluginStructure', template: '<div />' }
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ openExternal: vi.fn() })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn() })
}))

vi.mock('~/composables/plugin/usePluginExternalLinks', () => ({
  usePluginExternalLinks: () => ({ nexusPublishUrl: { value: null } })
}))

vi.mock('~/modules/hooks/useStartupInfo', () => ({
  useStartupInfo: () => ({ startupInfo: { value: { isDev: false } } })
}))

vi.mock('~/modules/sdk/plugin-sdk', () => ({
  pluginSDK: pluginInfoMocks.pluginSdk
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => pluginInfoMocks.logger
}))

vi.mock('vue-sonner', () => ({ toast: pluginInfoMocks.toast }))

const childStubs = {
  FlipDialog: { template: '<div />' },
  PluginDetails: { template: '<div />' },
  PluginFab: { template: '<div />' },
  PluginFeatures: { template: '<div />' },
  PluginIssues: { template: '<div />' },
  PluginLogs: { template: '<div />' },
  PluginOverview: { template: '<div />' },
  PluginPermissions: { template: '<div />' },
  PluginStorage: { template: '<div />' },
  PluginStructure: { template: '<div />' },
  StatusIcon: { template: '<span />' }
}

function createPlugin(overrides: Record<string, unknown> = {}): ITouchPlugin {
  return {
    name: 'synthetic-plugin',
    version: '1.0.0',
    desc: 'Synthetic plugin',
    icon: { type: 'class', value: 'i-ri-apps-line' },
    dev: { enable: false },
    pluginPath: '/synthetic/plugins/synthetic-plugin',
    pluginInstanceId: 'instance-privacy-301',
    activationGeneration: 7,
    logger: {},
    features: [],
    issues: [],
    addFeature: vi.fn(),
    delFeature: vi.fn(),
    getFeature: vi.fn(),
    ...overrides
  } as unknown as ITouchPlugin
}

function uninstallResult(state: 'completed' | 'failed' | 'cancelled'): PluginApiUninstallResponse {
  if (state === 'completed') {
    return {
      version: 1,
      success: true,
      status: 'completed',
      code: 'PLUGIN_UNINSTALL_COMPLETED',
      retryable: false,
      installed: false,
      stages: []
    }
  }
  if (state === 'cancelled') {
    return {
      version: 1,
      success: false,
      status: 'cancelled',
      code: 'PLUGIN_UNINSTALL_CANCELLED',
      retryable: true,
      installed: true,
      stages: []
    }
  }
  return {
    version: 1,
    success: false,
    status: 'failed',
    code: 'PLUGIN_UNINSTALL_EXPORT_FAILED',
    retryable: true,
    installed: true,
    stages: [
      {
        stage: 'ordinary-export',
        status: 'failed',
        code: 'PLUGIN_UNINSTALL_ORDINARY_EXPORT_FAILED',
        retryable: true
      }
    ]
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function mountPluginInfo(plugin: ITouchPlugin = createPlugin()): VueWrapper {
  return mount(PluginInfo, {
    attachTo: document.body,
    props: { plugin },
    global: {
      directives: { wave: {} },
      stubs: childStubs
    }
  })
}

async function openUninstallDialog(wrapper: VueWrapper) {
  const expectedTrigger = wrapper.find('[data-testid="plugin-uninstall-action"]')
  const trigger = expectedTrigger.exists() ? expectedTrigger : wrapper.get('.action-item.danger')
  ;(trigger.element as HTMLElement).focus()
  await trigger.trigger('click')
  await flushPromises()
  return trigger
}

async function chooseOrdinaryExportAndConfirmImpact(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-testid="plugin-uninstall-ordinary-export"]').setValue(true)
  await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)
}

function serializedFeedback(): string {
  return JSON.stringify({
    logger: pluginInfoMocks.logger.error.mock.calls,
    toastError: pluginInfoMocks.toast.error.mock.calls,
    toastInfo: pluginInfoMocks.toast.info.mock.calls,
    toastSuccess: pluginInfoMocks.toast.success.mock.calls
  })
}

describe('PluginInfo uninstall data disposition', () => {
  beforeEach(() => {
    pluginInfoMocks.pluginSdk.uninstall.mockReset()
    pluginInfoMocks.pluginSdk.disable.mockReset()
    pluginInfoMocks.pluginSdk.enable.mockReset()
    pluginInfoMocks.pluginSdk.openFolder.mockReset()
    pluginInfoMocks.pluginSdk.reconnectDevServer.mockReset()
    pluginInfoMocks.pluginSdk.reload.mockReset()
    pluginInfoMocks.toast.error.mockReset()
    pluginInfoMocks.toast.info.mockReset()
    pluginInfoMocks.toast.success.mockReset()
    pluginInfoMocks.logger.error.mockReset()
    pluginInfoMocks.logger.warn.mockReset()
    pluginInfoMocks.route.path = '/plugin/synthetic-plugin'
    pluginInfoMocks.route.query = {}
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('opens the uninstall disposition from a semantic action and presents both export choices', async () => {
    const wrapper = mountPluginInfo()
    const trigger = await openUninstallDialog(wrapper)

    expect(trigger.element.tagName).toBe('BUTTON')
    expect(wrapper.get('[data-testid="plugin-uninstall-dialog"]').attributes('role')).toBe('dialog')
    expect(wrapper.get('[data-testid="plugin-uninstall-ordinary-export"]').attributes('type')).toBe(
      'checkbox'
    )
    expect(wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').attributes('type')).toBe(
      'checkbox'
    )
    expect(wrapper.get('[data-testid="plugin-uninstall-final-impact"]').attributes('type')).toBe(
      'checkbox'
    )
    expect(wrapper.get('[data-testid="plugin-uninstall-status"]').attributes('aria-live')).toBe(
      'polite'
    )
    wrapper.unmount()
  })

  it('sends an exact generation-bound export plan, disables pending controls, and dismisses on success', async () => {
    const pending = deferred<PluginApiUninstallResponse>()
    pluginInfoMocks.pluginSdk.uninstall.mockReturnValueOnce(pending.promise)
    const wrapper = mountPluginInfo()
    const trigger = await openUninstallDialog(wrapper)
    await chooseOrdinaryExportAndConfirmImpact(wrapper)

    const confirm = wrapper.get('[data-testid="plugin-uninstall-confirm"]')
    expect(confirm.element.tagName).toBe('BUTTON')
    await confirm.trigger('click')

    expect(pluginInfoMocks.pluginSdk.uninstall).toHaveBeenCalledWith({
      version: 1,
      plugin: {
        name: 'synthetic-plugin',
        pluginInstanceId: 'instance-privacy-301',
        activationGeneration: 7
      },
      disposition: {
        confirmation: 'delete-plugin-and-data',
        ordinaryExport: { enabled: true },
        portableSecretBackup: { enabled: false }
      }
    })
    expect((confirm.element as HTMLButtonElement).disabled).toBe(true)
    expect(
      (wrapper.get('[data-testid="plugin-uninstall-ordinary-export"]').element as HTMLInputElement)
        .disabled
    ).toBe(true)
    expect(
      (wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').element as HTMLInputElement)
        .disabled
    ).toBe(true)

    pending.resolve(uninstallResult('completed'))
    await flushPromises()

    expect(wrapper.find('[data-testid="plugin-uninstall-dialog"]').exists()).toBe(false)
    expect(pluginInfoMocks.toast.success).toHaveBeenCalledWith(
      expect.stringContaining('plugin.uninstall.success')
    )
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('requires a matching 12-code-point password before enabling encrypted Secret backup', async () => {
    const password = 'Synthetic-Plugin-Backup-301!'
    pluginInfoMocks.pluginSdk.uninstall.mockResolvedValueOnce(uninstallResult('completed'))
    const wrapper = mountPluginInfo()
    await openUninstallDialog(wrapper)
    await wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').setValue(true)
    await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)

    const passwordInput = wrapper.get('[data-testid="plugin-uninstall-password"]')
    const confirmationInput = wrapper.get('[data-testid="plugin-uninstall-password-confirmation"]')
    expect(passwordInput.attributes('type')).toBe('password')
    expect(passwordInput.attributes('autocomplete')).toBe('new-password')
    expect(confirmationInput.attributes('autocomplete')).toBe('new-password')

    await passwordInput.setValue('short-value')
    await confirmationInput.setValue('short-value')
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
    expect(pluginInfoMocks.pluginSdk.uninstall).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="plugin-uninstall-password-error"]').text()).toContain(
      'plugin.uninstall.passwordMinimum'
    )
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
    expect((confirmationInput.element as HTMLInputElement).value).toBe('')

    await passwordInput.setValue(password)
    await confirmationInput.setValue(`${password}-mismatch`)
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
    expect(pluginInfoMocks.pluginSdk.uninstall).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="plugin-uninstall-password-error"]').text()).toContain(
      'plugin.uninstall.passwordMismatch'
    )
    expect((passwordInput.element as HTMLInputElement).value).toBe('')
    expect((confirmationInput.element as HTMLInputElement).value).toBe('')

    await passwordInput.setValue(password)
    await passwordInput.setValue(password)
    await confirmationInput.setValue(password)
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
    await flushPromises()
    expect(pluginInfoMocks.pluginSdk.uninstall).toHaveBeenCalledWith({
      version: 1,
      plugin: {
        name: 'synthetic-plugin',
        pluginInstanceId: 'instance-privacy-301',
        activationGeneration: 7
      },
      disposition: {
        confirmation: 'delete-plugin-and-data',
        ordinaryExport: { enabled: false },
        portableSecretBackup: { enabled: true, password }
      }
    })
    expect(document.body.textContent).not.toContain(password)
    expect(serializedFeedback()).not.toContain(password)
    wrapper.unmount()
  })

  it('cancels without a request, restores focus, and clears password on close and unmount', async () => {
    const password = 'Synthetic-Close-Plugin-301!'
    const wrapper = mountPluginInfo()
    const trigger = await openUninstallDialog(wrapper)
    const ordinaryExport = wrapper.get('[data-testid="plugin-uninstall-ordinary-export"]')
    const cancel = wrapper.get('[data-testid="plugin-uninstall-cancel"]')
    expect(document.activeElement).toBe(ordinaryExport.element)
    await ordinaryExport.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel.element)
    await cancel.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(ordinaryExport.element)

    await wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').setValue(true)
    await wrapper.get('[data-testid="plugin-uninstall-password"]').setValue(password)
    await wrapper.get('[data-testid="plugin-uninstall-password-confirmation"]').setValue(password)
    await wrapper.get('[data-testid="plugin-uninstall-dialog"]').trigger('keydown', {
      key: 'Escape'
    })
    await flushPromises()

    expect(pluginInfoMocks.pluginSdk.uninstall).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="plugin-uninstall-dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(document.body.textContent).not.toContain(password)

    await openUninstallDialog(wrapper)
    await wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').setValue(true)
    expect(
      (wrapper.get('[data-testid="plugin-uninstall-password"]').element as HTMLInputElement).value
    ).toBe('')
    await wrapper.get('[data-testid="plugin-uninstall-password"]').setValue(password)
    wrapper.unmount()
    expect(document.body.textContent).not.toContain(password)
    expect(serializedFeedback()).not.toContain(password)
  })

  it.each([
    ['cancelled', uninstallResult('cancelled'), 'plugin.uninstall.cancelled'],
    ['failed', uninstallResult('failed'), 'plugin.uninstall.retryableFailure']
  ] as const)(
    'keeps a %s uninstall retryable but requires explicit confirmation for every retry',
    async (_state, result, feedbackKey) => {
      pluginInfoMocks.pluginSdk.uninstall.mockResolvedValueOnce(result)
      const wrapper = mountPluginInfo()
      await openUninstallDialog(wrapper)
      await chooseOrdinaryExportAndConfirmImpact(wrapper)
      await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="plugin-uninstall-dialog"]').exists()).toBe(true)
      expect(
        (wrapper.get('[data-testid="plugin-uninstall-confirm"]').element as HTMLButtonElement)
          .disabled
      ).toBe(true)
      await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)
      expect(
        (wrapper.get('[data-testid="plugin-uninstall-confirm"]').element as HTMLButtonElement)
          .disabled
      ).toBe(false)
      expect(wrapper.get('[data-testid="plugin-uninstall-status"]').text()).toContain(feedbackKey)
      expect(pluginInfoMocks.toast.success).not.toHaveBeenCalled()
      wrapper.unmount()
    }
  )

  it('treats a transport rejection as unknown outcome and requires renewed confirmation', async () => {
    const nativeCanary = '/private/native/uninstall/CANARY'
    pluginInfoMocks.pluginSdk.uninstall.mockRejectedValueOnce(new Error(nativeCanary))
    const wrapper = mountPluginInfo()
    await openUninstallDialog(wrapper)
    await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="plugin-uninstall-status"]').text()).toContain(
      'plugin.uninstall.outcomeUnknown'
    )
    expect(
      (wrapper.get('[data-testid="plugin-uninstall-confirm"]').element as HTMLButtonElement)
        .disabled
    ).toBe(true)
    expect(serializedFeedback()).not.toContain(nativeCanary)
    expect(pluginInfoMocks.logger.error).toHaveBeenCalledWith(
      'Plugin uninstall request outcome is unknown'
    )
    expect(pluginInfoMocks.toast.error).toHaveBeenCalledWith('plugin.uninstall.outcomeUnknown')
    wrapper.unmount()
  })

  it('clears an encrypted-backup password after a failed disposition', async () => {
    const password = 'Synthetic-Failure-Plugin-301!'
    pluginInfoMocks.pluginSdk.uninstall.mockResolvedValueOnce(uninstallResult('failed'))
    const wrapper = mountPluginInfo()
    await openUninstallDialog(wrapper)
    await wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').setValue(true)
    await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)
    await wrapper.get('[data-testid="plugin-uninstall-password"]').setValue(password)
    await wrapper.get('[data-testid="plugin-uninstall-password-confirmation"]').setValue(password)
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
    await flushPromises()

    expect(
      (wrapper.get('[data-testid="plugin-uninstall-password"]').element as HTMLInputElement).value
    ).toBe('')
    expect(
      (
        wrapper.get('[data-testid="plugin-uninstall-password-confirmation"]')
          .element as HTMLInputElement
      ).value
    ).toBe('')
    expect(wrapper.get('[data-testid="plugin-uninstall-final-impact"]').attributes('checked')).toBe(
      undefined
    )
    expect(document.body.textContent).not.toContain(password)
    expect(serializedFeedback()).not.toContain(password)
    wrapper.unmount()
  })

  it('closes and invalidates a pending uninstall when the exact plugin generation changes', async () => {
    const pending = deferred<PluginApiUninstallResponse>()
    pluginInfoMocks.pluginSdk.uninstall.mockReturnValueOnce(pending.promise)
    const wrapper = mountPluginInfo()
    const trigger = await openUninstallDialog(wrapper)
    await wrapper.get('[data-testid="plugin-uninstall-secret-backup"]').setValue(true)
    await wrapper
      .get('[data-testid="plugin-uninstall-password"]')
      .setValue('Synthetic-Generation-301!')
    await wrapper
      .get('[data-testid="plugin-uninstall-password-confirmation"]')
      .setValue('Synthetic-Generation-301!')
    await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')

    await wrapper.setProps({
      plugin: createPlugin({
        name: 'replacement-plugin',
        pluginInstanceId: 'instance-replacement-301',
        activationGeneration: 8
      })
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="plugin-uninstall-dialog"]').exists()).toBe(false)
    expect(
      (wrapper.get('[data-testid="plugin-uninstall-action"]').element as HTMLButtonElement).disabled
    ).toBe(true)
    expect(document.body.textContent).not.toContain('Synthetic-Generation-301!')

    pending.resolve(uninstallResult('completed'))
    await flushPromises()
    expect(
      (wrapper.get('[data-testid="plugin-uninstall-action"]').element as HTMLButtonElement).disabled
    ).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(pluginInfoMocks.toast.success).not.toHaveBeenCalled()
    expect(pluginInfoMocks.toast.error).not.toHaveBeenCalled()
    expect(pluginInfoMocks.logger.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('contains keyboard focus, restores it on Escape, and ignores Escape while pending', async () => {
    const pending = deferred<PluginApiUninstallResponse>()
    pluginInfoMocks.pluginSdk.uninstall.mockReturnValueOnce(pending.promise)
    const wrapper = mountPluginInfo()
    const trigger = await openUninstallDialog(wrapper)
    const dialog = wrapper.get('[data-testid="plugin-uninstall-dialog"]')
    const ordinaryExport = wrapper.get('[data-testid="plugin-uninstall-ordinary-export"]')
    const cancel = wrapper.get('[data-testid="plugin-uninstall-cancel"]')
    const confirm = wrapper.get('[data-testid="plugin-uninstall-confirm"]')

    expect(dialog.attributes('aria-labelledby')).toBe('plugin-uninstall-title')
    expect(dialog.attributes('aria-describedby')).toBe('plugin-uninstall-description')
    expect(document.activeElement).toBe(ordinaryExport.element)
    await ordinaryExport.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel.element)

    await wrapper.get('[data-testid="plugin-uninstall-final-impact"]').setValue(true)
    await confirm.trigger('click')
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="plugin-uninstall-dialog"]').exists()).toBe(true)

    pending.resolve(uninstallResult('failed'))
    await flushPromises()
    await dialog.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('[data-testid="plugin-uninstall-dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('does not emit late uninstall feedback after the component unmounts', async () => {
    const pending = deferred<PluginApiUninstallResponse>()
    pluginInfoMocks.pluginSdk.uninstall.mockReturnValueOnce(pending.promise)
    const wrapper = mountPluginInfo()
    await openUninstallDialog(wrapper)
    await chooseOrdinaryExportAndConfirmImpact(wrapper)
    await wrapper.get('[data-testid="plugin-uninstall-confirm"]').trigger('click')
    wrapper.unmount()

    pending.resolve(uninstallResult('completed'))
    await flushPromises()
    expect(pluginInfoMocks.toast.success).not.toHaveBeenCalled()
    expect(pluginInfoMocks.toast.error).not.toHaveBeenCalled()
    expect(pluginInfoMocks.logger.error).not.toHaveBeenCalled()
  })
})
