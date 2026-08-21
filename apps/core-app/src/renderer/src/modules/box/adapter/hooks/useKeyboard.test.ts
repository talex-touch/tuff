// @vitest-environment jsdom
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { IBoxOptions } from '..'
import type { Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'
import { BoxMode } from '..'
import {
  clearCoreBoxAttachment,
  handleCoreBoxEscapeKey,
  hasCoreBoxAttachment,
  resolveQuickActionsItem,
  shouldForwardKey,
  useKeyboard
} from './useKeyboard'

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: vi.fn() })
}))

vi.mock('../transport/key-transport', () => ({
  createCoreBoxKeyTransport: () => ({
    forwardKeyEvent: vi.fn(),
    getUIViewState: vi.fn(async () => ({ isActive: false, isFocused: false, isUIMode: false }))
  })
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({
    platform: 'unknown',
    isMac: false,
    isWindows: false,
    isLinux: false
  })
}))

vi.mock('~/modules/plugin/widget-host-key-bridge', () => ({
  publishWidgetHostKeyEvent: vi.fn()
}))

vi.mock('~/utils/dev-log', () => ({ devLog: vi.fn() }))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: vi.fn() })
}))

function createFocusedItem(): TuffItem {
  return {
    id: 'stale-feature-entry',
    kind: 'feature',
    source: {
      id: 'plugin-features',
      type: 'plugin'
    },
    render: {
      basic: {
        title: '智能问答'
      }
    },
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask'
    }
  } as TuffItem
}

function createActiveWidgetItem(): TuffItem {
  return {
    id: 'intelligence-widget',
    kind: 'feature',
    source: {
      id: 'plugin-features',
      type: 'plugin'
    },
    render: {
      mode: 'custom',
      custom: {
        type: 'vue',
        content: 'touch-intelligence::intelligence-ask',
        data: {
          status: 'ready',
          answer: 'Response succeeded with answer.'
        }
      },
      basic: {
        title: '智能问答：hello'
      }
    },
    actions: [
      {
        id: 'copy-answer',
        type: 'execute',
        label: '复制回答'
      }
    ],
    meta: {
      pluginName: 'touch-intelligence',
      featureId: 'intelligence-ask',
      status: 'ready',
      defaultAction: 'intelligence-action',
      actionId: 'copy-answer',
      payload: {
        prompt: 'hello',
        answer: 'Response succeeded with answer.'
      }
    }
  } as TuffItem
}

describe('shouldForwardKey', () => {
  function createKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: 'd',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...overrides
    } as KeyboardEvent
  }

  it('keeps CoreBox Flow shortcuts in the host page instead of forwarding them to plugins', () => {
    expect(shouldForwardKey(createKeyEvent({ metaKey: true }), true)).toBe(false)
    expect(shouldForwardKey(createKeyEvent({ ctrlKey: true, shiftKey: true }), false)).toBe(false)
  })

  it('continues forwarding unrelated command shortcuts to the attached plugin view', () => {
    expect(shouldForwardKey(createKeyEvent({ key: 'x', metaKey: true }), true)).toBe(true)
  })
})

describe('resolveQuickActionsItem', () => {
  it('prefers the active plugin widget item over a stale focused result', () => {
    const activeWidget = createActiveWidgetItem()
    const activation: IProviderActivate = {
      id: 'plugin-features',
      meta: {
        pluginName: 'touch-intelligence',
        featureId: 'intelligence-ask',
        feature: activeWidget
      }
    }

    const resolved = resolveQuickActionsItem([createFocusedItem()], 0, [activation])

    expect(resolved).toBe(activeWidget)
    expect(resolved?.actions?.[0]?.id).toBe('copy-answer')
  })

  it('falls back to the focused result when no active plugin widget exists', () => {
    const focused = createFocusedItem()

    expect(resolveQuickActionsItem([focused], 0, null)).toBe(focused)
  })
})

describe('CoreBox attachment keyboard helpers', () => {
  it('treats clipboard images as attachments', () => {
    expect(
      hasCoreBoxAttachment(
        {
          mode: BoxMode.INPUT,
          file: { buffer: null, paths: [] }
        },
        {
          last: {
            type: 'image',
            content: 'data:image/png;base64,preview'
          }
        }
      )
    ).toBe(true)
  })

  it('does not treat absent visible clipboard content as an attachment', () => {
    expect(
      hasCoreBoxAttachment(
        {
          mode: BoxMode.INPUT,
          file: { buffer: null, paths: [] }
        },
        {}
      )
    ).toBe(false)
  })

  it('clears file mode back to plain input mode', () => {
    const boxOptions = {
      mode: BoxMode.FILE,
      file: { iconPath: '/tmp/a.png', paths: ['/tmp/a.png'] }
    }
    const clearClipboard = vi.fn()

    clearCoreBoxAttachment(boxOptions, clearClipboard)

    expect(clearClipboard).toHaveBeenCalledWith({ remember: true })
    expect(boxOptions.mode).toBe(BoxMode.INPUT)
    expect(boxOptions.file).toEqual({ buffer: null, paths: [] })
  })
})

function createEscapeEvent(): KeyboardEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as KeyboardEvent
}

function createEscapeOptions(overrides?: {
  overlayVisible?: boolean
  searchVal?: Ref<string>
  clearClipboard?: ReturnType<typeof vi.fn>
}) {
  const event = createEscapeEvent()
  const isMetaOverlayVisible = vi.fn(async () => overrides?.overlayVisible === true)
  const hideMetaOverlay = vi.fn(async () => undefined)
  const clearClipboard = overrides?.clearClipboard ?? vi.fn()
  const handleExit = vi.fn(async () => undefined)
  const searchVal = overrides?.searchVal ?? ref('')

  return {
    event,
    isMetaOverlayVisible,
    hideMetaOverlay,
    boxOptions: {
      mode: BoxMode.INPUT,
      file: { buffer: null, paths: [] }
    },
    clipboardOptions: {
      last: {
        type: 'image',
        content: 'data:image/png;base64,preview'
      }
    },
    clearClipboard,
    activeCount: 0,
    handleExit,
    searchVal
  }
}

describe('handleCoreBoxEscapeKey', () => {
  it('closes MetaOverlay before clearing visible attachments', async () => {
    const options = createEscapeOptions({ overlayVisible: true })

    const result = await handleCoreBoxEscapeKey(options)

    expect(result).toBe('overlay')
    expect(options.event.preventDefault).toHaveBeenCalledTimes(1)
    expect(options.event.stopPropagation).toHaveBeenCalledTimes(1)
    expect(options.isMetaOverlayVisible).toHaveBeenCalledTimes(1)
    expect(options.hideMetaOverlay).toHaveBeenCalledTimes(1)
    expect(options.clearClipboard).not.toHaveBeenCalled()
  })

  it('clears attachments after confirming MetaOverlay is not visible', async () => {
    const options = createEscapeOptions({ overlayVisible: false })

    const result = await handleCoreBoxEscapeKey(options)

    expect(result).toBe('attachment')
    expect(options.clearClipboard).toHaveBeenCalledWith({ remember: true })
    expect(options.handleExit).not.toHaveBeenCalled()
  })
})

type GridKeyboardHarness = {
  boxOptions: IBoxOptions
  cleanup: () => void
}

let activeGridKeyboardHarness: GridKeyboardHarness | undefined

function createGridResults(): TuffItem[] {
  return Array.from({ length: 10 }, (_, index) => ({ id: `grid-result-${index}` }) as TuffItem)
}

function mountGridKeyboardHarness(
  focus: number,
  layout: NonNullable<IBoxOptions['layout']> = { mode: 'grid', grid: { columns: 5 } }
): GridKeyboardHarness {
  const root = document.createElement('div')
  const boxOptions: IBoxOptions = {
    lastHidden: -1,
    mode: BoxMode.INPUT,
    focus,
    file: { buffer: null, paths: [] },
    data: {},
    layout
  }
  const results = ref(createGridResults())
  const scrollbar = ref<{
    getScrollInfo: () => { clientHeight: number; scrollTop: number }
    scrollTo: (x: number, y: number) => void
  } | null>(null)

  document.body.classList.add('core-box')
  document.body.appendChild(root)

  const app = createApp({
    setup() {
      useKeyboard(
        boxOptions,
        results,
        ref(-1),
        scrollbar,
        ref(''),
        vi.fn(),
        async () => undefined,
        ref<HTMLInputElement | undefined>(undefined),
        { last: undefined },
        vi.fn(),
        ref<IProviderActivate[] | null>(null),
        vi.fn(),
        ref<Array<HTMLElement | null>>([])
      )
      return () => null
    }
  })
  app.mount(root)

  return {
    boxOptions,
    cleanup: () => {
      app.unmount()
      root.remove()
    }
  }
}

function dispatchGridKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
  document.dispatchEvent(event)
  return event
}

describe('useKeyboard grid navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
  })

  afterEach(() => {
    activeGridKeyboardHarness?.cleanup()
    activeGridKeyboardHarness = undefined
    document.body.classList.remove('core-box')
    vi.unstubAllGlobals()
  })

  it.each([
    { key: 'ArrowDown', focus: 2, expectedFocus: 7 },
    { key: 'ArrowRight', focus: 6, expectedFocus: 7 },
    { key: 'ArrowUp', focus: 7, expectedFocus: 2 },
    { key: 'ArrowLeft', focus: 7, expectedFocus: 6 }
  ])('moves focus with plain $key in the five-column grid', ({ key, focus, expectedFocus }) => {
    activeGridKeyboardHarness = mountGridKeyboardHarness(focus)

    const event = dispatchGridKey(key)

    expect(activeGridKeyboardHarness.boxOptions.focus).toBe(expectedFocus)
    expect(event.defaultPrevented).toBe(true)
  })

  it('uses five columns for a single intelligence recommendation section', () => {
    const itemIds = createGridResults().map((item) => item.id)
    activeGridKeyboardHarness = mountGridKeyboardHarness(4, {
      mode: 'grid',
      grid: { columns: 8 },
      sections: [
        {
          id: 'intelligence-recommendations',
          layout: 'grid',
          itemIds,
          meta: { intelligence: true }
        }
      ]
    })

    const downEvent = dispatchGridKey('ArrowDown')

    expect(activeGridKeyboardHarness.boxOptions.focus).toBe(9)
    expect(downEvent.defaultPrevented).toBe(true)

    const upEvent = dispatchGridKey('ArrowUp')

    expect(activeGridKeyboardHarness.boxOptions.focus).toBe(4)
    expect(upEvent.defaultPrevented).toBe(true)
  })
})
