// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppSettings from '../base/settings/AppSettings.vue'
import Storagable from './Storagable.vue'

const rendererState = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof import('vue')
  return {
    appSetting: reactive({
      dev: { advancedSettings: false }
    }),
    route: reactive({
      query: {} as Record<string, string | undefined>
    }),
    transportSend: vi.fn()
  }
})

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: rendererState.appSetting
}))

vi.mock('vue-router', () => ({
  useRoute: () => rendererState.route,
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isWindows: false })
}))

vi.mock('~/components/base/template/ViewTemplate.vue', () => ({
  default: {
    name: 'ViewTemplate',
    props: ['title'],
    template: '<main><slot /></main>'
  }
}))

vi.mock('../base/settings/SettingHeader.vue', () => ({
  default: { name: 'SettingHeader', template: '<div />' }
}))
vi.mock('../base/settings/SettingAssistant.vue', () => ({
  default: { name: 'SettingAssistant', template: '<div />' }
}))
vi.mock('../base/settings/SettingLanguage.vue', () => ({
  default: { name: 'SettingLanguage', template: '<div />' }
}))
vi.mock('../base/settings/SettingSetup.vue', () => ({
  default: { name: 'SettingSetup', template: '<div />' }
}))
vi.mock('../base/settings/SettingTools.vue', () => ({
  default: { name: 'SettingTools', template: '<div />' }
}))
vi.mock('../base/settings/SettingUser.vue', () => ({
  default: { name: 'SettingUser', template: '<div />' }
}))
vi.mock('../base/settings/SettingAbout.vue', () => ({
  default: { name: 'SettingAbout', template: '<div />' }
}))
vi.mock('../base/settings/SettingDownload.vue', () => ({
  default: { name: 'SettingDownload', template: '<div />' }
}))
vi.mock('../base/settings/SettingEverything.vue', () => ({
  default: { name: 'SettingEverything', template: '<div />' }
}))
vi.mock('../base/settings/SettingFileIndex.vue', () => ({
  default: { name: 'SettingFileIndex', template: '<div />' }
}))
vi.mock('../base/settings/SettingNetwork.vue', () => ({
  default: { name: 'SettingNetwork', template: '<div />' }
}))
vi.mock('../base/settings/SettingSentry.vue', () => ({
  default: { name: 'SettingSentry', template: '<div />' }
}))
vi.mock('../base/settings/SettingUpdate.vue', () => ({
  default: { name: 'SettingUpdate', template: '<div />' }
}))

vi.mock('../base/settings/SettingStorage.vue', () => ({
  default: {
    name: 'SettingStorage',
    template: '<nav data-testid="setting-storage-navigation" />'
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: rendererState.transportSend })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

const storageReport = {
  generatedAt: 1,
  rootPath: '/synthetic/storage-root',
  totalBytes: 0,
  totalSource: 'modules',
  modules: [],
  plugins: [],
  database: {
    path: '/synthetic/database.db',
    bytes: 0,
    walBytes: 0,
    shmBytes: 0,
    tables: [],
    tablesLoaded: true
  },
  caches: []
}

const commonStubs = {
  ViewTemplate: {
    props: ['title'],
    template: '<main><slot /></main>'
  },
  TxButton: {
    props: ['disabled'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  },
  TxBottomDialog: { template: '<div />' }
}

describe('Privacy & Data settings placement', () => {
  beforeEach(() => {
    rendererState.appSetting.dev.advancedSettings = false
    rendererState.route.query = {}
    rendererState.transportSend.mockReset()
    rendererState.transportSend.mockResolvedValue(structuredClone(storageReport))
  })

  it('keeps the storage navigation visible when advanced settings are disabled', async () => {
    const wrapper = mount(AppSettings, {
      global: {
        directives: { wave: {} },
        stubs: {
          ...commonStubs,
          SettingHeader: { template: '<div />' },
          SettingUser: { template: '<div />' },
          SettingLanguage: { template: '<div />' },
          SettingSetup: { template: '<div />' },
          SettingTools: { template: '<div />' },
          SettingAssistant: { template: '<div />' },
          SettingAbout: { template: '<div />' },
          SettingDownload: { template: '<div />' },
          SettingEverything: { template: '<div />' },
          SettingFileIndex: { template: '<div />' },
          SettingNetwork: { template: '<div />' },
          SettingSentry: { template: '<div />' },
          SettingUpdate: { template: '<div />' },
          SettingStorage: {
            template: '<nav data-testid="setting-storage-navigation" />'
          }
        }
      }
    })

    await flushPromises()

    expect(wrapper.find('[data-testid="setting-storage-navigation"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('mounts one page-owned PrivacyDataSection directly in the storage page container', async () => {
    const wrapper = mount(Storagable, {
      global: {
        stubs: {
          ...commonStubs,
          PrivacyDataSection: {
            template: '<section data-testid="privacy-data-section-stub" />'
          }
        }
      }
    })

    await flushPromises()

    const sections = wrapper.findAll('[data-testid="privacy-data-section-stub"]')
    expect(sections).toHaveLength(1)
    expect(sections[0].element.parentElement?.classList.contains('Storagable-Container')).toBe(true)
    expect(sections[0].element.closest('.card')).toBeNull()
    wrapper.unmount()
  })

  it('does not retain legacy raw cleanup channels for Privacy-owned data', () => {
    const sourcePath = path.resolve(process.cwd(), 'src/renderer/src/views/storage/Storagable.vue')
    const source = readFileSync(sourcePath, 'utf8')

    for (const channel of [
      'storage:cleanup:logs',
      'storage:cleanup:temp',
      'storage:cleanup:clipboard',
      'storage:cleanup:ocr',
      'storage:cleanup:analytics',
      'storage:cleanup:usage',
      'storage:cleanup:intelligence'
    ]) {
      expect(source).not.toContain(channel)
    }
  })
})
