// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  step: vi.fn(),
  appSetting: {
    setup: {
      fileAccess: false,
      fileAccessRootKey: '',
      autoStart: false,
      showTray: true,
      hideDock: false,
      lastPermissionAudit: { at: 0, version: '', appUpdate: false, missing: [] }
    }
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'loading', 'type'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/switch', () => ({
  TxSwitch: {
    name: 'TxSwitch',
    props: ['modelValue'],
    emits: ['change', 'update:modelValue'],
    template: '<input type="checkbox" />'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn() }
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: vi.fn() })
}))

vi.mock('./Done.vue', () => ({
  default: { name: 'Done', template: '<div />' }
}))

import SetupPermissions from './SetupPermissions.vue'

describe('onboarding setup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appSetting.setup.fileAccess = false
    mocks.appSetting.setup.fileAccessRootKey = ''
    mocks.send.mockResolvedValue(false)
    mocks.step.mockImplementation((_call, onDone?: () => void) => onDone?.())
  })

  async function mountPermissions() {
    const wrapper = mount(SetupPermissions, {
      global: {
        provide: { step: mocks.step }
      }
    })
    await flushPromises()
    return wrapper
  }

  it('does not render file access actions', async () => {
    const wrapper = await mountPermissions()

    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('setupPermissions.grantFileAccess')
    expect(wrapper.text()).not.toContain('setupPermissions.skipForNow')
  })

  it('advances without changing existing file access metadata', async () => {
    mocks.appSetting.setup.fileAccess = true
    mocks.appSetting.setup.fileAccessRootKey = 'home'
    const wrapper = await mountPermissions()

    await wrapper.find('button').trigger('click')

    expect(mocks.step).toHaveBeenCalledOnce()
    expect(mocks.appSetting.setup.fileAccess).toBe(true)
    expect(mocks.appSetting.setup.fileAccessRootKey).toBe('home')
  })
})
