// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhatsChangedDialog from './WhatsChangedDialog.vue'

const mocks = vi.hoisted(() => ({
  useReleaseNotesRuntime: vi.fn(),
  useI18n: vi.fn(),
  push: vi.fn(),
  warn: vi.fn()
}))

vi.mock('~/modules/hooks/useReleaseNotesRuntime', () => ({
  useReleaseNotesRuntime: mocks.useReleaseNotesRuntime
}))

vi.mock('vue-i18n', () => ({
  useI18n: mocks.useI18n
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ warn: mocks.warn })
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/modal', () => ({
  TxModal: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue', 'close'],
    template:
      '<section v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>'
  }
}))

vi.mock('@talex-touch/tuffex/collapse', () => ({
  TxCollapse: {
    props: ['modelValue'],
    template: '<div><slot /></div>'
  },
  TxCollapseItem: {
    props: ['name'],
    template: '<section><header><slot name="title" /></header><slot /></section>'
  }
}))

vi.mock('@talex-touch/tuffex/tag', () => ({
  TxTag: { template: '<span><slot /></span>' }
}))

function setupRuntime() {
  const closeDialog = vi.fn(async () => {})
  mocks.useReleaseNotesRuntime.mockReturnValue({
    dialogVisible: ref(true),
    dialogVersion: ref('2.4.14'),
    dialogEntries: shallowRef([
      {
        version: '2.4.14-beta.1',
        tag: 'v2.4.14-beta.1',
        channel: 'BETA',
        summary: {
          zh: ['测试摘要一', '测试摘要二', '测试摘要三'],
          en: ['Beta summary one', 'Beta summary two', 'Beta summary three']
        }
      },
      {
        version: '2.4.14',
        tag: 'v2.4.14',
        channel: 'RELEASE',
        summary: {
          zh: ['正式摘要一', '正式摘要二', '正式摘要三'],
          en: ['Release summary one', 'Release summary two', 'Release summary three']
        }
      }
    ]),
    closeDialog
  })
  return closeDialog
}

describe('WhatsChangedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useI18n.mockReturnValue({
      t: (key: string) => key,
      locale: ref('en-US')
    })
    mocks.push.mockResolvedValue(undefined)
  })

  it('renders localized summaries and channel labels for every aggregated version', () => {
    setupRuntime()
    const wrapper = mount(WhatsChangedDialog)

    expect(wrapper.get('[role="dialog"]').attributes('role')).toBe('dialog')
    expect(wrapper.text()).toContain('v2.4.14-beta.1')
    expect(wrapper.text()).toContain('releaseNotes.channelBeta')
    expect(wrapper.text()).toContain('Beta summary one')
    expect(wrapper.text()).toContain('v2.4.14')
    expect(wrapper.text()).toContain('releaseNotes.channelRelease')
    expect(wrapper.text()).toContain('Release summary three')
  })

  it('acknowledges only after full-history navigation succeeds', async () => {
    const closeDialog = setupRuntime()
    const wrapper = mount(WhatsChangedDialog)
    const detailsButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('releaseNotes.viewDetails'))!

    await detailsButton.trigger('click')
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith({
      path: '/setting',
      query: { section: 'update', release: 'v2.4.14' }
    })
    expect(closeDialog).toHaveBeenCalledOnce()
  })

  it('does not acknowledge when full-history navigation fails', async () => {
    const closeDialog = setupRuntime()
    mocks.push.mockRejectedValueOnce(new Error('navigation failed'))
    const wrapper = mount(WhatsChangedDialog)
    const detailsButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('releaseNotes.viewDetails'))!

    await detailsButton.trigger('click')
    await flushPromises()

    expect(closeDialog).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      'Failed to open release notes history',
      expect.any(Error)
    )
  })
})
