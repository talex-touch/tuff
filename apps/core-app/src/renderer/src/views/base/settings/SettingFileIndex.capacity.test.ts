// @vitest-environment jsdom
import type { SettingsSdk } from '@talex-touch/utils/transport/sdk/domains/settings'
import type {
  FileIndexContentSettings,
  FileIndexStorage
} from '@talex-touch/utils/transport/events/types'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { createSettingsSdk } from '@talex-touch/utils/transport/sdk/domains/settings'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import en from '~/modules/lang/en-US.json'
import SettingFileIndex from './SettingFileIndex.vue'

// Only host/storage boundaries and unrelated child surfaces are replaced. The real
// SettingsSdk projector, page setup, save flow, status refresh, and localized copy run.
const host = vi.hoisted(() => ({ sdk: undefined as SettingsSdk | undefined }))
vi.mock('@talex-touch/utils/renderer', () => ({ useSettingsSdk: () => host.sdk }))
vi.mock('~/modules/storage/app-storage', () => ({ appSetting: { dev: { developerMode: false } } }))
vi.mock('~/modules/mention/dialog-mention', () => ({ popperMention: () => undefined }))
vi.mock('~/components/base/dialog/FlipDialog.vue', () => ({
  default: { name: 'FlipDialog', template: '<div />' }
}))
vi.mock('~/components/tuff/TuffBlockInput.vue', () => ({
  default: { name: 'TuffBlockInput', template: '<div />' }
}))
vi.mock('~/components/tuff/TuffBlockSlot.vue', () => ({
  default: { name: 'TuffBlockSlot', template: '<div />' }
}))
vi.mock('~/components/tuff/TuffBlockSwitch.vue', () => ({
  default: { name: 'TuffBlockSwitch', template: '<div />' }
}))
vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: { name: 'TuffGroupBlock', template: '<div />' }
}))
vi.mock('./components/FailedFilesListDialog.vue', () => ({
  default: { name: 'FailedFilesListDialog', template: '<div />' }
}))
vi.mock('./components/RebuildConfirmDialog.vue', () => ({
  default: { name: 'RebuildConfirmDialog', template: '<div />' }
}))
vi.mock('./SettingFileIndexAppDiagnostic.vue', () => ({
  default: { name: 'SettingFileIndexAppDiagnostic', template: '<div />' }
}))

const GIB = 1024 ** 3
const SECRET_PATH = '/synthetic/private-volume/index.sqlite'
const mounted: VueWrapper[] = []
const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': en } })
const stubs = {
  TuffGroupBlock: { template: '<section><slot /></section>' },
  TuffBlockSlot: {
    props: ['title', 'description'],
    template: '<article><strong>{{ title }}</strong><p>{{ description }}</p><slot /></article>'
  },
  TuffBlockSwitch: {
    props: ['modelValue', 'title', 'description', 'loading'],
    emits: ['update:modelValue', 'change'],
    // TxSwitch is a controlled button, not a native checkbox whose checked
    // property mutates before Vue accepts or rejects the requested change.
    template: `<label>{{ title }}<p>{{ description }}</p><button type="button" role="switch" :aria-label="title" :aria-checked="modelValue" :disabled="loading" @click="$emit('update:modelValue', !modelValue); $emit('change', !modelValue)"></button></label>`
  },
  FlipDialog: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: `<div v-if="modelValue" role="dialog"><slot :close="() => $emit('update:modelValue', false)" /></div>`
  },
  TxButton: { template: '<button type="button"><slot /></button>' },
  TxAlert: {
    props: ['title', 'type'],
    template: '<aside :data-tone="type"><strong>{{ title }}</strong><slot /></aside>'
  },
  TxDrawer: true,
  TxPopover: true,
  TxInput: true
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  vi.spyOn(toast, 'warning').mockImplementation(() => 'warning-id')
  vi.spyOn(toast, 'success').mockImplementation(() => 'success-id')
  vi.spyOn(toast, 'error').mockImplementation(() => 'error-id')
})

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  host.sdk = undefined
  vi.clearAllTimers()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function mountSettings(
  initial: FileIndexContentSettings,
  updated = initial,
  updateError?: Error,
  indexStorage?: FileIndexStorage,
  capacityHorizon?: number
) {
  let snapshot = initial
  let progress: (() => void) | undefined
  let cancelled = false
  const transport = {
    send: async (event: unknown) => {
      if (event === AppEvents.fileIndex.settingsGet) return snapshot
      if (event === AppEvents.fileIndex.settingsUpdate) {
        if (updateError) throw updateError
        snapshot = updated
        return snapshot
      }
      if (event === AppEvents.fileIndex.status)
        return {
          isInitializing: false,
          initializationFailed: false,
          contentIndexingEnabled: snapshot.contentIndexingEnabled,
          contentIndexingState: snapshot.state,
          contentIndexStorage: snapshot.storage,
          indexStorage,
          capacityHorizon,
          progress: { stage: 'idle', current: 0, total: 0 }
        }
      if (event === AppEvents.fileIndex.stats)
        return { totalFiles: 4, completedFiles: 4, failedFiles: 0, skippedFiles: 0 }
      throw new Error('Unexpected settings transport event')
    },
    on: () => () => undefined,
    stream: async (
      _event: unknown,
      _request: unknown,
      options: { onData?: (data: unknown) => void }
    ) => {
      progress = () => options.onData?.({ stage: 'idle', current: 0, total: 0 })
      return {
        streamId: 'capacity-progress',
        cancelled: false,
        cancel: () => {
          cancelled = true
        }
      }
    }
  }
  // This in-process fixture implements only the transport methods the settings SDK exercises.
  const settingsTransport = transport as unknown as Parameters<typeof createSettingsSdk>[0]
  host.sdk = createSettingsSdk(settingsTransport)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
  const wrapper = shallowMount(SettingFileIndex, { global: { plugins: [i18n, router], stubs } })
  mounted.push(wrapper)
  await flushPromises()
  return {
    wrapper,
    refresh: async (next: FileIndexContentSettings) => {
      snapshot = next
      progress?.()
      await flushPromises()
    },
    isCancelled: () => cancelled
  }
}

function contentSwitch(wrapper: VueWrapper) {
  return wrapper.find(
    `button[role="switch"][aria-label="${i18n.global.t('settings.settingFileIndex.contentIndexTitle')}"]`
  )
}

function paused(status: 'low-space' | 'index-full' | 'unavailable'): FileIndexContentSettings {
  return {
    contentIndexingEnabled: true,
    state: 'paused',
    storage: {
      status,
      availableBytes:
        status === 'low-space' ? 1.125 * GIB : status === 'index-full' ? 20 * GIB : null,
      requiredBytes: 3 * GIB,
      checkedAt: 1234,
      ...{ path: SECRET_PATH, error: 'private-token ENOSPC' }
    }
  }
}

describe('SettingFileIndex capacity feedback', () => {
  it.each(['low-space', 'unavailable'] as const)(
    'shows a %s warning while preserving the checked opt-in, not a generic failure',
    async (status) => {
      const { wrapper } = await mountSettings(paused(status))
      expect(contentSwitch(wrapper).attributes('aria-checked')).toBe('true')
      const warning = wrapper.find('[role="status"]')
      expect(warning.attributes('data-tone')).toBe('warning')
      const reason = i18n.global.t(
        `settings.settingFileIndex.${status === 'low-space' ? 'contentIndexStorageLow' : 'contentIndexStorageUnavailable'}`
      )
      expect(warning.text()).toContain(reason)
      if (status === 'low-space') expect(warning.text()).toContain('1.13')
      else
        expect(warning.text()).toContain(
          i18n.global.t('settings.settingFileIndex.contentIndexSpaceUnknown')
        )
      expect(warning.text()).toContain('3')
      expect(wrapper.text()).not.toContain(SECRET_PATH)
      expect(wrapper.text()).not.toContain('private-token')
      expect(toast.error).not.toHaveBeenCalled()
      expect(toast.success).not.toHaveBeenCalled()
    }
  )

  it('shows index-full pause feedback instead of misreporting insufficient disk space', async () => {
    const { wrapper } = await mountSettings(paused('index-full'), paused('index-full'), undefined, {
      fileBytes: Math.round(7.95 * GIB),
      maxBytes: 8 * GIB,
      resetFromBytes: null
    })
    expect(contentSwitch(wrapper).attributes('aria-checked')).toBe('true')
    const warning = wrapper.find('[role="status"]')
    expect(warning.attributes('data-tone')).toBe('warning')
    expect(warning.text()).toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageIndexFull')
    )
    expect(warning.text()).toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageIndexFullRecovery')
    )
    expect(warning.text()).toContain('7.95')
    expect(warning.text()).toContain('8')
    expect(warning.text()).not.toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageLow')
    )
    expect(wrapper.text()).not.toContain(SECRET_PATH)
    expect(wrapper.text()).not.toContain('private-token')
  })

  it('shows fallback index-full summary when indexStorage bytes are not available', async () => {
    const { wrapper } = await mountSettings(paused('index-full'))
    const warning = wrapper.find('[role="status"]')
    expect(warning.attributes('data-tone')).toBe('warning')
    expect(warning.text()).toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageIndexFull')
    )
    expect(warning.text()).toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageIndexFullSummaryUnknown')
    )
    expect(warning.text()).not.toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageLow')
    )
  })

  it.each([
    { name: 'paused low space', response: paused('low-space'), tone: 'warning' },
    { name: 'paused index full', response: paused('index-full'), tone: 'warning' },
    { name: 'paused unavailable', response: paused('unavailable'), tone: 'warning' },
    {
      name: 'admitted',
      response: {
        contentIndexingEnabled: true,
        state: 'idle',
        storage: {
          status: 'ready',
          availableBytes: 4 * GIB,
          requiredBytes: 2 * GIB,
          checkedAt: 1234
        }
      } as FileIndexContentSettings,
      tone: 'success'
    }
  ])(
    'reports $name from the enable response instead of falsely claiming indexing started',
    async ({ response, tone }) => {
      const { wrapper } = await mountSettings(
        { contentIndexingEnabled: false, state: 'disabled' },
        response
      )
      await contentSwitch(wrapper).trigger('click')
      await flushPromises()
      const confirm = wrapper
        .findAll('[role="dialog"] button')
        .find(
          (button) =>
            button.text() === i18n.global.t('settings.settingFileIndex.contentIndexConfirmAction')
        )
      if (!confirm) throw new Error('Enable confirmation must be visible')
      await confirm.trigger('click')
      await flushPromises()
      expect(contentSwitch(wrapper).attributes('aria-checked')).toBe('true')
      if (tone === 'warning') {
        expect(toast.warning).toHaveBeenCalledTimes(1)
        expect(toast.success).not.toHaveBeenCalled()
        expect(wrapper.find('[role="status"]').exists()).toBe(true)
      } else {
        expect(toast.success).toHaveBeenCalledWith(
          i18n.global.t('settings.settingFileIndex.contentIndexEnabled')
        )
        expect(toast.warning).not.toHaveBeenCalled()
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
      }
      expect(toast.error).not.toHaveBeenCalled()
    }
  )

  it('explains a disk-full settings refusal without claiming persisted opt-in or generic retry failure', async () => {
    const disabled: FileIndexContentSettings = {
      ...paused('low-space'),
      contentIndexingEnabled: false,
      state: 'disabled'
    }
    const refusal = Object.assign(new Error('FILE_CONTENT_STORAGE_PAUSED'), {
      code: 'FILE_CONTENT_STORAGE_PAUSED'
    })
    const { wrapper } = await mountSettings(disabled, disabled, refusal)
    await contentSwitch(wrapper).trigger('click')
    await flushPromises()
    const confirm = wrapper
      .findAll('[role="dialog"] button')
      .find(
        (button) =>
          button.text() === i18n.global.t('settings.settingFileIndex.contentIndexConfirmAction')
      )
    if (!confirm) throw new Error('Enable confirmation must be visible')
    await confirm.trigger('click')
    await flushPromises()
    expect(contentSwitch(wrapper).attributes('aria-checked')).toBe('false')
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    const notices = vi.mocked(toast.warning).mock.calls.map((call) => String(call[0]))
    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageSaveBlocked')
    )
    expect(notices[0]).toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexStorageSaveRecovery')
    )
    expect(notices[0]).toContain('1.13')
    expect(notices[0]).toContain('3')
    expect(notices[0]).not.toContain(
      i18n.global.t('settings.settingFileIndex.contentIndexSaveFailed')
    )
    expect(notices[0]).not.toContain(i18n.global.t('settings.settingFileIndex.contentIndexEnabled'))
    expect(notices[0]).not.toContain(SECRET_PATH)
    expect(notices[0]).not.toContain('private-token')
  })

  it('accepts legacy settings without storage fields and removes a stale warning after status recovery', async () => {
    const { wrapper, refresh, isCancelled } = await mountSettings(paused('low-space'))
    await refresh({ contentIndexingEnabled: true, state: 'indexing' })
    expect(contentSwitch(wrapper).attributes('aria-checked')).toBe('true')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(i18n.global.t('settings.settingFileIndex.contentIndexingDesc'))
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    expect(isCancelled()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('SettingFileIndex index size cap', () => {
  const idle: FileIndexContentSettings = { contentIndexingEnabled: false, state: 'disabled' }
  const mountWithIndex = async (indexStorage: FileIndexStorage) =>
    (await mountSettings(idle, idle, undefined, indexStorage)).wrapper

  it('warns once the index is within 5% of its cap, where new files may stop being indexed', async () => {
    const wrapper = await mountWithIndex({
      fileBytes: 7.75 * GIB,
      maxBytes: 8 * GIB,
      resetFromBytes: null
    })
    const alert = wrapper.find('[role="status"]')
    expect(alert.attributes('data-tone')).toBe('warning')
    expect(alert.text()).toContain(i18n.global.t('settings.settingFileIndex.indexStorageFull'))
    expect(alert.text()).toContain('7.75')
  })

  it('explains an empty index that this launch rebuilt after it outgrew the cap', async () => {
    const wrapper = await mountWithIndex({
      fileBytes: 0.25 * GIB,
      maxBytes: 8 * GIB,
      resetFromBytes: Math.round(47.2 * GIB)
    })
    const alert = wrapper.find('[role="status"]')
    expect(alert.attributes('data-tone')).toBe('info')
    expect(alert.text()).toContain(i18n.global.t('settings.settingFileIndex.indexStorageReset'))
    expect(alert.text()).toContain('47.2')
  })

  it('says which files made way once the full index evicted, instead of how full it is', async () => {
    const horizon = Date.UTC(2025, 2, 15, 12)
    const { wrapper } = await mountSettings(
      idle,
      idle,
      undefined,
      { fileBytes: 7.9 * GIB, maxBytes: 8 * GIB, resetFromBytes: null },
      horizon
    )
    const alert = wrapper.find('[role="status"]')
    expect(alert.attributes('data-tone')).toBe('info')
    expect(alert.text()).toContain(i18n.global.t('settings.settingFileIndex.indexStorageEvicted'))
    expect(alert.text()).toContain(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(horizon)
    )
  })

  it('stays quiet below the cap', async () => {
    const wrapper = await mountWithIndex({
      fileBytes: 2 * GIB,
      maxBytes: 8 * GIB,
      resetFromBytes: null
    })
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
