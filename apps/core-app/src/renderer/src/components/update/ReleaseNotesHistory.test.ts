// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReleaseNotesHistory from './ReleaseNotesHistory.vue'

const mocks = vi.hoisted(() => ({
  useReleaseNotesRuntime: vi.fn(),
  useI18n: vi.fn(),
  replace: vi.fn()
}))

vi.mock('~/modules/hooks/useReleaseNotesRuntime', () => ({
  useReleaseNotesRuntime: mocks.useReleaseNotesRuntime
}))

vi.mock('vue-i18n', () => ({
  useI18n: mocks.useI18n
}))

const route = reactive({ query: {} as Record<string, string | undefined> })
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/tag', () => ({
  TxTag: { template: '<span><slot /></span>' }
}))

vi.mock('@talex-touch/tuffex/markdown-view', () => ({
  TxMarkdownView: {
    props: ['content'],
    template: '<pre data-testid="markdown">{{ content }}</pre>'
  }
}))

function release(version: string, channel: 'RELEASE' | 'BETA', legacy = false) {
  return {
    tag: `v${version}`,
    version,
    name: `Tuff v${version}`,
    channel,
    notes: {
      zh: `# ${version} 中文\n`,
      en: `# ${version} English\n`
    },
    publishedAt: '2026-07-28T00:00:00.000Z',
    legacy
  }
}

describe('ReleaseNotesHistory', () => {
  const locale = ref('en-US')
  const listReleaseNotes = vi.fn()
  const getReleaseNotes = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    route.query = {}
    locale.value = 'en-US'
    mocks.useI18n.mockReturnValue({
      t: (key: string) => key,
      locale
    })
    mocks.useReleaseNotesRuntime.mockReturnValue({
      listReleaseNotes,
      getReleaseNotes,
      currentVersion: ref('2.4.14')
    })
    mocks.replace.mockResolvedValue(undefined)
    listReleaseNotes.mockImplementation(async ({ channel }: { channel: 'RELEASE' | 'BETA' }) => ({
      entries:
        channel === 'RELEASE'
          ? [release('2.4.14', 'RELEASE'), release('2.4.13', 'RELEASE', true)]
          : [release('2.4.14-beta.1', 'BETA')],
      nextCursor: null,
      hasMore: false,
      stale: false
    }))
  })

  it('loads Release history by default and renders the selected localized detail', async () => {
    const wrapper = mount(ReleaseNotesHistory)
    await flushPromises()

    expect(listReleaseNotes).toHaveBeenCalledWith({
      channel: 'RELEASE',
      cursor: undefined,
      limit: 20
    })
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe(
      'releaseNotes.channelTabs'
    )
    expect(wrapper.text()).toContain('v2.4.14')
    expect(wrapper.text()).toContain('releaseNotes.current')
    expect(wrapper.text()).toContain('releaseNotes.legacy')
    expect(wrapper.get('[data-testid="markdown"]').text()).toContain('# 2.4.14 English')
  })

  it('switches channels with semantic tabs and reacts to locale changes', async () => {
    const wrapper = mount(ReleaseNotesHistory)
    await flushPromises()
    const betaTab = wrapper
      .findAll('[role="tab"]')
      .find((tab) => tab.text().includes('releaseNotes.channelBeta'))!

    await betaTab.trigger('click')
    await flushPromises()

    expect(betaTab.attributes('aria-selected')).toBe('true')
    expect(listReleaseNotes).toHaveBeenCalledWith({
      channel: 'BETA',
      cursor: undefined,
      limit: 20
    })
    expect(mocks.replace).toHaveBeenCalledWith({
      query: { section: 'update', release: 'v2.4.14-beta.1' }
    })
    expect(wrapper.get('[data-testid="markdown"]').text()).toContain('# 2.4.14-beta.1 English')

    locale.value = 'zh-CN'
    await nextTick()
    expect(wrapper.get('[data-testid="markdown"]').text()).toContain('# 2.4.14-beta.1 中文')
  })

  it('shows an explicit cached notice when offline data is returned', async () => {
    listReleaseNotes.mockResolvedValueOnce({
      entries: [release('2.4.14', 'RELEASE')],
      nextCursor: null,
      hasMore: false,
      stale: true
    })
    const wrapper = mount(ReleaseNotesHistory)
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('releaseNotes.cachedNotice')
  })
})
