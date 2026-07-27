// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  hide: vi.fn(),
  step: vi.fn(),
  toastError: vi.fn(),
  loggerError: vi.fn(),
  appSetting: {
    beginner: { init: false, shortcutArmed: false },
    setup: { hideDock: false }
  }
}))

vi.mock('@talex-touch/utils/common/utils', () => ({
  sleep: vi.fn(async () => undefined)
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ hide: mocks.hide })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: mocks.send,
    on: vi.fn(() => vi.fn())
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    emits: ['click'],
    template: '<button type="button"><slot /></button>'
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-sonner', () => ({
  toast: { error: mocks.toastError }
}))

vi.mock('~/assets/lotties/welcome.json', () => ({ default: {} }))
vi.mock('~/components/icon/lotties/LottieFrame.vue', () => ({
  default: { template: '<div />' }
}))
vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))
vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: { value: false } })
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: mocks.loggerError })
}))

import Done from './Done.vue'

describe('onboarding completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appSetting.beginner.init = false
    mocks.appSetting.beginner.shortcutArmed = false
    mocks.appSetting.setup.hideDock = false
    mocks.hide.mockResolvedValue(undefined)
  })

  function mountDone() {
    return mount(Done, {
      global: {
        provide: { step: mocks.step }
      }
    })
  }

  it('persists completion before closing the guide', async () => {
    mocks.send.mockResolvedValue({ success: true, version: 1 })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalledOnce())

    expect(mocks.appSetting.beginner.init).toBe(true)
    expect(mocks.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        persist: true,
        value: expect.objectContaining({
          beginner: expect.objectContaining({ init: true, shortcutArmed: false })
        })
      })
    )
    expect(mocks.step).toHaveBeenCalledWith({ comp: null })
    expect(mocks.hide).toHaveBeenCalledOnce()
  })

  it('does not mutate the admission flag before durable persistence settles', async () => {
    let resolveSave!: (result: { success: boolean; version: number }) => void
    mocks.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledOnce())

    expect(mocks.appSetting.beginner.init).toBe(false)
    expect(mocks.hide).not.toHaveBeenCalled()

    resolveSave({ success: true, version: 1 })
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalledOnce())
    expect(mocks.appSetting.beginner.init).toBe(true)
  })

  it('keeps onboarding open and restores state when persistence is rejected', async () => {
    mocks.send.mockResolvedValue({ success: false, version: 0 })
    const wrapper = mountDone()

    wrapper.findComponent({ name: 'TxButton' }).vm.$emit('click')
    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('beginner.done.persistFailed')
    )

    expect(mocks.appSetting.beginner.init).toBe(false)
    expect(mocks.appSetting.beginner.shortcutArmed).toBe(true)
    expect(mocks.step).not.toHaveBeenCalled()
    expect(mocks.hide).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('beginner.done.persistFailed')
  })
})
