// @vitest-environment jsdom
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type * as VueUse from '@vueuse/core'
import type { IBoxOptions } from '..'
import type { IClipboardOptions } from './types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import ItemSubtitle from '~/components/render/ItemSubtitle.vue'
import { BoxMode } from '..'
import { useSearch } from './useSearch'

/**
 * R7.1 (2026-09-26) end to end: the rows useSearch puts on screen decide which file rows share a
 * name, and ItemSubtitle shows those rows' folders. useSearch.core.test.ts calls useSearch outside
 * a component, where nothing is provided, so it cannot see this.
 */

interface StreamOptions {
  onData: (payload: unknown) => void
  onError?: (error: unknown) => void
  onEnd?: () => void
}

const state = vi.hoisted(() => ({
  /** Query text → its snapshot rows, then the rows its deferred update brings. */
  runs: new Map<string, { snapshot: TuffItem[]; update?: TuffItem[] }>()
}))

vi.mock('@talex-touch/utils/transport', () => {
  const nameOf = (event: unknown): string =>
    typeof event === 'string'
      ? event
      : ((event as { toEventName?: () => string } | null)?.toEventName?.() ?? String(event))
  let sessions = 0
  return {
    useTuffTransport: () => ({
      on: () => () => {},
      send: async (event: unknown) => (nameOf(event).includes('provider') ? [] : undefined),
      stream: async (event: unknown, payload: unknown, options: StreamOptions) => {
        if (nameOf(event) !== 'core-box:search:session') return { cancel: () => {} }
        const text = (payload as { query?: { text?: string } }).query?.text ?? ''
        const sessionId = `session-${++sessions}`
        const run = state.runs.get(text) ?? { snapshot: [] }
        options.onData({ type: 'session', sessionId })
        void Promise.resolve().then(() => {
          const result: TuffSearchResult = {
            items: run.snapshot,
            query: { text, inputs: [] },
            duration: 1,
            sources: [],
            sessionId
          }
          options.onData({ type: 'snapshot', sessionId, result })
          if (run.update) options.onData({ type: 'update', sessionId, items: run.update })
          options.onData({ type: 'complete', sessionId })
          options.onEnd?.()
        })
        return { cancel: () => {} }
      }
    })
  }
})

vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal<typeof VueUse>()),
  useDebounceFn: (fn: (...args: unknown[]) => unknown) =>
    Object.assign((...args: unknown[]) => fn(...args), { cancel: () => {} })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/box/item-sdk', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  return { useBoxItems: () => ({ items: ref([]) }) }
})

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: {
    searchEngine: { logsEnabled: false },
    diagnostics: { verboseLogs: false },
    recommendation: { enabled: true },
    tools: { autoHide: true, autoPaste: { enable: true, time: 5 } }
  }
}))

vi.mock('~/utils/dev-log', () => ({ devLog: () => {} }))

vi.mock('~/modules/hooks/core-box', () => ({
  isDivisionBoxMode: () => false,
  windowState: { type: 'corebox', divisionBox: null }
}))

vi.mock('../transport/input-transport', () => ({
  createCoreBoxInputTransport: () => ({ broadcast: () => {} })
}))

vi.mock('./useResize', () => ({ useResize: () => {} }))

vi.mock('./useClipboardChannel', () => ({ getLatestClipboard: async () => null }))

const FONT = 'KaTeX_Caligraphic-Regular-wX97UBjC.ttf'
const TALEX_FONT = `/Users/demo/Workspace/talex-touch/apps/core-app/out/renderer/assets/${FONT}`
const MIKOBOT_FONT = `/Users/demo/Workspace/mikobot/nanobot/web/dist/assets/${FONT}`
const README = '/Users/demo/Documents/docs/README.md'

function fileRow(path: string): TuffItem {
  return {
    id: path,
    kind: 'file',
    source: { id: 'macos-spotlight-provider', type: 'file' },
    render: { mode: 'default', basic: { title: path.split('/').at(-1) } },
    meta: { file: { path, size: 12_344, modified_at: '2026-09-25T19:07:00.000Z' } }
  } as TuffItem
}

const appRow = {
  id: 'app-wechat',
  kind: 'app',
  source: { id: 'app-provider', type: 'application' },
  render: { mode: 'default', basic: { title: 'WeChat', subtitle: 'Application' } }
} as TuffItem

let hook: ReturnType<typeof useSearch>

const Host = defineComponent({
  setup() {
    const boxOptions = reactive<IBoxOptions>({
      lastHidden: -1,
      mode: BoxMode.INPUT,
      focus: 0,
      file: { buffer: null, paths: [] },
      data: {},
      layout: undefined
    })
    const clipboardOptions = reactive<IClipboardOptions>({
      last: null,
      pendingAutoFillItem: null,
      detectedAt: null,
      lastClearedTimestamp: null,
      activeClipboardSource: null
    })
    hook = useSearch(boxOptions, clipboardOptions)
    return () =>
      h(
        'ul',
        hook.res.value.map((item) =>
          h('li', { key: item.id, 'data-id': item.id }, [
            h(ItemSubtitle, { item, render: item.render })
          ])
        )
      )
  }
})

let wrapper: ReturnType<typeof mount> | null = null

async function search(text: string): Promise<void> {
  hook.searchVal.value = text
  await flushPromises()
  await flushPromises()
}

/** What each row's subtitle names as its folder; `null` for a row that shows no folder. */
function folders(): Record<string, string | null> {
  const rows = wrapper!.findAll('li')
  return Object.fromEntries(
    rows.map((row) => {
      const folder = row.find('.i-carbon-folder + span')
      return [row.attributes('data-id'), folder.exists() ? folder.text() : null]
    })
  )
}

beforeEach(async () => {
  state.runs.clear()
  wrapper = mount(Host)
  await flushPromises()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('same-name file rows in CoreBox results', () => {
  it('show the folders of the rows that share a name, and only of those', async () => {
    state.runs.set('wx', {
      snapshot: [appRow, fileRow(TALEX_FONT), fileRow(README), fileRow(MIKOBOT_FONT)]
    })

    await search('wx')

    expect(folders()).toEqual({
      [appRow.id]: null,
      [TALEX_FONT]: '…/renderer/assets',
      [README]: 'docs',
      [MIKOBOT_FONT]: '…/dist/assets'
    })
    expect(wrapper!.get(`[data-id="${appRow.id}"]`).text()).toBe('Application')
  })

  it('follow the rows on screen: a later batch makes two rows share a name, a new query parts them', async () => {
    state.runs.set('katex caligraphic', { snapshot: [fileRow(TALEX_FONT)] })
    // The fast layer has one copy; the deferred layer brings the second.
    state.runs.set('katex', { snapshot: [fileRow(TALEX_FONT)], update: [fileRow(MIKOBOT_FONT)] })

    await search('katex caligraphic')
    expect(folders()).toEqual({ [TALEX_FONT]: 'assets' })

    await search('katex')
    expect(folders()).toEqual({
      [TALEX_FONT]: '…/renderer/assets',
      [MIKOBOT_FONT]: '…/dist/assets'
    })

    await search('katex caligraphic')
    expect(folders()).toEqual({ [TALEX_FONT]: 'assets' })
  })
})
