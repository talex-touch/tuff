// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  step: vi.fn(),
  check: vi.fn(),
  request: vi.fn(),
  openSettings: vi.fn(),
  roots: { __v_isRef: true, value: [{ key: 'home', required: true, status: 'unknown' }] },
  isGranted: { __v_isRef: true, value: false },
  isDenied: { __v_isRef: true, value: false },
  isChecking: { __v_isRef: true, value: false },
  isRequesting: { __v_isRef: true, value: false },
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

vi.mock('~/components/permission/FileAccessCard.vue', () => ({
  default: { name: 'FileAccessCard', template: '<div />' }
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

vi.mock('~/modules/system/system-permission-roots', () => ({
  createRequiredFileAccessRootKey: (roots: Array<{ key: string }>) =>
    roots.map((root) => root.key).join('|')
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: vi.fn() })
}))

vi.mock('~/composables/useFileAccessPermission', () => ({
  useFileAccessPermission: () => ({
    roots: mocks.roots,
    isGranted: mocks.isGranted,
    isDenied: mocks.isDenied,
    isChecking: mocks.isChecking,
    isRequesting: mocks.isRequesting,
    check: mocks.check,
    request: mocks.request,
    openSettings: mocks.openSettings
  })
}))

vi.mock('~/composables/usePermissionAutoRefresh', () => ({
  usePermissionAutoRefresh: vi.fn()
}))

vi.mock('./Done.vue', () => ({
  default: { name: 'Done', template: '<div />' }
}))

import SetupPermissions from './SetupPermissions.vue'

describe('onboarding file access outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isGranted.value = false
    mocks.isDenied.value = false
    mocks.isChecking.value = false
    mocks.isRequesting.value = false
    mocks.appSetting.setup.fileAccess = false
    mocks.appSetting.setup.fileAccessRootKey = ''
    mocks.appSetting.setup.hideDock = false
    mocks.send.mockResolvedValue(false)
    mocks.check.mockResolvedValue(undefined)
    mocks.request.mockResolvedValue(undefined)
    mocks.openSettings.mockResolvedValue(undefined)
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

  it('routes a denied permission to system settings without advancing', async () => {
    mocks.isDenied.value = true
    const wrapper = await mountPermissions()
    const primary = wrapper.findAll('button').at(-1)!

    await primary.trigger('click')

    expect(mocks.openSettings).toHaveBeenCalledOnce()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.step).not.toHaveBeenCalled()
  })

  it('allows skipping without recording a false grant', async () => {
    const wrapper = await mountPermissions()
    const [skip] = wrapper.findAll('button')

    await skip!.trigger('click')

    expect(mocks.step).toHaveBeenCalledOnce()
    expect(mocks.appSetting.setup.fileAccess).toBe(false)
    expect(mocks.appSetting.setup.fileAccessRootKey).toBe('')
  })

  it('uses the enabled hide Dock default when the stored field is missing', async () => {
    delete (mocks.appSetting.setup as { hideDock?: boolean }).hideDock
    const wrapper = await mountPermissions()
    const [skip] = wrapper.findAll('button')

    await skip!.trigger('click')

    expect(mocks.appSetting.setup.hideDock).toBe(true)
  })

  it('advances directly after a successful grant and records the observed roots', async () => {
    mocks.isGranted.value = true
    const wrapper = await mountPermissions()
    const primary = wrapper.find('button')

    await primary.trigger('click')

    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.step).toHaveBeenCalledOnce()
    expect(mocks.appSetting.setup.fileAccess).toBe(true)
    expect(mocks.appSetting.setup.fileAccessRootKey).toBe('home')
  })

  it('prevents skipping while a permission check is in flight', async () => {
    mocks.isChecking.value = true
    const wrapper = await mountPermissions()
    const [skip] = wrapper.findAll('button')

    expect(skip!.attributes('disabled')).toBeDefined()
    await skip!.trigger('click')
    expect(mocks.step).not.toHaveBeenCalled()
  })
})
