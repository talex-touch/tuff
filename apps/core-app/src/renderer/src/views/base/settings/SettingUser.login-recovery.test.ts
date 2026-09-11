// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type * as VueModule from 'vue'
import SettingUser from './SettingUser.vue'

const transportSendMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
}))
const loginWithBrowserMock = vi.hoisted(() => vi.fn())
const reopenBrowserLoginMock = vi.hoisted(() => vi.fn())
const cancelPendingBrowserLoginMock = vi.hoisted(() => vi.fn())
const signOutMock = vi.hoisted(() => vi.fn())

/**
 * The Nexus address the renderer resolves, plus the two save entry points the settings block calls.
 * `effectiveUrl` is what the page must show as in effect, whichever address is stored.
 */
const nexusBaseUrlMock = vi.hoisted(() => ({
  effectiveUrl: 'https://example.test',
  setUserNexusBaseUrl: vi.fn(),
  resetUserNexusBaseUrl: vi.fn()
}))

const authStateMock = vi.hoisted(() => {
  const { computed, reactive, ref } = require('vue') as typeof VueModule
  const authLoadingState = reactive({
    isSigningIn: false,
    isSigningUp: false,
    isSigningOut: false,
    isLoggingIn: false,
    loginProgress: 0,
    loginTimeRemaining: 120,
    loginStage: 'waiting' as 'idle' | 'preparing' | 'waiting' | 'success' | 'failed',
    loginAuthorizeUrl: 'https://example.test/device-auth?code=TUFF26',
    loginUserCode: 'TUFF26',
    loginExpiresAt: '',
    loginBrowserOpenFailed: true
  })
  const isLoggedIn = ref(false)
  const user = ref<{ avatar?: string | null } | null>(null)
  const displayName = ref('')
  const primaryEmail = ref('')
  return {
    authLoadingState,
    isLoggedIn,
    user,
    displayName,
    primaryEmail,
    useAuth: () => ({
      isLoggedIn: computed(() => isLoggedIn.value),
      user: computed(() => user.value),
      getDisplayName: () => displayName.value,
      getPrimaryEmail: () => primaryEmail.value,
      loginWithBrowser: loginWithBrowserMock,
      reopenBrowserLogin: reopenBrowserLoginMock,
      cancelPendingBrowserLogin: cancelPendingBrowserLoginMock,
      signOut: signOutMock,
      logout: vi.fn(),
      runSyncBootstrap: vi.fn(),
      authLoadingState
    })
  }
})

const appSettingMock = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({
    security: {
      machineCodeHash: '',
      machineCodeAttestedAt: ''
    },
    dev: {
      advancedSettings: false
    },
    auth: {
      nexusBaseUrl: ''
    }
  })
})

const syncPreferenceMock = vi.hoisted(() => ({
  state: {
    enabled: false,
    autoEnabledAt: '',
    userOverridden: false,
    status: 'idle' as string,
    lastSuccessAt: '',
    lastPushAt: '',
    lastPullAt: '',
    queueDepth: 0,
    lastErrorCode: '',
    blockedReason: ''
  }
}))

vi.mock('vue-sonner', () => ({
  toast: toastMock
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) => {
      const values = typeof params === 'object' && params ? params : {}
      const messages: Record<string, string> = {
        'settingUser.loginDialogWaitingTitle': '请在浏览器中完成登录',
        'settingUser.loginDialogWaitingDesc': `已打开授权页面。如页面未打开或已关闭，可以重新打开。剩余 ${String(values.seconds ?? '')} 秒。`,
        'settingUser.loginDialogBrowserOpenFailedWithCode': `系统浏览器未自动打开，登录会话仍在等待。请复制登录链接到浏览器继续授权；短码：${String(values.code ?? '')}。`,
        'settingUser.copyLoginLink': '复制登录链接',
        'settingUser.copyLoginCode': '复制短码',
        'settingUser.reopenLogin': '重新打开',
        'settingUser.cancelLogin': '取消登录',
        'settingUser.retryLogin': '重试',
        'settingUser.loginDialogFailedTitle': '登录失败',
        'settingUser.loginDialogFailedDesc': '无法完成账户授权，请重试。',
        'settingUser.syncStatusTitle': '同步状态',
        'settingUser.syncStatus.status.idle': '空闲',
        'settingUser.syncStatus.status.syncing': '同步中',
        'settingUser.syncStatus.status.paused': '已暂停',
        'settingUser.syncStatus.status.error': '异常',
        'settingUser.syncStatus.blocked.quota': '配额受限',
        'settingUser.syncStatus.blocked.device': '设备未授权',
        'settingUser.syncStatus.blocked.auth': '鉴权异常',
        'settingUser.syncStatus.unrecorded': '未记录',
        'settingUser.syncStatus.parts.status': `状态：${String(values.status ?? '')}`,
        'settingUser.syncStatus.parts.lastSuccess': `最近成功：${String(values.value ?? '')}`,
        'settingUser.syncStatus.parts.lastPush': `最近推送：${String(values.value ?? '')}`,
        'settingUser.syncStatus.parts.lastPull': `最近拉取：${String(values.value ?? '')}`,
        'settingUser.syncStatus.parts.queue': `队列：${String(values.count ?? '')}`,
        'settingUser.syncStatus.parts.blocked': `阻塞：${String(values.reason ?? '')}`,
        'settingUser.syncStatus.parts.error': `错误：${String(values.code ?? '')}`,
        'common.close': '关闭'
      }
      return messages[key] ?? (typeof params === 'string' ? params : key)
    }
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transportSendMock
  })
}))

vi.mock('@talex-touch/utils/env', () => ({
  NEXUS_BASE_URL: 'https://tuff.tagzxia.com',
  NEXUS_LOCAL_BASE_URL: 'http://localhost:3200',
  setRuntimeEnv: vi.fn(),
  TUFF_NEXUS_BASE_URL_ENV: 'TUFF_NEXUS_BASE_URL',
  getEnv: () => undefined,
  getEnvOrDefault: (_key: string, fallback: string) => fallback,
  getBooleanEnv: (_key: string, fallback = false) => fallback,
  hasWindow: () => true,
  hasDocument: () => true,
  hasNavigator: () => true,
  isBrowserRuntime: () => true,
  isNodeRuntime: () => false,
  isElectronRuntime: () => false,
  isElectronRenderer: () => false,
  isElectronMain: () => false,
  isDevEnv: () => false,
  isProdEnv: () => false,
  normalizeBaseUrl: (input: string) => input.trim().replace(/\/+$/, ''),
  resolveTuffNexusBaseUrl: () => 'https://tuff.tagzxia.com',
  getTuffBaseUrl: () => 'https://tuff.tagzxia.com',
  getTelemetryApiBase: () => 'https://tuff.tagzxia.com',
  getTpexApiBase: () => 'https://tuff.tagzxia.com'
}))

vi.mock('@talex-touch/utils/account', () => ({
  formatCompactAccountLabel: (value: string) => `shared-label:${value.trim().slice(0, 6)}`,
  formatCompactEmail: (value: string) => `shared-email:${value.trim().slice(0, 5)}`
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: appSettingMock
}))

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: authStateMock.useAuth
}))

vi.mock('~/modules/auth/sync-preferences', () => ({
  getSyncPreferenceState: () => syncPreferenceMock.state,
  setSyncPreferenceByUser: vi.fn()
}))

vi.mock('~/modules/nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => nexusBaseUrlMock.effectiveUrl,
  getRuntimeServerMode: () => 'production',
  setRuntimeServerMode: vi.fn(),
  setUserNexusBaseUrl: nexusBaseUrlMock.setUserNexusBaseUrl,
  resetUserNexusBaseUrl: nexusBaseUrlMock.resetUserNexusBaseUrl
}))

vi.mock('~/modules/sync', () => ({
  triggerManualSync: vi.fn()
}))

vi.mock('~/modules/auth/auth-error-message', () => ({
  resolveAuthErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'auth error'
}))

function mountSettingUser() {
  return mount(SettingUser, {
    global: {
      mocks: {
        $t: (key: string) => key
      },
      stubs: {
        CreditsSummaryBlock: { template: '<div />' },
        UserProfileEditor: { template: '<div />' },
        TuffBlockSlot: {
          template:
            '<div><span data-testid="slot-title">{{ title }}</span><p data-testid="slot-description">{{ description }}</p><slot /><slot name="tags" /></div>',
          props: ['title', 'description']
        },
        TuffBlockSwitch: {
          template: '<label><span>{{ title }}</span><input type="checkbox" /></label>',
          props: ['title']
        },
        TxButton: {
          template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
          emits: ['click']
        },
        TModal: {
          template:
            '<div v-if="modelValue" class="modal"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></div>',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue']
        },
        TxModal: {
          template:
            '<div v-if="modelValue" class="modal"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></div>',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue']
        }
      },
      plugins: [
        {
          install(app) {
            app.config.globalProperties.$t = (key: string) => key
            app.provide('i18n', {})
          }
        }
      ]
    }
  })
}

async function openLoginRecoveryDialog(wrapper: ReturnType<typeof mountSettingUser>) {
  const loginButton = wrapper
    .findAll('button')
    .find((button) => /settingUser\.login|登录|Sign in/i.test(button.text()))
  if (!loginButton) {
    throw new Error(`login button not found in wrapper: ${wrapper.text()}`)
  }
  await loginButton.trigger('click')
  await nextTick()
}

describe('SettingUser login recovery', () => {
  beforeEach(() => {
    transportSendMock.mockReset()
    loginWithBrowserMock.mockReset()
    reopenBrowserLoginMock.mockReset()
    cancelPendingBrowserLoginMock.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.info.mockReset()
    authStateMock.isLoggedIn.value = false
    authStateMock.user.value = null
    authStateMock.displayName.value = ''
    authStateMock.primaryEmail.value = ''
    appSettingMock.dev.advancedSettings = false
    Object.assign(syncPreferenceMock.state, {
      enabled: false,
      autoEnabledAt: '',
      userOverridden: false,
      status: 'idle',
      lastSuccessAt: '',
      lastPushAt: '',
      lastPullAt: '',
      queueDepth: 0,
      lastErrorCode: '',
      blockedReason: ''
    })
    authStateMock.authLoadingState.isLoggingIn = false
    authStateMock.authLoadingState.loginStage = 'waiting'
    authStateMock.authLoadingState.loginAuthorizeUrl =
      'https://example.test/device-auth?code=TUFF26'
    authStateMock.authLoadingState.loginUserCode = 'TUFF26'
    authStateMock.authLoadingState.loginBrowserOpenFailed = true
    transportSendMock.mockResolvedValue({
      backend: 'local-secret',
      available: true,
      degraded: false,
      reason: ''
    })
    loginWithBrowserMock.mockReturnValue(new Promise(() => {}))
    reopenBrowserLoginMock.mockResolvedValue(undefined)
  })

  it('renders only the sync authorization switch and does not send a secure-store health query', () => {
    authStateMock.isLoggedIn.value = true
    const wrapper = mountSettingUser()

    expect(wrapper.findAll('label')).toHaveLength(1)
    expect(wrapper.find('label').text()).toContain('settingUser.syncEnabledTitle')
    expect(transportSendMock).not.toHaveBeenCalled()
  })

  it('renders manual URL and short-code recovery copy actions', async () => {
    const wrapper = mountSettingUser()
    await openLoginRecoveryDialog(wrapper)

    expect(wrapper.find('[data-testid="login-recovery-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-recovery-copy-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-recovery-copy-code"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-recovery-manual-hint"]').text()).toContain('TUFF26')
  })

  it('copies login URL and short code through typed clipboard transport', async () => {
    const wrapper = mountSettingUser()
    await openLoginRecoveryDialog(wrapper)

    await wrapper.find('[data-testid="login-recovery-copy-link"]').trigger('click')
    await wrapper.find('[data-testid="login-recovery-copy-code"]').trigger('click')

    expect(transportSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEventName: expect.any(Function) }),
      {
        type: 'text',
        value: 'https://example.test/device-auth?code=TUFF26'
      }
    )
    expect(transportSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEventName: expect.any(Function) }),
      {
        type: 'text',
        value: 'TUFF26'
      }
    )
  })

  it('shows retry action for failed timeout copy', async () => {
    authStateMock.authLoadingState.isLoggingIn = false
    authStateMock.authLoadingState.loginStage = 'failed'
    loginWithBrowserMock.mockResolvedValue({
      success: false,
      error: new Error('Browser login timeout')
    })
    const wrapper = mountSettingUser()
    await openLoginRecoveryDialog(wrapper)

    expect(wrapper.find('[data-testid="login-recovery-retry"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="login-recovery-cancel"]').exists()).toBe(false)
  })

  it('renders shared compact account labels with only the sync authorization control', async () => {
    appSettingMock.dev.advancedSettings = false
    authStateMock.isLoggedIn.value = true
    authStateMock.displayName.value = '4mj6b7umhtksb17uiuw1fi8yz6pe'
    authStateMock.primaryEmail.value = 'sjdlaqwerty@privaterelay.linux.do'
    authStateMock.user.value = { avatar: '' }
    Object.assign(syncPreferenceMock.state, {
      enabled: true,
      status: 'error',
      lastSuccessAt: 'not-a-date',
      queueDepth: 7,
      lastErrorCode: 'E_SYNC',
      blockedReason: 'auth'
    })

    const wrapper = mountSettingUser()
    await nextTick()

    const text = wrapper.text()
    expect(text).toContain('shared-label:4mj6b7')
    expect(text).toContain('shared-email:sjdla')
    expect(text).not.toContain('4mj6b7umhtksb17uiuw1fi8yz6pe')
    expect(text).not.toContain('sjdlaqwerty@privaterelay.linux.do')
    expect(text).toContain('settingUser.syncEnabledTitle')
    expect(text).not.toContain('同步状态')
    expect(text).not.toContain('状态：异常')
    expect(text).not.toContain('阻塞：鉴权异常')
    expect(text).not.toContain('队列：7')
    expect(text).not.toContain('错误：E_SYNC')
  })
})

/**
 * The "Nexus 服务地址" block: what the user saves, and what happens to the account session when the
 * address under it changes.
 *
 * A credential is issued by one origin and cannot be replayed at another, so a change that lands
 * has to drop the session — while a save that changed nothing, or one the validator rejected, must
 * not. The block also has to admit when the address it stores is not the one in effect, because the
 * build-time `TUFF_NEXUS_BASE_URL` outranks it and the renderer cannot read that variable.
 */
describe('SettingUser nexus base url', () => {
  beforeEach(() => {
    nexusBaseUrlMock.effectiveUrl = 'https://example.test'
    nexusBaseUrlMock.setUserNexusBaseUrl.mockReset()
    nexusBaseUrlMock.resetUserNexusBaseUrl.mockReset()
    signOutMock.mockReset()
    signOutMock.mockResolvedValue(undefined)
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.info.mockReset()
    appSettingMock.auth.nexusBaseUrl = ''
    authStateMock.isLoggedIn.value = false
  })

  function mountNexusBlock() {
    const wrapper = mountSettingUser()
    const endpoint = wrapper.get('.nexus-endpoint')
    const block = endpoint.element.parentElement
    if (!block) {
      throw new Error('nexus endpoint is not inside a settings block')
    }
    const buttons = endpoint.findAll('.nexus-endpoint__actions button')
    return {
      input: endpoint.get('input'),
      saveButton: buttons[0]!,
      resetButton: buttons[1]!,
      warns: block.querySelector('.nexus-endpoint__warning') !== null,
      description: block.querySelector('[data-testid="slot-description"]')?.textContent ?? '',
      ruleLine: endpoint.text()
    }
  }

  it('applies the address and signs out so the old credential cannot be replayed', async () => {
    nexusBaseUrlMock.setUserNexusBaseUrl.mockResolvedValue({
      ok: true,
      value: 'https://custom.example.test',
      changed: true
    })
    const block = mountNexusBlock()

    await block.input.setValue('https://custom.example.test/')
    await block.saveButton.trigger('click')
    await flushPromises()

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(toastMock.error).not.toHaveBeenCalled()
    expect((block.input.element as HTMLInputElement).value).toBe('https://custom.example.test')
  })

  it('keeps the session when the saved address did not change', async () => {
    appSettingMock.auth.nexusBaseUrl = 'https://custom.example.test'
    nexusBaseUrlMock.effectiveUrl = 'https://custom.example.test'
    nexusBaseUrlMock.setUserNexusBaseUrl.mockResolvedValue({
      ok: true,
      value: 'https://custom.example.test',
      changed: false
    })
    const block = mountNexusBlock()

    await block.saveButton.trigger('click')
    await flushPromises()

    expect(signOutMock).not.toHaveBeenCalled()
    expect(toastMock.info).toHaveBeenCalledTimes(1)
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('reports a rejected address and keeps the session', async () => {
    nexusBaseUrlMock.setUserNexusBaseUrl.mockResolvedValue({
      ok: false,
      error: 'insecure-transport'
    })
    const block = mountNexusBlock()

    await block.input.setValue('http://custom.example.test')
    await block.saveButton.trigger('click')
    await flushPromises()

    expect(signOutMock).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
    // The transport rule is the actionable half of the message; the generic save failure would
    // leave the user with nothing to fix.
    expect(String(toastMock.error.mock.calls[0]?.[0] ?? '')).toContain('https')
  })

  it('names the rule that rejected a malformed address instead of a generic failure', async () => {
    // Both members were added to the shared validation union for this panel to explain; a missing
    // case would fall through to "saving failed", which tells the user nothing they can fix.
    const messages: string[] = []
    for (const error of ['embedded-credentials', 'unsupported-path'] as const) {
      toastMock.error.mockClear()
      nexusBaseUrlMock.setUserNexusBaseUrl.mockResolvedValue({ ok: false, error })
      const block = mountNexusBlock()

      await block.input.setValue('https://custom.example.test/nexus')
      await block.saveButton.trigger('click')
      await flushPromises()

      expect(toastMock.error, error).toHaveBeenCalledTimes(1)
      messages.push(String(toastMock.error.mock.calls[0]?.[0] ?? ''))
    }

    expect(messages[0]).toBeTruthy()
    expect(messages[1]).toBeTruthy()
    expect(messages[0]).not.toBe(messages[1])
    for (const message of messages) {
      expect(message).not.toContain('保存失败')
      expect(message).not.toContain('Saving failed')
    }
  })

  it('clears the address and signs out when the default is restored', async () => {
    appSettingMock.auth.nexusBaseUrl = 'https://custom.example.test'
    nexusBaseUrlMock.resetUserNexusBaseUrl.mockResolvedValue({
      ok: true,
      value: '',
      changed: true
    })
    const block = mountNexusBlock()

    await block.resetButton.trigger('click')
    await flushPromises()

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect((block.input.element as HTMLInputElement).value).toBe('')
  })

  it('tells the user when the sign-out after an address change failed', async () => {
    nexusBaseUrlMock.setUserNexusBaseUrl.mockResolvedValue({
      ok: true,
      value: 'https://custom.example.test',
      changed: true
    })
    signOutMock.mockRejectedValue(new Error('ipc unavailable'))
    const block = mountNexusBlock()

    await block.input.setValue('https://custom.example.test')
    await block.saveButton.trigger('click')
    await flushPromises()

    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(String(toastMock.error.mock.calls[0]?.[0] ?? '').length).toBeGreaterThan(0)
  })

  it('warns and shows the effective origin when the saved address is not in effect', () => {
    appSettingMock.auth.nexusBaseUrl = 'https://saved.example.test'
    nexusBaseUrlMock.effectiveUrl = 'https://example.test'
    const block = mountNexusBlock()

    expect(block.warns).toBe(true)
    expect(block.description).toContain('https://example.test')
    expect(block.description).not.toContain('saved.example.test')
  })

  it('does not warn when the saved address is the one in effect', () => {
    appSettingMock.auth.nexusBaseUrl = 'https://example.test'
    nexusBaseUrlMock.effectiveUrl = 'https://example.test'
    const block = mountNexusBlock()

    expect(block.warns).toBe(false)
    expect(block.ruleLine).toContain('TUFF_NEXUS_BASE_URL')
  })
})
