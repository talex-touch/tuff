// @vitest-environment jsdom
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PluginInfo from './PluginInfo.vue'

const routerMocks = vi.hoisted(() => ({
  useRoute: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRoute: routerMocks.useRoute
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxSplitButton: {
    name: 'TxSplitButton',
    template: '<button type="button"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/dialog', () => ({
  TxBottomDialog: {
    name: 'TxBottomDialog',
    template: '<div />'
  }
}))

vi.mock('@talex-touch/tuffex/tabs', () => ({
  TxTabs: {
    name: 'TxTabs',
    props: ['modelValue'],
    template: '<output data-testid="tabs-model">{{ modelValue }}</output>'
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
  useAppSdk: () => ({
    openExternal: vi.fn()
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: vi.fn()
  })
}))

vi.mock('~/composables/plugin/usePluginExternalLinks', () => ({
  usePluginExternalLinks: () => ({
    nexusPublishUrl: { value: null }
  })
}))

vi.mock('~/modules/hooks/useStartupInfo', () => ({
  useStartupInfo: () => ({
    startupInfo: { value: { isDev: false } }
  })
}))

vi.mock('~/modules/sdk/plugin-sdk', () => ({
  pluginSDK: {
    disable: vi.fn(),
    enable: vi.fn(),
    openFolder: vi.fn(),
    reconnectDevServer: vi.fn(),
    reload: vi.fn(),
    uninstall: vi.fn()
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn()
  })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

const route = reactive({
  path: '/plugin/touch-intelligence',
  params: {},
  query: {} as Record<string, string | string[] | undefined>
})

function createPlugin(name: string): ITouchPlugin {
  return {
    name,
    version: '1.0.0',
    desc: `${name} plugin`,
    icon: { type: 'class', value: 'i-ri-apps-line' },
    dev: { enable: false },
    pluginPath: `/plugins/${name}`,
    logger: {},
    features: [],
    issues: [],
    addFeature: vi.fn(),
    delFeature: vi.fn(),
    getFeature: vi.fn()
  } as unknown as ITouchPlugin
}

function mountPlugin(plugin = createPlugin('touch-intelligence')) {
  return mount(PluginInfo, {
    props: { plugin },
    global: {
      stubs: {
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
    }
  })
}

function selectedTab(wrapper: ReturnType<typeof mount>): string {
  return wrapper.get('[data-testid="tabs-model"]').text()
}

describe('PluginInfo permission deep links', () => {
  beforeEach(() => {
    route.path = '/plugin/touch-intelligence'
    route.params = {}
    route.query = {}
    routerMocks.useRoute.mockReturnValue(route)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('selects the Permissions TxTabs model for the touch-intelligence deep link', async () => {
    route.query = { tab: 'Permissions' }

    const wrapper = mountPlugin()
    await nextTick()

    expect(selectedTab(wrapper)).toBe('Permissions')
    wrapper.unmount()
  })

  it('falls back to Overview when the deep-link tab is not supported', async () => {
    route.query = { tab: 'UnknownTab' }

    const wrapper = mountPlugin()
    await nextTick()

    expect(selectedTab(wrapper)).toBe('Overview')
    wrapper.unmount()
  })

  it('resets to Overview when navigating to a different plugin without a tab query', async () => {
    route.query = { tab: 'Permissions' }
    const wrapper = mountPlugin()
    await nextTick()
    expect(selectedTab(wrapper)).toBe('Permissions')

    route.path = '/plugin/clipboard-history'
    route.query = {}
    await wrapper.setProps({ plugin: createPlugin('clipboard-history') })

    expect(selectedTab(wrapper)).toBe('Overview')
    wrapper.unmount()
  })
})
