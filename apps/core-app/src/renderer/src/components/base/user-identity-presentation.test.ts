// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TuffUserInfo from './TuffUserInfo.vue'
import UserProfileEditor from './UserProfileEditor.vue'
import SettingUser from '~/views/base/settings/SettingUser.vue'

const authMock = vi.hoisted(() => {
  const { computed, ref } = require('vue') as typeof import('vue')
  const user = ref<Record<string, string> | null>(null)
  const isLoggedIn = ref(false)
  const authLoadingState = {
    isLoggingIn: false,
    isSigningIn: false,
    isSigningUp: false,
    isSigningOut: false,
    loginProgress: 0,
    loginTimeRemaining: 0,
    loginStage: 'idle',
    loginAuthorizeUrl: '',
    loginUserCode: '',
    loginExpiresAt: '',
    loginBrowserOpenFailed: false
  }
  const getDisplayName = () => {
    const name = user.value?.name?.trim()
    if (name) return name
    const email = user.value?.email?.trim()
    if (!email) return ''
    return email.split('@')[0]?.trim() || email
  }

  return {
    user,
    isLoggedIn,
    authLoadingState,
    useAuth: () => ({
      isLoggedIn: computed(() => isLoggedIn.value),
      user,
      getDisplayName,
      getPrimaryEmail: () => user.value?.email || '',
      getUserBio: () => user.value?.bio || '',
      updateUserProfile: vi.fn(),
      updateUserAvatar: vi.fn(),
      openLoginSettings: vi.fn(),
      requestStepUp: vi.fn(),
      loginWithBrowser: vi.fn(),
      reopenBrowserLogin: vi.fn(),
      cancelPendingBrowserLogin: vi.fn(),
      logout: vi.fn(),
      runSyncBootstrap: vi.fn(),
      authLoadingState
    })
  }
})

const fetchNexusWithAuthMock = vi.hoisted(() => vi.fn())

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key)
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: authMock.useAuth
}))

vi.mock('~/modules/store/nexus-auth-client', () => ({
  fetchNexusWithAuth: fetchNexusWithAuthMock
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ openExternal: vi.fn() })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: vi.fn().mockResolvedValue({
      backend: 'local-secret',
      available: true,
      degraded: false,
      reason: ''
    })
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
  isDevEnv: () => false
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
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
  }
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
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.test',
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

const stubs = {
  TxButton: {
    template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
    emits: ['click']
  },
  TxSpinner: true,
  TxTabs: {
    template: '<div class="tabs"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue']
  },
  TxTabItem: {
    template: '<section class="tab-item"><slot name="name" /><slot /></section>',
    props: ['name']
  },
  FlipDialog: {
    template:
      '<section v-if="modelValue" class="flip-dialog" :data-open="String(modelValue)"><slot /></section>',
    props: ['modelValue', 'reference', 'headerTitle'],
    emits: ['update:modelValue']
  },
  UserProfileEditor: true,
  TuffInput: {
    template:
      "<component :is=\"type === 'textarea' ? 'textarea' : 'input'\" :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />",
    props: ['modelValue', 'type'],
    emits: ['update:modelValue']
  },
  TuffGroupBlock: {
    template: '<section class="group-block"><slot /></section>'
  },
  TuffBlockSlot: {
    name: 'TuffBlockSlot',
    template:
      '<article class="block-slot"><div class="block-icon"><slot name="icon" /></div><strong>{{ title }}</strong><small>{{ description }}</small><slot /><slot name="tags" /></article>',
    props: ['title', 'description']
  },
  TuffBlockSwitch: true,
  CreditsSummaryBlock: true,
  TModal: {
    template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>',
    props: ['modelValue', 'title'],
    emits: ['update:modelValue']
  },
  TxModal: {
    template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>',
    props: ['modelValue', 'title'],
    emits: ['update:modelValue']
  }
}
let mountedWrappers: Array<{ unmount: () => void }> = []

function trackMount<T extends { unmount: () => void }>(wrapper: T): T {
  mountedWrappers.push(wrapper)
  return wrapper
}

function mountCompact() {
  return trackMount(mount(TuffUserInfo, { global: { stubs } }))
}

function mountEditor() {
  return trackMount(mount(UserProfileEditor, { props: { visible: false }, global: { stubs } }))
}

function mountSettings() {
  return trackMount(mount(SettingUser, { global: { stubs } }))
}

function installAccountFetch() {
  fetchNexusWithAuthMock.mockImplementation((path: string) => {
    if (path === '/api/subscription/status') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          plan: authMock.user.value?.plan || 'FREE',
          expiresAt: null,
          activatedAt: null,
          features: {
            aiRequests: { limit: 0, used: 0 },
            aiTokens: { limit: 0, used: 0 },
            customModels: false,
            prioritySupport: false,
            apiAccess: false
          }
        })
      })
    }
    return Promise.resolve({ ok: true, json: async () => [] })
  })
}

describe('user identity presentation', () => {
  beforeEach(() => {
    authMock.user.value = null
    authMock.isLoggedIn.value = false
    fetchNexusWithAuthMock.mockReset()
    installAccountFetch()
    mountedWrappers = []
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers) {
      wrapper.unmount()
    }
    mountedWrappers = []
  })

  it('renders the resolved name, raw email, bio, and avatar consistently across user surfaces', async () => {
    authMock.isLoggedIn.value = true
    authMock.user.value = {
      id: 'ada-id',
      name: '  Ada Lovelace  ',
      email: 'ada@example.test',
      bio: 'First programmer',
      avatar: 'https://images.example.test/ada.png'
    }

    const compact = mountCompact()
    const editor = mountEditor()
    const settings = mountSettings()
    await editor.setProps({ visible: true })
    await compact.get('.FlatUserInfo').trigger('click')
    await flushPromises()
    expect(compact.get('.flip-dialog').attributes('data-open')).toBe('true')
    expect(compact.get('.user-name').text()).toBe('Ada Lovelace')
    expect(compact.get('.user-email').text()).toBe('ada@example.test')
    expect(compact.get('.avatar-image').attributes('src')).toBe(
      'https://images.example.test/ada.png'
    )
    expect(compact.get('.UserProfile-MetaText').text()).toBe('User ID: ada-id')
    expect(compact.text()).toContain('First programmer')

    expect(editor.get('.UserProfileEditor-Name').text()).toBe('Ada Lovelace')
    expect(editor.get('.UserProfileEditor-Email').text()).toBe('ada@example.test')
    expect(editor.get('.avatar-image').attributes('src')).toBe(
      'https://images.example.test/ada.png'
    )

    const settingsIdentity = settings.getComponent({ name: 'TuffBlockSlot' })
    expect(settingsIdentity.props('title')).toBe('Ada Lovelace')
    expect(settingsIdentity.props('description')).toBe('ada@example.test')
    expect(settings.get('.user-avatar-image').attributes('src')).toBe(
      'https://images.example.test/ada.png'
    )
  })

  it('uses the email alias before unknown identity and only shows an initial when no avatar exists', async () => {
    authMock.isLoggedIn.value = true
    authMock.user.value = { email: 'orbit.user@example.test' }

    const compact = mountCompact()
    const editor = mountEditor()
    const settings = mountSettings()

    for (const wrapper of [compact, editor, settings]) {
      expect(wrapper.text()).toContain('orbit.user')
      expect(wrapper.text()).toContain('orbit.user@example.test')
      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.text()).toContain('O')
    }

    authMock.user.value = {}
    await nextTick()

    expect(compact.get('.avatar-placeholder').text()).toBe('?')
    expect(editor.get('.avatar-placeholder').text()).toBe('?')
    expect(settings.get('.user-avatar-placeholder').text()).toBe('?')
  })

  it('drops a signed-out account snapshot and loads the next account after login', async () => {
    authMock.isLoggedIn.value = true
    authMock.user.value = {
      id: 'first-account',
      name: 'First Account',
      email: 'first@example.test',
      plan: 'FREE'
    }
    const compact = mountCompact()

    await compact.get('.FlatUserInfo').trigger('click')
    await flushPromises()
    expect(compact.get('.flip-dialog').attributes('data-open')).toBe('true')
    expect(compact.get('.UserProfile-TopPlanValue').text()).toBe('Free')

    authMock.isLoggedIn.value = false
    await nextTick()
    expect(compact.find('.flip-dialog').exists()).toBe(false)
    expect(compact.text()).not.toContain('First Account')

    authMock.user.value = {
      id: 'second-account',
      name: 'Second Account',
      email: 'second@example.test',
      plan: 'PRO'
    }
    authMock.isLoggedIn.value = true
    await nextTick()
    await compact.get('.FlatUserInfo').trigger('click')
    await flushPromises()
    expect(compact.get('.flip-dialog').attributes('data-open')).toBe('true')

    expect(compact.get('.UserProfile-Name').text()).toBe('Second Account')
    expect(compact.get('.UserProfile-TopPlanValue').text()).toBe('Pro')
  })
})
