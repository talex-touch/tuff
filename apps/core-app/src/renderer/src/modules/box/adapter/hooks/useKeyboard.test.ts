// @vitest-environment jsdom
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { IBoxOptions } from '..'
import type { Ref } from 'vue'
import type { Mock } from 'vitest'
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

// One stable object: a factory returning a fresh mock per call would leave nothing to assert on.
const transportMock = vi.hoisted(() => ({
  send: vi.fn((_event: unknown, _payload?: unknown) => Promise.resolve(undefined))
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => transportMock
}))

const keyTransportMock = vi.hoisted(() => ({
  forwardKeyEvent: vi.fn(),
  getUIViewState: vi.fn(async () => ({ isActive: false, isFocused: false, isUIMode: false }))
}))

vi.mock('../transport/key-transport', () => ({
  createCoreBoxKeyTransport: () => keyTransportMock
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
  handleExecute: Mock
  cleanup: () => void
}

let activeGridKeyboardHarness: GridKeyboardHarness | undefined

function createGridResults(): TuffItem[] {
  return Array.from({ length: 10 }, (_, index) => ({ id: `grid-result-${index}` }) as TuffItem)
}

function mountGridKeyboardHarness(
  focus: number,
  layout: NonNullable<IBoxOptions['layout']> = { mode: 'grid', grid: { columns: 5 } },
  activations: IProviderActivate[] | null = null,
  items: TuffItem[] = createGridResults()
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
  const results = ref(items)
  const scrollbar = ref<{
    getScrollInfo: () => { clientHeight: number; scrollTop: number }
    scrollTo: (x: number, y: number) => void
  } | null>(null)
  const handleExecute = vi.fn()

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
        handleExecute,
        async () => undefined,
        ref<HTMLInputElement | undefined>(undefined),
        { last: undefined },
        vi.fn(),
        ref<IProviderActivate[] | null>(activations),
        vi.fn(),
        ref<Array<HTMLElement | null>>([])
      )
      return () => null
    }
  })
  app.mount(root)

  return {
    boxOptions,
    handleExecute,
    cleanup: () => {
      app.unmount()
      root.remove()
    }
  }
}

function dispatchGridKey(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
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

const CALCULATION_HISTORY_EVENT = 'corebox:show-calculation-history'

function createUIModeActivation(): IProviderActivate {
  return { id: 'plugin-features', hideResults: true }
}

describe('useKeyboard plugin UI-mode arrow forwarding', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    keyTransportMock.forwardKeyEvent.mockClear()
  })

  afterEach(() => {
    activeGridKeyboardHarness?.cleanup()
    activeGridKeyboardHarness = undefined
    document.body.classList.remove('core-box')
    vi.unstubAllGlobals()
  })

  it.each([
    { name: '⌘+ArrowRight', key: 'ArrowRight', init: { metaKey: true }, modifier: 'metaKey' },
    { name: 'Ctrl+ArrowLeft', key: 'ArrowLeft', init: { ctrlKey: true }, modifier: 'ctrlKey' }
  ])(
    'forwards $name to the attached plugin view instead of the host history panel',
    ({ key, init, modifier }) => {
      activeGridKeyboardHarness = mountGridKeyboardHarness(0, undefined, [createUIModeActivation()])
      const historyListener = vi.fn()
      window.addEventListener(CALCULATION_HISTORY_EVENT, historyListener)

      try {
        const event = dispatchGridKey(key, init)

        expect(event.defaultPrevented).toBe(true)
        expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledTimes(1)
        expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledWith(
          expect.objectContaining({ key, [modifier]: true })
        )
        expect(historyListener).not.toHaveBeenCalled()
      } finally {
        window.removeEventListener(CALCULATION_HISTORY_EVENT, historyListener)
      }
    }
  )

  it('keeps ⌘+ArrowLeft with the host history panel when no plugin UI view is attached', () => {
    activeGridKeyboardHarness = mountGridKeyboardHarness(0)
    const historyListener = vi.fn()
    window.addEventListener(CALCULATION_HISTORY_EVENT, historyListener)

    try {
      const event = dispatchGridKey('ArrowLeft', { metaKey: true })

      expect(keyTransportMock.forwardKeyEvent).not.toHaveBeenCalled()
      expect(historyListener).toHaveBeenCalledTimes(1)
      expect(event.defaultPrevented).toBe(true)
    } finally {
      window.removeEventListener(CALCULATION_HISTORY_EVENT, historyListener)
    }
  })
})

describe('useKeyboard detached DivisionBox arrow forwarding', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    keyTransportMock.forwardKeyEvent.mockClear()
    document.body.classList.add('division-box')
  })

  afterEach(() => {
    activeGridKeyboardHarness?.cleanup()
    activeGridKeyboardHarness = undefined
    document.body.classList.remove('core-box')
    document.body.classList.remove('division-box')
    vi.unstubAllGlobals()
  })

  it('forwards ⌘+ArrowLeft from a detached DivisionBox window even with no activations', () => {
    activeGridKeyboardHarness = mountGridKeyboardHarness(0)

    const event = dispatchGridKey('ArrowLeft', { metaKey: true })

    expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledTimes(1)
    expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ArrowLeft', metaKey: true })
    )
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves ⌘+ArrowLeft host-owned once the DivisionBox body class is removed', () => {
    activeGridKeyboardHarness = mountGridKeyboardHarness(0)
    document.body.classList.remove('division-box')

    const event = dispatchGridKey('ArrowLeft', { metaKey: true })

    expect(keyTransportMock.forwardKeyEvent).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('useKeyboard detached DivisionBox result keys', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    keyTransportMock.forwardKeyEvent.mockClear()
    document.body.classList.add('division-box')
  })

  afterEach(() => {
    activeGridKeyboardHarness?.cleanup()
    activeGridKeyboardHarness = undefined
    document.body.classList.remove('core-box')
    document.body.classList.remove('division-box')
    vi.unstubAllGlobals()
  })

  it.each([
    { name: 'Enter', init: {} },
    { name: '⌘+Enter', init: { metaKey: true } },
    { name: 'Ctrl+Enter', init: { ctrlKey: true } }
  ])('routes $name to the plugin view instead of executing the focused result', ({ init }) => {
    activeGridKeyboardHarness = mountGridKeyboardHarness(0)
    const harness = activeGridKeyboardHarness

    const event = dispatchGridKey('Enter', init)

    expect(harness.handleExecute).not.toHaveBeenCalled()
    expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledTimes(1)
    expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Enter', ...init })
    )
    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps Enter on the host result path once the DivisionBox body class is removed', () => {
    activeGridKeyboardHarness = mountGridKeyboardHarness(0)
    const harness = activeGridKeyboardHarness
    document.body.classList.remove('division-box')

    dispatchGridKey('Enter')

    expect(keyTransportMock.forwardKeyEvent).not.toHaveBeenCalled()
    expect(harness.handleExecute).toHaveBeenCalledTimes(1)
  })
})

type ActionKeyHarness = {
  boxOptions: IBoxOptions
  handleExecute: Mock
  dispatched: Array<{ actionId: string; item: TuffItem }>
  cleanup: () => void
}

let activeActionKeyHarness: ActionKeyHarness | undefined

const ACTION_FILE_ITEM = {
  id: '/Users/me/report.pdf',
  kind: 'file',
  source: { type: 'file', id: 'file-provider', name: 'Files' },
  render: { mode: 'default', basic: { title: 'report.pdf' } },
  actions: [
    { id: 'open-file', type: 'open', label: 'Open', primary: true, payload: { path: '/x' } },
    { id: 'file-copy-path', type: 'copy', label: 'Copy Path', payload: { text: '/x' } }
  ],
  meta: { file: { path: '/Users/me/report.pdf' } }
} as TuffItem

const ACTION_APP_ITEM = {
  id: 'com.apple.Safari',
  kind: 'app',
  source: { type: 'application', id: 'app-provider', name: 'Applications' },
  render: { mode: 'default', basic: { title: 'Safari' } },
  actions: [{ id: 'open-app', type: 'open', label: 'Open', primary: true, payload: {} }],
  meta: { app: { path: '/Applications/Safari.app' } }
} as TuffItem

const ACTION_PREVIEW_ITEM = {
  id: 'preview-1',
  kind: 'preview',
  source: { type: 'system', id: 'preview-provider', name: 'Preview' },
  render: { mode: 'default', basic: { title: '2 + 2 = 4' } },
  actions: [{ id: 'preview-copy-primary', type: 'copy', label: '复制结果', payload: {} }]
} as TuffItem

function mountActionKeyHarness(
  results: TuffItem[],
  activations: IProviderActivate[] | null = null
): ActionKeyHarness {
  const dispatched: ActionKeyHarness['dispatched'] = []
  const onAction = (event: Event): void => {
    dispatched.push((event as CustomEvent<{ actionId: string; item: TuffItem }>).detail)
  }
  window.addEventListener('corebox:meta-action', onAction)
  const harness = mountGridKeyboardHarness(0, undefined, activations, results)

  return {
    ...harness,
    dispatched,
    cleanup: () => {
      harness.cleanup()
      window.removeEventListener('corebox:meta-action', onAction)
    }
  }
}

/** The test platform is non-mac (see the renderer-platform mock), so Ctrl is the command key. */
function pressActionKey(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code,
    key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
    ctrlKey: true,
    ...init
  })
  document.dispatchEvent(event)
  return event
}

describe('useKeyboard ⌘K request', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    transportMock.send.mockClear()
  })

  afterEach(() => {
    activeActionKeyHarness?.cleanup()
    activeActionKeyHarness = undefined
    document.body.classList.remove('core-box')
    document.querySelectorAll('.CoreBoxFooter-Sticky').forEach((element) => element.remove())
    vi.unstubAllGlobals()
  })

  function lastShowRequest(): Record<string, unknown> {
    const call = transportMock.send.mock.calls.at(-1)
    expect(call, 'expected ⌘K to ask main to show the panel').toBeDefined()
    return call![1] as Record<string, unknown>
  }

  it('anchors above a displayed footer and says how tall the panel needs to be', () => {
    const footer = document.createElement('div')
    footer.className = 'CoreBoxFooter CoreBoxFooter-Sticky display'
    document.body.appendChild(footer)
    activeActionKeyHarness = mountActionKeyHarness([ACTION_APP_ITEM])

    const event = pressActionKey('KeyK')

    expect(event.defaultPrevented).toBe(true)
    const request = lastShowRequest()
    expect(request.anchor).toBe('footer')
    // Five rows in five sections, four titled: the same model the panel draws.
    expect(request.desiredPanelHeight).toBe(364)
    expect((request.builtinActions as Array<{ id: string }>).map((action) => action.id)).toEqual([
      '__corebox_primary__',
      'reveal-in-finder',
      'copy-title',
      'toggle-pin',
      'flow-transfer'
    ])
    expect((request.itemActions as Array<{ id: string }>).map((action) => action.id)).toEqual([
      'open-app'
    ])
  })

  it('drops to the window corner when no footer is shown', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_APP_ITEM])

    pressActionKey('KeyK')

    expect(lastShowRequest().anchor).toBe('corner')
  })

  it('drops to the corner in plugin UI mode even if a footer element lingers', () => {
    const footer = document.createElement('div')
    footer.className = 'CoreBoxFooter-Sticky display'
    document.body.appendChild(footer)
    activeActionKeyHarness = mountActionKeyHarness([ACTION_APP_ITEM], [createUIModeActivation()])

    pressActionKey('KeyK')

    expect(lastShowRequest().anchor).toBe('corner')
  })
})

describe('useKeyboard action shortcuts on the selected result', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    keyTransportMock.forwardKeyEvent.mockClear()
  })

  afterEach(() => {
    activeActionKeyHarness?.cleanup()
    activeActionKeyHarness = undefined
    document.body.classList.remove('core-box')
    document.querySelectorAll('.FlowSelector').forEach((element) => element.remove())
    window.__coreboxHistoryVisible = undefined
    vi.unstubAllGlobals()
  })

  it.each([
    { name: 'Mod⇧C copies the path', code: 'KeyC', init: { shiftKey: true }, id: 'file-copy-path' },
    { name: 'Mod⌥C copies the name', code: 'KeyC', init: { altKey: true }, id: 'copy-title' },
    { name: 'ModO reveals it', code: 'KeyO', init: {}, id: 'reveal-in-finder' },
    // Off macOS pin adds Shift: a Chinese IME takes Ctrl+. for punctuation width.
    { name: 'Ctrl+Shift+. pins it', code: 'Period', init: { shiftKey: true }, id: 'toggle-pin' },
    { name: 'Mod↵ runs the secondary', code: 'Enter', init: {}, id: 'reveal-in-finder' }
  ])('$name without opening the panel', ({ code, init, id }) => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])
    const harness = activeActionKeyHarness

    const event = pressActionKey(code, init)

    expect(event.defaultPrevented).toBe(true)
    expect(harness.dispatched).toEqual([{ actionId: id, item: ACTION_FILE_ITEM }])
    expect(harness.handleExecute).not.toHaveBeenCalled()
  })

  it('matches the physical key, so Option rewriting the character changes nothing', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    pressActionKey('KeyC', { altKey: true, key: 'ç' })

    expect(activeActionKeyHarness.dispatched.map((detail) => detail.actionId)).toEqual([
      'copy-title'
    ])
  })

  it('does not respond to, or swallow, a key that does not apply to the item', () => {
    // An app has no path to copy.
    activeActionKeyHarness = mountActionKeyHarness([ACTION_APP_ITEM])

    const event = pressActionKey('KeyC', { shiftKey: true })

    expect(event.defaultPrevented).toBe(false)
    expect(activeActionKeyHarness.dispatched).toEqual([])
  })

  it('lets Mod↵ fall through to the ordinary Enter path when there is no secondary', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_PREVIEW_ITEM])

    pressActionKey('Enter')

    expect(activeActionKeyHarness.dispatched).toEqual([])
    expect(activeActionKeyHarness.handleExecute).toHaveBeenCalledExactlyOnceWith(
      ACTION_PREVIEW_ITEM
    )
  })

  it('leaves keys to the IME while it composes', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    const event = pressActionKey('KeyO', { isComposing: true })

    expect(event.defaultPrevented).toBe(false)
    expect(activeActionKeyHarness.dispatched).toEqual([])
  })

  it('runs once for a held chord, swallowing the auto-repeats', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    pressActionKey('Period', { shiftKey: true })
    const repeat = pressActionKey('Period', { shiftKey: true, repeat: true })

    expect(repeat.defaultPrevented).toBe(true)
    expect(activeActionKeyHarness.dispatched).toHaveLength(1)
  })

  it('leaves Ctrl+. alone off macOS, where it belongs to the IME', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    const event = pressActionKey('Period')

    expect(event.defaultPrevented).toBe(false)
    expect(activeActionKeyHarness.dispatched).toEqual([])
  })

  it('keeps forwarding to an attached plugin view in UI mode', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM], [createUIModeActivation()])

    pressActionKey('KeyC', { altKey: true })

    expect(activeActionKeyHarness.dispatched).toEqual([])
    expect(keyTransportMock.forwardKeyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KeyC', ctrlKey: true, altKey: true })
    )
  })

  it('leaves Mod⇧D to the existing Flow shortcut', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])
    const flowListener = vi.fn()
    window.addEventListener('corebox:flow-item', flowListener)

    try {
      pressActionKey('KeyD', { shiftKey: true, key: 'D' })

      expect(activeActionKeyHarness.dispatched).toEqual([])
      expect(flowListener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('corebox:flow-item', flowListener)
    }
  })

  it('stays out of the way of the Flow picker and the calculation history', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    const flowSelector = document.createElement('div')
    flowSelector.className = 'FlowSelector'
    document.body.appendChild(flowSelector)
    pressActionKey('KeyO')
    flowSelector.remove()

    window.__coreboxHistoryVisible = true
    pressActionKey('KeyO')

    expect(activeActionKeyHarness.dispatched).toEqual([])
  })
})

/**
 * An Enter held on a ⌘K row. The panel runs the row, main hides it and hands focus back to
 * CoreBox, and the key is still down: its auto-repeats arrive here, and used to run the selected
 * result as well — opening the file whose path the user had only copied.
 */
describe('useKeyboard Enter held over from the ⌘K panel', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    keyTransportMock.forwardKeyEvent.mockClear()
  })

  afterEach(() => {
    activeActionKeyHarness?.cleanup()
    activeActionKeyHarness = undefined
    document.body.classList.remove('core-box')
    vi.unstubAllGlobals()
  })

  function pressEnter(init: KeyboardEventInit = {}): KeyboardEvent {
    return dispatchGridKey('Enter', { code: 'Enter', ...init })
  }

  it('swallows the auto-repeats of an Enter pressed in another document', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    const repeat = pressEnter({ repeat: true })

    expect(repeat.defaultPrevented).toBe(true)
    expect(activeActionKeyHarness.handleExecute).not.toHaveBeenCalled()

    // The next real press is the user's again.
    pressEnter()
    expect(activeActionKeyHarness.handleExecute).toHaveBeenCalledExactlyOnceWith(ACTION_FILE_ITEM)
  })

  it('leaves a press that began here to repeat as before', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    pressEnter()
    pressEnter({ repeat: true })

    expect(activeActionKeyHarness.handleExecute).toHaveBeenCalledTimes(2)
  })

  it('leaves the Enter an IME commits with to the IME', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])

    // A fresh press, so not the guard's: it neither runs the result nor is taken from the IME.
    const composing = pressEnter({ isComposing: true })

    expect(composing.defaultPrevented).toBe(false)
    expect(activeActionKeyHarness.handleExecute).not.toHaveBeenCalled()
  })

  it.each(['blur', 'focus'])('forgets a press once the window sees %s', (type) => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])
    pressEnter()

    // Focus moved to the panel, so the keyup went there; main then hands focus back.
    window.dispatchEvent(new Event(type))
    pressEnter({ repeat: true })

    expect(activeActionKeyHarness.handleExecute).toHaveBeenCalledTimes(1)
  })

  it('forgets a press on its keyup', () => {
    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM])
    pressEnter()
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter' }))

    pressEnter({ repeat: true })

    expect(activeActionKeyHarness.handleExecute).toHaveBeenCalledTimes(1)
  })

  it('stops a held Mod↵ too, and never forwards the repeats to a plugin view', () => {
    // No secondary: Mod↵ would fall through to the plain Enter path.
    activeActionKeyHarness = mountActionKeyHarness([ACTION_PREVIEW_ITEM])
    pressEnter({ ctrlKey: true, repeat: true })
    expect(activeActionKeyHarness.handleExecute).not.toHaveBeenCalled()
    activeActionKeyHarness.cleanup()

    activeActionKeyHarness = mountActionKeyHarness([ACTION_FILE_ITEM], [createUIModeActivation()])
    const repeat = pressEnter({ repeat: true })
    expect(repeat.defaultPrevented).toBe(true)
    expect(keyTransportMock.forwardKeyEvent).not.toHaveBeenCalled()
  })
})
