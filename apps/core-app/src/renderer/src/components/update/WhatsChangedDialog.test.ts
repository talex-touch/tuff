// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { ref, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhatsChangedDialog from './WhatsChangedDialog.vue'

const mocks = vi.hoisted(() => ({
  useReleaseNotesRuntime: vi.fn(),
  useI18n: vi.fn()
}))

vi.mock('~/modules/hooks/useReleaseNotesRuntime', () => ({
  useReleaseNotesRuntime: mocks.useReleaseNotesRuntime
}))

vi.mock('vue-i18n', () => ({
  useI18n: mocks.useI18n
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

  it('closes and acknowledges from the only dialog action', async () => {
    const closeDialog = setupRuntime()
    const wrapper = mount(WhatsChangedDialog)

    await wrapper.get('button').trigger('click')

    expect(closeDialog).toHaveBeenCalledOnce()
  })
})
