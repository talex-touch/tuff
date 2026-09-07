// @vitest-environment jsdom
import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type { IBoxOptions } from '../../modules/box/adapter'
import type * as VueUse from '@vueuse/core'
import type * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import { nextTick, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
import { describe, expect, it, vi } from 'vitest'
import CoreBox from './CoreBox.vue'

const state = vi.hoisted(() => ({
  activeActivations: undefined as unknown as Ref<unknown>,
  boxOptions: undefined as unknown as IBoxOptions,
  layout: undefined as unknown as TuffContainerLayout | undefined,
  lowBatteryMode: undefined as unknown as Ref<boolean>,
  results: undefined as unknown as Ref<TuffItem[]>,
  searchVal: undefined as unknown as Ref<string>
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: () => () => {},
    send: async () => undefined
  })
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/local-ai-cli', () => ({
  createLocalAiCliSdk: () => ({ getStatus: async () => ({ betaAvailable: false }) })
}))

vi.mock('~/components/render/addon/TuffItemAddon.vue', () => ({
  default: { name: 'TuffItemAddon', template: '<aside class="item-addon-stub" />' }
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const original = await importOriginal<typeof VueUse>()
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return { ...original, useElementSize: () => ({ width: ref(0) }) }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: false })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    animation: { listItemStagger: false, resultTransition: true },
    diagnostics: { verboseLogs: false },
    tools: { autoHide: false }
  }
}))

vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => false,
  windowState: { divisionBox: undefined }
}))

vi.mock('~/modules/hooks/useBatteryOptimizer', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  state.lowBatteryMode = ref(true)
  return { useBatteryOptimizer: () => ({ lowBatteryMode: state.lowBatteryMode }) }
})

vi.mock('~/modules/style/sanitizeUserCss', () => ({
  sanitizeUserCss: (css: string) => css
}))

vi.mock('../../modules/box/adapter/hooks/useSearch', async () => {
  const { computed, ref } = await vi.importActual<typeof Vue>('vue')
  state.results = ref<TuffItem[]>([])
  state.searchVal = ref('')
  state.activeActivations = ref<unknown>(null)

  return {
    useSearch: () => ({
      searchVal: state.searchVal,
      select: ref(0),
      res: state.results,
      loading: ref(false),
      recommendationPending: ref(false),
      activeItem: computed(() => state.results.value[0] ?? null),
      activeActivations: state.activeActivations,
      replaceSearchResults: (items: TuffItem[]) => {
        state.results.value = items
      },
      handleExecute: async () => {},
      handleExit: async () => {},
      handleSearchImmediate: async () => {},
      deactivateProvider: async () => true,
      deactivateAllProviders: async () => {}
    })
  }
})

vi.mock('../../modules/box/adapter/hooks/useActionPanel', () => ({
  useActionPanel: () => ({ executeAction: async () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/useChannel', () => ({
  useChannel: (boxOptions: IBoxOptions) => {
    state.boxOptions = boxOptions
    boxOptions.layout = state.layout as TuffContainerLayout | undefined
  }
}))

vi.mock('../../modules/box/adapter/hooks/useClipboard', () => ({
  useClipboard: () => ({
    handlePaste: () => {},
    clearClipboard: () => {},
    resetAutoPasteState: () => {},
    cleanup: () => {}
  })
}))

vi.mock('../../modules/box/adapter/hooks/useDetach', () => ({
  useDetach: () => ({
    flowVisible: false,
    flowSessionId: '',
    flowPayload: undefined,
    closeFlowSelector: () => {},
    dispatchFlow: () => {},
    openFlowSelector: () => {}
  })
}))

vi.mock('../../modules/box/adapter/hooks/useFocus', () => ({
  useFocus: () => ({ focusInput: () => {}, focusWindowAndInput: async () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/useKeyboard', () => ({
  useKeyboard: () => ({ scrollActiveItemIntoView: () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/usePreviewHistory', () => ({
  usePreviewHistory: () => ({
    visible: false,
    loading: false,
    items: [],
    activeIndex: 0,
    handleContextMenu: () => {},
    apply: () => {}
  })
}))

vi.mock('../../modules/box/adapter/hooks/useVisibility', () => ({
  useVisibility: () => ({ cleanup: () => {}, checkAutoClear: () => {} })
}))

vi.mock('../../modules/box/adapter/hooks/flip-layout', () => ({
  captureFlipSnapshot: () => null,
  playFlip: () => {}
}))
vi.mock('./theme', async () => {
  const { ref } = await vi.importActual<typeof Vue>('vue')
  return {
    useCoreBoxTheme: () => ({
      themeConfig: ref({
        logo: { position: 'hidden' },
        input: { background: 'default', border: 'default' },
        results: { hoverStyle: 'default' },
        customCSS: ''
      }),
      themeCSSVars: ref({}),
      canvasConfig: ref({
        items: [],
        columns: 1,
        rowHeight: 1,
        gap: 0,
        colorVars: undefined,
        customCSS: ''
      }),
      canvasEnabled: ref(false)
    })
  }
})

function item(id: string, title: string): TuffItem {
  return {
    id,
    kind: 'feature',
    source: { id: 'corebox-test', type: 'plugin', name: 'CoreBox test' },
    render: { mode: 'default', basic: { title } }
  } as unknown as TuffItem
}

const sectionedRecommendationLayout = {
  mode: 'grid',
  sections: [
    {
      id: 'recommendations',
      itemIds: ['recommended-result'],
      layout: 'grid',
      meta: { intelligence: true }
    }
  ]
} as TuffContainerLayout

const stubs = {
  BoxInput: { template: '<div class="box-input-stub" />' },
  BoxGrid: {
    props: ['items', 'layout'],
    template:
      '<section v-if="layout.sections.length" class="recommendation-grid"><div v-for="item in items" :key="item.id" class="recommendation-grid-row">{{ item.render.basic.title }}</div></section>'
  },
  CoreBoxFooter: { template: '<footer />' },
  CoreBoxRender: {
    props: ['item'],
    template: '<div class="normal-list-row">{{ item.render.basic.title }}</div>'
  },
  DivisionBoxHeader: { template: '<div />' },
  FlowSelector: { template: '<div />' },
  PrefixPart: { template: '<div />' },
  PreviewHistoryPanel: { template: '<div />' },
  TagSection: { template: '<div />' },
  TuffIcon: { template: '<i />' },
  teleport: true
}

describe('CoreBox low-power result switching', () => {
  it('replaces a sectioned recommendation grid with the next list result immediately when low power disables result transitions', async () => {
    const results = state.results
    state.layout = sectionedRecommendationLayout
    results.value = [item('recommended-result', 'Recommended app')]

    const wrapper = mount(CoreBox, { global: { plugins: [router], stubs } })
    await nextTick()

    expect(wrapper.get('.recommendation-grid-row').text()).toBe('Recommended app')
    ;(state.boxOptions as IBoxOptions).layout = { mode: 'list' } as TuffContainerLayout
    results.value = [item('search-result', 'Search result')]
    await nextTick()

    expect(wrapper.get('.normal-list-row').text()).toBe('Search result')
    expect(wrapper.find('.recommendation-grid').exists()).toBe(false)

    wrapper.unmount()
  })
})
