// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTING_CATEGORIES } from '~/modules/settings/categories'
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

vi.mock('~/components/base/template/ViewTemplate.vue', () => ({
  default: {
    name: 'ViewTemplate',
    props: ['title'],
    template: '<main><slot /></main>'
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

  it('keeps storage reachable when advanced settings are disabled', () => {
    // Storage used to hang off the legacy single-page settings view behind a link row. It is now
    // a first-class category, so no `advancedSettings` branch can hide it.
    expect(rendererState.appSetting.dev.advancedSettings).toBe(false)

    const storage = SETTING_CATEGORIES.find((category) => category.key === 'storage-usage')

    expect(storage).toBeDefined()
    expect(storage?.group).toBe('system')
    expect(storage?.path).toBe('/setting/storage-usage')
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
