import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProviderConfigModal from './src/components/ProviderConfigModal.vue'

const sdkMocks = vi.hoisted(() => ({
  secret: {
    health: vi.fn(),
  },
}))

vi.mock('@talex-touch/utils/plugin/sdk', () => ({
  usePluginSecret: () => sdkMocks.secret,
}))

describe('ProviderConfigModal secret storage gate', () => {
  beforeEach(() => {
    sdkMocks.secret.health.mockReset()
  })

  it('blocks secret provider saves when secure storage is unavailable', async () => {
    sdkMocks.secret.health.mockResolvedValue({
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'secure-store-unavailable',
    })

    const wrapper = mount(ProviderConfigModal, {
      global: {
        stubs: {
          Teleport: true,
          Transition: false,
        },
      },
      props: {
        show: true,
        provider: {
          id: 'tencent',
          name: 'Tencent Translate',
          enabled: true,
          config: {
            apiUrl: 'https://tmt.tencentcloudapi.com',
            region: 'ap-shanghai',
            secretId: 'next-id',
            secretKey: 'next-key',
          },
        } as any,
      },
    })

    const saveButton = wrapper.findAll('button').find(button => button.text() === '保存')
    expect(saveButton).toBeDefined()

    await saveButton!.trigger('click')
    await vi.dynamicImportSettled()

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.text()).toContain('secure-store-unavailable')
  })
})
