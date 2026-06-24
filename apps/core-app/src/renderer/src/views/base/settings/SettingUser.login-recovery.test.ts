// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
  const { computed, reactive, ref } = require('vue') as typeof import('vue')
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
  return {
    authLoadingState,
    isLoggedIn,
    useAuth: () => ({
      isLoggedIn: computed(() => isLoggedIn.value),
      user: computed(() => null),
      getDisplayName: () => '',
      getPrimaryEmail: () => '',
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
  const { reactive } = require('vue') as typeof import('vue')
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

vi.mock('vue-sonner', () => ({
  toast: toastMock
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'settingUser.loginDialogWaitingTitle': '请在浏览器中完成登录',
        'settingUser.loginDialogWaitingDesc': `已打开授权页面。如页面未打开或已关闭，可以重新打开。剩余 ${String(params?.seconds ?? '')} 秒。`,
        'settingUser.loginDialogBrowserOpenFailedWithCode': `系统浏览器未自动打开，登录会话仍在等待。请复制登录链接到浏览器继续授权；短码：${String(params?.code ?? '')}。`,
        'settingUser.copyLoginLink': '复制登录链接',
        'settingUser.copyLoginCode': '复制短码',
        'settingUser.reopenLogin': '重新打开',
        'settingUser.cancelLogin': '取消登录',
        'settingUser.retryLogin': '重试',
        'settingUser.loginDialogFailedTitle': '登录失败',
        'settingUser.loginDialogFailedDesc': '无法完成账户授权，请重试。',
        'common.close': '关闭'
      }
      return messages[key] ?? key
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

vi.mock('@talex-touch/utils/env', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  isDevEnv: () => false
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: appSettingMock
}))

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: authStateMock.useAuth
}))

vi.mock('~/modules/auth/sync-preferences', () => ({
  getSyncPreferenceState: () => ({
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
  }),
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
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSlot: {
          template: '<div><span>{{ title }}</span><slot /><slot name="tags" /></div>',
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
})
