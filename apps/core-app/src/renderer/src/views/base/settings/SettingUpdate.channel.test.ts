// @vitest-environment jsdom
import type {
  CachedUpdateRecord,
  UpdateHistoryEntry,
  UpdateLifecycleSnapshot,
  UpdateSettings
} from '@talex-touch/utils'
import type { VueWrapper } from '@vue/test-utils'
import { AppPreviewChannel } from '@talex-touch/utils'
import { NEXUS_BASE_URL } from '@talex-touch/utils/env'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SettingUpdate from './SettingUpdate.vue'

const K = 'settings.settingUpdate'

const mocks = vi.hoisted(() => {
  const { reactive, ref, shallowRef } = require('vue') as typeof import('vue')
  return {
    lifecycleSnapshot: shallowRef(null as UpdateLifecycleSnapshot | null),
    checkApplicationUpgrade: vi.fn(),
    handleDownloadUpdate: vi.fn(),
    installDownloadedUpdate: vi.fn(),
    getUpdateSettings: vi.fn(),
    updateSettings: vi.fn(),
    getUpdateStatus: vi.fn(),
    getCachedRelease: vi.fn(),
    getUpdateHistory: vi.fn(),
    transportSend: vi.fn(),
    openExternal: vi.fn(),
    getTaskStatus: vi.fn(),
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
    appSetting: reactive({ dev: { developerMode: false } }),
    // The real shape: `startupInfo.version` is the build kind, never a version.
    startupVersion: ref<'dev' | 'release'>('release'),
    packageJson: ref<{ version: string } | null>({ version: '2.4.13' }),
    platform: ref('linux'),
    /** Holds the skeleton back, as the real hook does for its first 150ms. */
    skeletonDelayPending: ref(false)
  }
})

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ openExternal: mocks.openExternal }),
  useDownloadSdk: () => ({
    onTaskCompleted: vi.fn(() => vi.fn()),
    onTaskProgress: vi.fn(() => vi.fn()),
    onTaskUpdated: vi.fn(() => vi.fn()),
    getTaskStatus: mocks.getTaskStatus
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: vi.fn(() => vi.fn()),
    send: mocks.transportSend
  })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading'],
    template:
      '<button type="button" :disabled="disabled" :data-loading="String(Boolean(loading))"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<section v-if="modelValue"><slot /></section>'
  }
}))

vi.mock('@talex-touch/tuffex/select', () => ({
  TxSelectItem: {
    props: ['value'],
    template: '<option :value="value"><slot /></option>'
  }
}))

vi.mock('@talex-touch/tuffex/progress-bar', () => ({
  TxProgressBar: {
    props: ['percentage', 'indeterminate', 'status', 'ariaLabel', 'height'],
    template:
      '<div role="progressbar" :aria-label="ariaLabel" :data-indeterminate="String(Boolean(indeterminate))" :aria-valuenow="indeterminate ? undefined : percentage" />'
  }
}))

// Immediate, so a test sees the skeleton without waiting out the real 150ms delay; a test that needs
// that delay holds it open with `mocks.skeletonDelayPending`.
vi.mock('@talex-touch/tuffex/skeleton', async () => {
  const { computed, toValue } = await import('vue')
  return {
    useDeferredLoading: (source: () => boolean) =>
      computed(() => !mocks.skeletonDelayPending.value && toValue(source))
  }
})

vi.mock('vue-i18n', async () => {
  const { ref } = await import('vue')
  return {
    useI18n: () => ({
      t: (key: string) => key,
      locale: ref('en-US')
    })
  }
})

vi.mock('vue-sonner', () => ({
  toast: mocks.toast
}))

vi.mock('~/components/settings/SettingSkeleton.vue', () => ({
  default: {
    props: ['groups', 'dividers'],
    template: '<div data-testid="status-skeleton" :data-rows="groups[0].rows" />'
  }
}))

vi.mock('~/components/tuff/TuffBlockSelect.vue', () => ({
  default: {
    name: 'TuffBlockSelect',
    props: ['modelValue', 'title', 'description', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label><span>{{ title }}</span><select :data-testid="title" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select></label>'
  }
}))

vi.mock('~/components/tuff/TuffBlockSlot.vue', () => ({
  default: {
    name: 'TuffBlockSlot',
    props: ['title', 'description'],
    template:
      '<section class="block-slot"><slot name="label"><span>{{ title }}</span><span v-if="description">{{ description }}</span></slot><slot /></section>'
  }
}))

vi.mock('~/components/tuff/TuffBlockSwitch.vue', () => ({
  default: {
    name: 'TuffBlockSwitch',
    props: ['modelValue', 'title', 'description', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label><span>{{ title }}</span><input type="checkbox" :data-testid="title" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>'
  }
}))

vi.mock('~/components/tuff/TuffGroupBlock.vue', () => ({
  default: {
    props: ['name', 'description', 'collapsible'],
    template:
      '<section class="group-block" :data-group="name || \'headless\'"><h3 v-if="name">{{ name }}</h3><slot /></section>'
  }
}))

vi.mock('~/components/tuff/TuffStatusBadge.vue', () => ({
  default: {
    props: ['text', 'status', 'icon'],
    template: '<span class="status-badge" :data-status="status">{{ text }}</span>'
  }
}))

vi.mock('~/modules/hooks/useStartupInfo', async () => {
  const { computed } = await import('vue')
  return {
    useStartupInfo: () => ({
      startupInfo: computed(() => ({ version: mocks.startupVersion.value }))
    })
  }
})

vi.mock('~/modules/hooks/env-hooks', async () => {
  const { ref } = await import('vue')
  return {
    useEnv: () => ({
      packageJson: mocks.packageJson,
      os: ref(null),
      processInfo: ref({ platform: 'linux', arch: 'x64', versions: {} })
    })
  }
})

vi.mock('~/modules/hooks/useUpdateRuntime', () => ({
  useUpdateRuntime: () => ({
    lifecycleSnapshot: mocks.lifecycleSnapshot,
    checkApplicationUpgrade: mocks.checkApplicationUpgrade,
    handleDownloadUpdate: mocks.handleDownloadUpdate,
    installDownloadedUpdate: mocks.installDownloadedUpdate,
    getUpdateSettings: mocks.getUpdateSettings,
    updateSettings: mocks.updateSettings,
    getUpdateStatus: mocks.getUpdateStatus,
    getCachedRelease: mocks.getCachedRelease,
    getUpdateHistory: mocks.getUpdateHistory
  })
}))

vi.mock('~/modules/platform/renderer-platform', async () => {
  const { computed } = await import('vue')
  return {
    useRendererPlatform: () => ({
      platform: mocks.platform,
      isMac: computed(() => mocks.platform.value === 'darwin')
    })
  }
})

vi.mock('~/modules/preload/process-info', () => ({
  getPreloadProcessInfo: () => ({ arch: 'x64' })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

vi.mock('~/modules/update/GithubUpdateProvider', () => ({
  GithubUpdateProvider: class {
    getDownloadAssets(release: { assets: unknown[] }): unknown[] {
      return release.assets
    }
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn()
  })
}))

const OFFICIAL = { isOfficialBuild: true, hasOfficialKey: true, verificationFailed: false }
const UNOFFICIAL = { isOfficialBuild: false, hasOfficialKey: true, verificationFailed: false }
const TARGET = { targetVersion: 'v2.4.14-beta.47', releaseTag: 'v2.4.14-beta.47' }

function buildSnapshot(overrides: Partial<UpdateLifecycleSnapshot> = {}): UpdateLifecycleSnapshot {
  return {
    attemptId: 'attempt-1',
    revision: 1,
    phase: 'idle',
    currentVersion: '2.4.13',
    targetVersion: null,
    source: null,
    channel: AppPreviewChannel.RELEASE,
    releaseTag: null,
    taskId: null,
    installMode: null,
    installOnNormalQuit: true,
    rollbackCompatible: false,
    rollbackFromVersion: null,
    previousVersion: null,
    recoveryAvailable: false,
    lastCheckAt: 1_700_000_000_000,
    error: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides
  }
}

function createSettings(overrides: Partial<UpdateSettings> = {}) {
  return {
    enabled: true,
    frequency: 'everyday',
    updateChannel: AppPreviewChannel.RELEASE,
    autoDownload: true,
    installOnNormalQuit: true,
    rendererOverrideEnabled: false,
    rendererOverrideAvailable: false,
    notifyOnUpdate: true,
    ignoredVersions: [],
    ...overrides
  }
}

function buildCachedRelease(): CachedUpdateRecord {
  return {
    release: {
      tag_name: 'v2.4.14-beta.47',
      name: 'Tuff 2.4.14-beta.47',
      published_at: '2026-09-27T00:00:00.000Z',
      body: '',
      assets: [
        {
          name: 'tuff-2.4.14-beta.47-x86_64.AppImage',
          url: 'https://example.test/tuff.AppImage',
          size: 120 * 1024 * 1024,
          platform: 'linux',
          arch: 'x64',
          checksum: 'sha256:abc'
        }
      ]
    },
    channel: AppPreviewChannel.BETA,
    status: 'pending',
    fetchedAt: 1_700_000_000_000,
    tag: 'v2.4.14-beta.47',
    source: 'nexus'
  }
}

function buildHistoryEntry(index: number, overrides: Partial<UpdateHistoryEntry> = {}) {
  return {
    attemptId: `attempt-h${index}`,
    fromVersion: `2.4.14-beta.${39 + index}`,
    toVersion: `v2.4.14-beta.${40 + index}`,
    channel: AppPreviewChannel.BETA,
    outcome: 'updated',
    finishedAt: 1_700_000_000_000 - index * 86_400_000,
    error: null,
    ...overrides
  } satisfies UpdateHistoryEntry
}

/** What the next `getUpdateStatus()` hands the shared lifecycle state, as the real runtime does. */
function serveStatus(snapshot: UpdateLifecycleSnapshot): void {
  mocks.getUpdateStatus.mockImplementation(async () => {
    mocks.lifecycleSnapshot.value = snapshot
    return snapshot
  })
}

async function mountPage() {
  const wrapper = mount(SettingUpdate)
  await flushPromises()
  return wrapper
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label)
}

function statusCard(wrapper: VueWrapper) {
  return wrapper.get('[data-group="headless"]')
}

// A failed assertion skips the rest of its test; an explicit unmount there would leak the page, whose
// watchers then react to the next test's lifecycle changes.
enableAutoUnmount(afterEach)

describe('SettingUpdate', () => {
  beforeEach(() => {
    // Reset, not clear: a test that fails before consuming its `mockRejectedValueOnce` would
    // otherwise hand that rejection to the next test's save. Every default is re-applied below.
    vi.resetAllMocks()
    mocks.lifecycleSnapshot.value = null
    mocks.appSetting.dev.developerMode = false
    mocks.startupVersion.value = 'release'
    mocks.packageJson.value = { version: '2.4.13' }
    mocks.platform.value = 'linux'
    mocks.skeletonDelayPending.value = false
    mocks.getUpdateSettings.mockResolvedValue(createSettings())
    mocks.updateSettings.mockResolvedValue(undefined)
    mocks.checkApplicationUpgrade.mockResolvedValue(undefined)
    mocks.getCachedRelease.mockResolvedValue(null)
    mocks.getUpdateHistory.mockResolvedValue([])
    mocks.handleDownloadUpdate.mockResolvedValue(true)
    mocks.installDownloadedUpdate.mockResolvedValue(true)
    mocks.transportSend.mockResolvedValue(OFFICIAL)
    mocks.openExternal.mockResolvedValue(undefined)
    mocks.getTaskStatus.mockResolvedValue({ success: true, task: null })
    serveStatus(buildSnapshot())
  })

  describe('default view', () => {
    it('shows only where the update is for an official release build', async () => {
      const wrapper = await mountPage()
      const text = wrapper.text()

      expect(text).toContain(`${K}.status.latest`)
      expect(text).toContain('v2.4.13')
      expect(wrapper.find(`[data-testid="${K}.channelTitle"]`).exists()).toBe(false)
      for (const hidden of [
        'advancedTitle',
        'frequencyTitle',
        'autoUpdate',
        'notifyOnUpdate',
        'assetsTitle',
        'evidenceTitle',
        'history.title'
      ]) {
        expect(text).not.toContain(`${K}.${hidden}`)
      }
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('drops the verified badge, the idle label and the install-mode choice', async () => {
      mocks.appSetting.dev.developerMode = true
      const wrapper = await mountPage()
      const text = wrapper.text()

      // Prefixes, so every key of the retired families is covered, not one spelling of it.
      expect(text).not.toContain(`${K}.nativeTrust`)
      expect(text).not.toContain(`${K}.lifecycle.phases`)
      expect(text).not.toContain(`${K}.installMode`)
    })

    it('shows the skeleton until the first snapshot arrives', async () => {
      let answer: (snapshot: UpdateLifecycleSnapshot) => void = () => {}
      mocks.getUpdateStatus.mockImplementation(
        () =>
          new Promise<UpdateLifecycleSnapshot>((resolve) => {
            answer = (snapshot) => {
              mocks.lifecycleSnapshot.value = snapshot
              resolve(snapshot)
            }
          })
      )

      const wrapper = await mountPage()
      expect(wrapper.find('[data-testid="status-skeleton"]').exists()).toBe(true)
      expect(wrapper.find('[data-group="headless"]').exists()).toBe(false)

      answer(buildSnapshot())
      await flushPromises()

      expect(wrapper.find('[data-testid="status-skeleton"]').exists()).toBe(false)
      expect(statusCard(wrapper).text()).toContain(`${K}.status.latest`)
    })

    it('waits for the package version before drawing the card', async () => {
      mocks.packageJson.value = null
      mocks.lifecycleSnapshot.value = buildSnapshot()
      mocks.getUpdateStatus.mockImplementation(() => new Promise(() => {}))
      const wrapper = await mountPage()

      // A snapshot is already here, but a beta build's channel row would pop in after the version.
      expect(wrapper.find('[data-testid="status-skeleton"]').exists()).toBe(true)

      mocks.packageJson.value = { version: '2.4.14-beta.46' }
      await flushPromises()

      expect(wrapper.find('[data-testid="status-skeleton"]').exists()).toBe(false)
      expect(statusCard(wrapper).text()).toContain('v2.4.14-beta.46')
      expect(wrapper.find(`[data-testid="${K}.channelTitle"]`).exists()).toBe(true)
    })

    it('does not wait on a package version that never arrives', async () => {
      mocks.packageJson.value = null
      const wrapper = await mountPage()

      expect(wrapper.find('[data-testid="status-skeleton"]').exists()).toBe(false)
      // The snapshot's own starting version stands in, never the build kind.
      expect(statusCard(wrapper).text()).toContain('v2.4.13')
      expect(statusCard(wrapper).text()).not.toContain('vrelease')
    })

    it('keeps only the renderer override description', async () => {
      mocks.appSetting.dev.developerMode = true
      mocks.packageJson.value = { version: '2.4.14-beta.46' }
      mocks.getUpdateSettings.mockResolvedValue(createSettings({ rendererOverrideAvailable: true }))
      mocks.getCachedRelease.mockResolvedValue(buildCachedRelease())
      const wrapper = await mountPage()

      const descriptions = ['TuffBlockSelect', 'TuffBlockSwitch', 'TuffBlockSlot']
        .flatMap((name) => wrapper.findAllComponents({ name }))
        .map((row) => row.props('description'))
        .filter(Boolean)

      expect(descriptions).toEqual([`${K}.rendererOverrideDesc`])
    })
  })

  describe('cards below the status card', () => {
    const below = [`${K}.history.title`, `${K}.advancedTitle`]
    let answerStatus: (snapshot: UpdateLifecycleSnapshot) => void = () => {}

    /** The page's top-level cards, in document order. */
    function pageOrder(wrapper: VueWrapper): string[] {
      return wrapper
        .findAll('[data-testid="status-skeleton"], [data-group]')
        .map((node) => node.attributes('data-testid') ?? node.attributes('data-group') ?? '')
    }

    beforeEach(() => {
      mocks.appSetting.dev.developerMode = true
      mocks.getUpdateHistory.mockResolvedValue([buildHistoryEntry(0)])
      // The status request is out and the skeleton's delay has not run: the slot is empty.
      mocks.skeletonDelayPending.value = true
      mocks.getUpdateStatus.mockImplementation(
        () =>
          new Promise<UpdateLifecycleSnapshot>((resolve) => {
            answerStatus = (snapshot) => {
              mocks.lifecycleSnapshot.value = snapshot
              resolve(snapshot)
            }
          })
      )
    })

    it('stay out of an empty status slot, then follow the status card', async () => {
      const wrapper = await mountPage()
      // Drawn now, the history card (one request away, where the status card is two) would take
      // the top of the page and be pushed down when the status card arrived.
      expect(pageOrder(wrapper)).toEqual([])

      answerStatus(buildSnapshot())
      await flushPromises()

      expect(pageOrder(wrapper)).toEqual(['headless', ...below])
    })

    it('follow the skeleton once its delay runs out, then the status card', async () => {
      const wrapper = await mountPage()
      expect(pageOrder(wrapper)).toEqual([])

      mocks.skeletonDelayPending.value = false
      await flushPromises()
      expect(pageOrder(wrapper)).toEqual(['status-skeleton', ...below])

      answerStatus(buildSnapshot())
      await flushPromises()
      expect(pageOrder(wrapper)).toEqual(['headless', ...below])
    })
  })

  describe('channel row', () => {
    it.each(['release', 'dev'] as const)(
      'reads the running version from the package, not the %s build kind',
      async (buildKind) => {
        mocks.startupVersion.value = buildKind
        mocks.packageJson.value = { version: '2.4.14-beta.46' }
        mocks.getUpdateSettings.mockResolvedValue(
          createSettings({ updateChannel: AppPreviewChannel.RELEASE })
        )
        const wrapper = await mountPage()

        expect(statusCard(wrapper).text()).toContain('v2.4.14-beta.46')
        expect(statusCard(wrapper).text()).not.toContain(`v${buildKind}`)
        // A beta build keeps the row with Release selected and developer mode off.
        expect(wrapper.find(`[data-testid="${K}.channelTitle"]`).exists()).toBe(true)
      }
    )
    it.each([
      {
        // Release selected, so only the beta-build rule can show the row.
        name: 'a beta build',
        version: '2.4.14-beta.46',
        channel: AppPreviewChannel.RELEASE,
        dev: false,
        shown: true
      },
      {
        name: 'a release build already on Beta',
        version: '2.4.13',
        channel: AppPreviewChannel.BETA,
        dev: false,
        shown: true
      },
      {
        name: 'a release build on Release',
        version: '2.4.13',
        channel: AppPreviewChannel.RELEASE,
        dev: false,
        shown: false
      },
      {
        name: 'developer mode',
        version: '2.4.13',
        channel: AppPreviewChannel.RELEASE,
        dev: true,
        shown: true
      }
    ])('is shown for $name: $shown', async ({ version, channel, dev, shown }) => {
      mocks.packageJson.value = { version }
      mocks.appSetting.dev.developerMode = dev
      mocks.getUpdateSettings.mockResolvedValue(createSettings({ updateChannel: channel }))

      const wrapper = await mountPage()

      expect(wrapper.find(`[data-testid="${K}.channelTitle"]`).exists()).toBe(shown)
    })

    it('stays in place after a release build leaves Beta', async () => {
      mocks.getUpdateSettings.mockResolvedValue(
        createSettings({ updateChannel: AppPreviewChannel.BETA })
      )
      const wrapper = await mountPage()

      await wrapper.get(`[data-testid="${K}.channelTitle"]`).setValue(AppPreviewChannel.RELEASE)
      await flushPromises()

      expect(mocks.updateSettings).toHaveBeenCalledWith({
        updateChannel: AppPreviewChannel.RELEASE
      })
      expect(wrapper.find(`[data-testid="${K}.channelTitle"]`).exists()).toBe(true)
    })

    it('checks and refreshes the selected channel after saving', async () => {
      mocks.packageJson.value = { version: '2.4.14-beta.46' }
      const wrapper = await mountPage()

      await wrapper.get(`[data-testid="${K}.channelTitle"]`).setValue(AppPreviewChannel.BETA)
      await flushPromises()

      expect(mocks.updateSettings).toHaveBeenCalledOnce()
      expect(mocks.updateSettings).toHaveBeenCalledWith({ updateChannel: AppPreviewChannel.BETA })
      expect(mocks.checkApplicationUpgrade).toHaveBeenCalledOnce()
      expect(mocks.checkApplicationUpgrade).toHaveBeenCalledWith(true, { presentDialog: false })
      expect(mocks.updateSettings.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.checkApplicationUpgrade.mock.invocationCallOrder[0]
      )
      expect(mocks.getUpdateStatus).toHaveBeenCalledTimes(2)
      expect(mocks.getCachedRelease).toHaveBeenNthCalledWith(1, AppPreviewChannel.RELEASE)
      expect(mocks.getCachedRelease).toHaveBeenNthCalledWith(2, AppPreviewChannel.BETA)
    })

    it('rolls back the channel and skips checking when saving fails', async () => {
      mocks.packageJson.value = { version: '2.4.14-beta.46' }
      mocks.updateSettings.mockRejectedValueOnce(new Error('save failed'))
      const wrapper = await mountPage()

      const channelSelect = wrapper.get<HTMLSelectElement>(`[data-testid="${K}.channelTitle"]`)
      await channelSelect.setValue(AppPreviewChannel.BETA)
      await flushPromises()

      expect(channelSelect.element.value).toBe(AppPreviewChannel.RELEASE)
      expect(mocks.checkApplicationUpgrade).not.toHaveBeenCalled()
      expect(mocks.getUpdateStatus).toHaveBeenCalledOnce()
      expect(mocks.getCachedRelease).toHaveBeenCalledOnce()
      expect(mocks.getCachedRelease).toHaveBeenCalledWith(AppPreviewChannel.RELEASE)
    })

    it('disables channel changes and ignores emitted updates when checking is unavailable', async () => {
      mocks.packageJson.value = { version: '2.4.14-beta.46' }
      serveStatus(buildSnapshot({ phase: 'downloading', taskId: 'task-1', ...TARGET }))
      const wrapper = await mountPage()

      const channelSelect = wrapper.get(`[data-testid="${K}.channelTitle"]`)
      expect(channelSelect.attributes('disabled')).toBeDefined()

      wrapper
        .findComponent({ name: 'TuffBlockSelect' })
        .vm.$emit('update:modelValue', AppPreviewChannel.BETA)
      await flushPromises()

      expect(mocks.updateSettings).not.toHaveBeenCalled()
      expect(mocks.checkApplicationUpgrade).not.toHaveBeenCalled()
    })
  })

  describe('advanced card', () => {
    it('lists the configurable rows in developer mode', async () => {
      mocks.appSetting.dev.developerMode = true
      const wrapper = await mountPage()
      const advanced = wrapper.get(`[data-group="${K}.advancedTitle"]`)

      for (const row of ['frequencyTitle', 'autoUpdate', 'notifyOnUpdate', 'evidenceTitle']) {
        expect(advanced.text()).toContain(`${K}.${row}`)
      }
      // Still gated on the launch variable as well.
      expect(advanced.text()).not.toContain(`${K}.rendererOverrideTitle`)
    })

    it('writes both update flags from the one automatic-update switch', async () => {
      mocks.appSetting.dev.developerMode = true
      const wrapper = await mountPage()
      const autoUpdate = wrapper.get<HTMLInputElement>(`[data-testid="${K}.autoUpdate"]`)
      expect(autoUpdate.element.checked).toBe(true)

      await autoUpdate.setValue(false)
      await flushPromises()
      expect(mocks.updateSettings).toHaveBeenLastCalledWith({
        autoDownload: false,
        installOnNormalQuit: false
      })
      expect(autoUpdate.element.checked).toBe(false)

      await autoUpdate.setValue(true)
      await flushPromises()
      expect(mocks.updateSettings).toHaveBeenLastCalledWith({
        autoDownload: true,
        installOnNormalQuit: true
      })
      expect(mocks.toast.success).toHaveBeenCalledWith(`${K}.messages.autoUpdateSaved`)
    })

    it('rolls the automatic-update switch back when saving fails', async () => {
      mocks.appSetting.dev.developerMode = true
      mocks.updateSettings.mockRejectedValueOnce(new Error('save failed'))
      const wrapper = await mountPage()
      const autoUpdate = wrapper.get<HTMLInputElement>(`[data-testid="${K}.autoUpdate"]`)

      await autoUpdate.setValue(false)
      await flushPromises()

      expect(autoUpdate.element.checked).toBe(true)
      expect(mocks.toast.error).toHaveBeenCalledWith(`${K}.messages.saveFailed`)
    })

    it('reads the retired download-only mode as on without rewriting it', async () => {
      mocks.appSetting.dev.developerMode = true
      mocks.getUpdateSettings.mockResolvedValue(
        createSettings({ autoDownload: true, installOnNormalQuit: false })
      )
      const wrapper = await mountPage()

      expect(wrapper.get<HTMLInputElement>(`[data-testid="${K}.autoUpdate"]`).element.checked).toBe(
        true
      )
      expect(mocks.updateSettings).not.toHaveBeenCalled()
    })
  })

  describe('status actions', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('keeps the download button loading until the lifecycle leaves available', async () => {
      mocks.getUpdateSettings.mockResolvedValue(createSettings({ autoDownload: false }))
      mocks.getCachedRelease.mockResolvedValue(buildCachedRelease())
      serveStatus(buildSnapshot({ phase: 'available', ...TARGET }))
      let answer: (started: boolean) => void = () => {}
      mocks.handleDownloadUpdate.mockReturnValue(new Promise((resolve) => (answer = resolve)))
      const wrapper = await mountPage()

      const download = () => findButton(wrapper, `${K}.actions.downloadAvailable`)
      await download()!.trigger('click')
      await flushPromises()
      expect(mocks.handleDownloadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ tag_name: 'v2.4.14-beta.47' })
      )
      expect(download()!.attributes('data-loading')).toBe('true')
      expect(download()!.attributes('disabled')).toBeDefined()

      // Answered, but the lifecycle has not moved yet: still loading, and the page asks again.
      answer(true)
      await flushPromises()
      expect(download()!.attributes('data-loading')).toBe('true')
      expect(mocks.getUpdateStatus).toHaveBeenCalledTimes(2)

      mocks.lifecycleSnapshot.value = buildSnapshot({
        phase: 'downloading',
        revision: 2,
        taskId: 'task-1',
        ...TARGET
      })
      await flushPromises()
      expect(download()).toBeUndefined()
      expect(statusCard(wrapper).text()).toContain(`${K}.status.downloading`)
    })

    it('offers the download again when the request fails', async () => {
      mocks.getUpdateSettings.mockResolvedValue(createSettings({ autoDownload: false }))
      mocks.getCachedRelease.mockResolvedValue(buildCachedRelease())
      serveStatus(buildSnapshot({ phase: 'available', ...TARGET }))
      mocks.handleDownloadUpdate.mockResolvedValue(false)
      const wrapper = await mountPage()

      await findButton(wrapper, `${K}.actions.downloadAvailable`)!.trigger('click')
      await flushPromises()

      const download = findButton(wrapper, `${K}.actions.downloadAvailable`)!
      expect(download.attributes('data-loading')).toBe('false')
      expect(download.attributes('disabled')).toBeUndefined()
    })

    it('waits for the automatic download before offering a manual one', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
      vi.setSystemTime(1_800_000_000_000)
      mocks.getCachedRelease.mockResolvedValue(buildCachedRelease())
      serveStatus(buildSnapshot({ phase: 'available', ...TARGET }))
      const wrapper = await mountPage()

      expect(statusCard(wrapper).text()).toContain(`${K}.status.preparing`)
      expect(findButton(wrapper, `${K}.actions.downloadAvailable`)).toBeUndefined()

      vi.advanceTimersByTime(14_000)
      await nextTick()
      expect(findButton(wrapper, `${K}.actions.downloadAvailable`)).toBeUndefined()

      vi.advanceTimersByTime(1_000)
      await nextTick()
      expect(statusCard(wrapper).text()).toContain(`${K}.status.available`)
      expect(findButton(wrapper, `${K}.actions.downloadAvailable`)).toBeDefined()
    })

    it('shows the progress of a download already under way when the page opens', async () => {
      serveStatus(buildSnapshot({ phase: 'downloading', taskId: 'task-1', ...TARGET }))
      mocks.getTaskStatus.mockResolvedValue({
        success: true,
        task: {
          id: 'task-1',
          module: 'app_update',
          progress: {
            totalSize: 100 * 1024 * 1024,
            downloadedSize: 37 * 1024 * 1024,
            speed: 2 * 1024 * 1024,
            percentage: 37
          }
        }
      })
      const wrapper = await mountPage()

      expect(mocks.getTaskStatus).toHaveBeenCalledWith({ taskId: 'task-1' })
      expect(statusCard(wrapper).text()).toContain('37%')
      const bar = statusCard(wrapper).get('[role="progressbar"]')
      expect(bar.attributes('data-indeterminate')).toBe('false')
      expect(bar.attributes('aria-valuenow')).toBe('37')
    })

    it.each([
      { name: 'check', snapshot: () => buildSnapshot(), label: `${K}.actions.manualCheck` },
      {
        name: 'retry after a failure',
        snapshot: () =>
          buildSnapshot({
            phase: 'failed',
            ...TARGET,
            error: {
              code: 'UPDATE_DOWNLOAD_FAILED',
              message: 'Network unreachable',
              retryable: true
            }
          }),
        label: `${K}.actions.retry`
      }
    ])('runs the $name without the update dialog, then refreshes', async ({ snapshot, label }) => {
      serveStatus(snapshot())
      const wrapper = await mountPage()

      await findButton(wrapper, label)!.trigger('click')
      await flushPromises()

      // This page renders the result itself; a modal would sit over its own download button.
      expect(mocks.checkApplicationUpgrade).toHaveBeenCalledOnce()
      expect(mocks.checkApplicationUpgrade).toHaveBeenCalledWith(true, { presentDialog: false })
      expect(mocks.getUpdateStatus).toHaveBeenCalledTimes(2)
      expect(mocks.getCachedRelease).toHaveBeenCalledTimes(2)
    })

    it('installs the verified update from the ready row', async () => {
      serveStatus(buildSnapshot({ phase: 'ready', taskId: 'task-1', ...TARGET }))
      const wrapper = await mountPage()

      await findButton(wrapper, `${K}.actions.openLinuxPackage`)!.trigger('click')
      await flushPromises()

      expect(mocks.installDownloadedUpdate).toHaveBeenCalledWith('task-1')
    })
  })

  describe('authenticity banner', () => {
    it.each(['darwin', 'win32', 'linux'])(
      'warns about an unofficial %s build and links the official download page',
      async (platform) => {
        mocks.platform.value = platform
        mocks.transportSend.mockResolvedValue(UNOFFICIAL)
        const wrapper = await mountPage()

        const banner = wrapper.get('[role="alert"]')
        expect(banner.text()).toContain(`${K}.authenticity.title`)
        expect(banner.text()).toContain(`${K}.authenticity.description`)
        await banner.get('button').trigger('click')
        expect(mocks.openExternal).toHaveBeenCalledWith(`${NEXUS_BASE_URL}/updates`)
      }
    )

    it.each([
      { name: 'an official build', status: () => Promise.resolve(OFFICIAL) },
      { name: 'a status that never loaded', status: () => Promise.reject(new Error('offline')) },
      { name: 'a malformed status', status: () => Promise.resolve({ isOfficialBuild: false }) }
    ])('stays hidden for $name', async ({ status }) => {
      mocks.transportSend.mockImplementation(status)
      const wrapper = await mountPage()

      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })

    it('leaves the only download link to the banner on an unofficial macOS build', async () => {
      mocks.platform.value = 'darwin'
      mocks.transportSend.mockResolvedValue(UNOFFICIAL)
      serveStatus(buildSnapshot({ phase: 'ready', taskId: 'task-1', ...TARGET }))
      const wrapper = await mountPage()

      const card = statusCard(wrapper)
      const statusRow = card.get('.update-status')
      expect(statusRow.findAll('button')).toHaveLength(0)
      expect(statusRow.text()).toContain(`${K}.status.readyBlocked`)
      expect(card.text()).not.toContain(`${K}.actions.restartMac`)

      const downloadLinks = card
        .findAll('button')
        .filter((button) => button.text() === `${K}.actions.openDownloadPage`)
      expect(downloadLinks).toHaveLength(1)
      await downloadLinks[0]!.trigger('click')

      expect(mocks.openExternal).toHaveBeenCalledWith(`${NEXUS_BASE_URL}/updates`)
      expect(mocks.installDownloadedUpdate).not.toHaveBeenCalled()
    })
  })

  describe('update history', () => {
    /** Entry rows only: the "show more" toggle is a row of its own, outside the list. */
    function historyRows(wrapper: VueWrapper) {
      return wrapper.findAll(`[data-group="${K}.history.title"] > div > .block-slot`)
    }

    it('renders no card before anything has been updated here', async () => {
      const wrapper = await mountPage()

      expect(mocks.getUpdateHistory).toHaveBeenCalledWith(20)
      expect(wrapper.text()).not.toContain(`${K}.history.title`)
    })

    it('shows five rows and expands to the rest', async () => {
      mocks.getUpdateHistory.mockResolvedValue(
        Array.from({ length: 6 }, (_, index) => buildHistoryEntry(index))
      )
      const wrapper = await mountPage()

      expect(historyRows(wrapper)).toHaveLength(5)
      expect(historyRows(wrapper)[0]!.text()).toContain('v2.4.14-beta.40')

      const toggle = findButton(wrapper, `${K}.history.showMore`)!
      expect(toggle.attributes('aria-expanded')).toBe('false')
      // A row like the entries, so the card keeps one surface down to its last edge.
      expect(toggle.element.closest('.block-slot')).not.toBeNull()
      await toggle.trigger('click')

      expect(historyRows(wrapper)).toHaveLength(6)
      expect(findButton(wrapper, `${K}.history.showLess`)!.attributes('aria-expanded')).toBe('true')
    })

    it('labels versions the way the status row does, whatever the tag looks like', async () => {
      mocks.getUpdateHistory.mockResolvedValue([
        buildHistoryEntry(0, { toVersion: 'v2.4.14-beta.47' }),
        buildHistoryEntry(1, { toVersion: '2.4.14-beta.46' }),
        buildHistoryEntry(2, { toVersion: 'V2.4.14-beta.45' })
      ])
      const wrapper = await mountPage()

      // The row stub renders its title in the first span.
      expect(historyRows(wrapper).map((row) => row.get('span').text())).toEqual([
        'v2.4.14-beta.47',
        'v2.4.14-beta.46',
        'v2.4.14-beta.45'
      ])
      // The running app version (no `v`) gets the same label in the status row.
      expect(statusCard(wrapper).text()).toContain('v2.4.13')
    })

    it('labels each outcome and explains a failure on hover', async () => {
      mocks.getUpdateHistory.mockResolvedValue([
        buildHistoryEntry(0),
        buildHistoryEntry(1, { outcome: 'rolled-back' }),
        buildHistoryEntry(2, {
          outcome: 'failed',
          error: { code: 'UPDATE_DOWNLOAD_FAILED', message: 'Network unreachable', retryable: true }
        })
      ])
      const wrapper = await mountPage()

      const badges = wrapper.findAll('.status-badge')
      expect(badges.map((badge) => [badge.text(), badge.attributes('data-status')])).toEqual([
        [`${K}.history.outcome.updated`, 'success'],
        [`${K}.history.outcome.rolledBack`, 'warning'],
        [`${K}.history.outcome.failed`, 'danger']
      ])
      expect(badges[2]!.attributes('title')).toBe('Network unreachable')
      expect(findButton(wrapper, `${K}.history.showMore`)).toBeUndefined()
    })

    it('adds a row when an update fails while the page is open', async () => {
      serveStatus(buildSnapshot({ phase: 'downloading', taskId: 'task-1', ...TARGET }))
      const wrapper = await mountPage()
      expect(mocks.getUpdateHistory).toHaveBeenCalledOnce()

      mocks.getUpdateHistory.mockResolvedValue([
        buildHistoryEntry(0, { toVersion: 'v2.4.14-beta.47', outcome: 'failed' })
      ])
      mocks.lifecycleSnapshot.value = buildSnapshot({
        phase: 'failed',
        revision: 2,
        ...TARGET,
        error: { code: 'UPDATE_DOWNLOAD_FAILED', message: 'Network unreachable', retryable: true }
      })
      await flushPromises()

      expect(mocks.getUpdateHistory).toHaveBeenCalledTimes(2)
      expect(historyRows(wrapper)).toHaveLength(1)
      expect(statusCard(wrapper).text()).toContain(`${K}.status.failed`)
      expect(statusCard(wrapper).text()).toContain('Network unreachable')
    })
  })
})
