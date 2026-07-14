// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
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
      logout: vi.fn(),
      runSyncBootstrap: vi.fn(),
      authLoadingState
    })
  }
})

const appSettingMock = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({
    auth: {
      useSecureStorage: true,
      secureStorageUserOverridden: false,
      secureStorageReminderShown: false,
      secureStorageUnavailable: false
    },
    security: {
      machineCodeHash: '',
      machineCodeAttestedAt: ''
    },
    dev: {
      advancedSettings: false
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

vi.mock('@talex-touch/utils/common/storage/entity/app-settings', () => ({
  appSettingOriginData: {
    auth: {
      useSecureStorage: true,
      secureStorageUserOverridden: false,
      secureStorageReminderShown: false,
      secureStorageUnavailable: false
    }
  }
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
  getRuntimeNexusBaseUrl: () => 'https://example.test',
  getRuntimeServerMode: () => 'production',
  setRuntimeServerMode: vi.fn()
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
    appSettingMock.auth.useSecureStorage = true
    appSettingMock.auth.secureStorageUserOverridden = false
    appSettingMock.auth.secureStorageReminderShown = false
    appSettingMock.auth.secureStorageUnavailable = false
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

  it('renders shared compact account labels and sync status when advanced settings are disabled', async () => {
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
    expect(text).toContain('同步状态')
    expect(text).toContain('状态：异常')
    expect(text).toContain('阻塞：鉴权异常')
    expect(text).toContain('队列：7')
    expect(text).toContain('错误：E_SYNC')
  })
})
