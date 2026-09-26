import type { BrowserWindow } from 'electron'
import type { AppDestinationId } from '../../../shared/app-destinations'
import type { AppDestinationRuntime } from './app-destination-navigation'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAppDestinationNavigationService,
  normalizeConversationId
} from './app-destination-navigation'

const mocks = vi.hoisted(() => ({
  getTuffTransportMain: vi.fn()
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: mocks.getTuffTransportMain
}))

const PRIMARY_WEB_CONTENTS_ID = 101
const REPLACEMENT_WEB_CONTENTS_ID = 202

/** Electron listeners receive the event plus per-event arguments (see `did-start-navigation`). */
type Listener = (...args: unknown[]) => void

/**
 * A renderer with its own listener registry, so a test can prove the service stopped listening to
 * the *old* renderer after re-observing a replacement: an event emitted on this object only
 * reaches listeners registered on this object.
 */
function createWebContentsFake(id: number) {
  const listeners = new Map<string, Set<Listener>>()
  const webContents = {
    id,
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>()
      set.add(listener)
      listeners.set(event, set)
      return webContents
    }),
    removeListener: vi.fn((event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener)
      return webContents
    })
  }
  return {
    webContents,
    emit(event: string, ...args: unknown[]) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args)
    }
  }
}

function createRenderer() {
  const windowListeners = new Map<string, Set<Listener>>()
  const registerWindow = (event: string, listener: Listener) => {
    const set = windowListeners.get(event) ?? new Set<Listener>()
    set.add(listener)
    windowListeners.set(event, set)
  }
  const primary = createWebContentsFake(PRIMARY_WEB_CONTENTS_ID)
  const webContents = primary.webContents
  const window = {
    id: 7,
    webContents,
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    once: vi.fn((event: string, listener: Listener) => {
      registerWindow(event, listener)
      return window
    }),
    removeListener: vi.fn((event: string, listener: Listener) => {
      windowListeners.get(event)?.delete(listener)
      return window
    })
  }
  return {
    window,
    webContents,
    emit(event: string, ...args: unknown[]) {
      primary.emit(event, ...args)
      for (const listener of [...(windowListeners.get(event) ?? [])]) listener(...args)
    },
    replaceWebContents() {
      const replacement = createWebContentsFake(REPLACEMENT_WEB_CONTENTS_ID)
      window.webContents = replacement.webContents
      return replacement
    }
  }
}

function createService() {
  const renderer = createRenderer()
  const transport = { broadcastToWindow: vi.fn() }
  mocks.getTuffTransportMain.mockReturnValue(transport)
  const runtime: AppDestinationRuntime = {
    window: { window: renderer.window as unknown as BrowserWindow },
    channel: {}
  }
  const service = getAppDestinationNavigationService(runtime)
  return { service, runtime, transport, ...renderer }
}

/**
 * The service is the single place that reveals Tuff and delivers an allowlisted route. The
 * regressions that matter are the ones a caller cannot see: a queued route dropped during the
 * startup handshake, an old route replayed after a reload, or a non-primary renderer handshake
 * releasing a route that was meant for the main window.
 */
describe('appDestinationNavigationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reveals the window without touching the route for the reveal-only destination', () => {
    const { service, transport, window } = createService()

    expect(service.open('main-window')).toEqual({ status: 'opened', destinationId: 'main-window' })
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('restores a minimized window before showing and focusing it', () => {
    const { service, window } = createService()
    window.isMinimized.mockReturnValue(true)

    service.open('main-window')

    const order = [
      window.restore.mock.invocationCallOrder[0],
      window.show.mock.invocationCallOrder[0],
      window.focus.mock.invocationCallOrder[0]
    ]
    expect(order[0]).toBeLessThan(order[1] as number)
    expect(order[1]).toBeLessThan(order[2] as number)
  })

  it('queues a routed destination before readiness but still reveals the window', () => {
    const { service, transport, window } = createService()

    expect(service.open('home')).toEqual({ status: 'queued', destinationId: 'home' })
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('delivers only the latest queued route once the primary renderer is ready', () => {
    const { service, transport, window } = createService()

    service.open('home')
    service.open('settings-network')
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/network' }
    )
  })

  it('broadcasts a routed destination immediately once ready', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    expect(service.open('settings-appearance')).toEqual({
      status: 'opened',
      destinationId: 'settings-appearance'
    })
    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/appearance' }
    )
  })

  it('ignores the startup handshake from any sender but the primary renderer', () => {
    const { service, transport } = createService()

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID + 1)
    expect(service.open('home')).toEqual({ status: 'queued', destinationId: 'home' })
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)
  })

  it('drops readiness on a main-frame cross-document navigation and holds the next route', () => {
    const { service, transport, emit, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    service.open('home')
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)

    // (event, url, isInPlace, isMainFrame): a real document replacement, so the listener that
    // acknowledged readiness is gone with the document.
    emit('did-start-navigation', {}, 'tuff://renderer/index.html', false, true)
    expect(service.open('settings-update')).toEqual({
      status: 'queued',
      destinationId: 'settings-update'
    })
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
  })

  it('keeps readiness for subframe and same-document navigation', () => {
    const { service, transport, emit, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(service.open('home').status).toBe('opened')

    // A subframe loading (isMainFrame false) and an in-page navigation (isInPlace true) both
    // leave the primary document — and its navigate listener — intact.
    emit('did-start-navigation', {}, 'https://accounts.example/oauth', false, false)
    emit('did-start-navigation', {}, 'tuff://renderer/index.html#/setting/general', true, true)

    expect(service.open('settings-update')).toEqual({
      status: 'opened',
      destinationId: 'settings-update'
    })
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
  })

  it('keeps a pending route across renderer process loss and delivers it on the next handshake', () => {
    const { service, transport, emit, window } = createService()
    expect(service.open('home')).toEqual({ status: 'queued', destinationId: 'home' })

    // A crashed renderer is replaced, not a reason to forget what the user asked for.
    emit('render-process-gone')
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home' }
    )
  })

  it('retries a queued route when the handshake broadcast fails', () => {
    const { service, transport, window } = createService()
    expect(service.open('home').status).toBe('queued')

    transport.broadcastToWindow.mockImplementationOnce(() => {
      throw new Error('renderer gone')
    })
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)

    // The renderer that failed the delivery is replaced and handshakes again: the intent that
    // was never delivered is still pending, so it must be attempted a second time.
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID + 1)
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home' }
    )
  })

  it('stops listening to the replaced renderer after re-observing a new one', () => {
    const { service, transport, emit, replaceWebContents, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(service.open('home').status).toBe('opened')

    replaceWebContents()
    service.markPrimaryRendererReady(REPLACEMENT_WEB_CONTENTS_ID)
    expect(service.open('home').status).toBe('opened')

    // Emitted on the *dead* renderer: if its navigation listener survived the re-observe,
    // readiness would drop and the next routed open would queue instead of delivering.
    emit('did-start-navigation', {}, 'tuff://renderer/index.html', false, true)
    expect(service.open('settings-update').status).toBe('opened')
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
  })

  it('requires a new readiness handshake when the window swaps renderer webContents', () => {
    const { service, transport, replaceWebContents, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(service.open('home').status).toBe('opened')

    replaceWebContents()
    expect(service.open('settings-update').status).toBe('queued')
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)

    service.markPrimaryRendererReady(REPLACEMENT_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
  })

  it('retries after a ready-path broadcast failure instead of dropping the requested route', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    transport.broadcastToWindow.mockImplementationOnce(() => {
      throw new Error('channel not ready')
    })

    // The reveal already happened and readiness was true, so a silent "opened" here would leave
    // the user staring at a window that never navigated.
    expect(service.open('home')).toEqual({ status: 'queued', destinationId: 'home' })
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home' }
    )

    // The retry delivered it, so the item is not replayed on the next navigation.
    expect(service.open('settings-update').status).toBe('opened')
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
  })

  it('retries a failed ready-path delivery on the next routed open from the same renderer', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    transport.broadcastToWindow.mockImplementationOnce(() => {
      throw new Error('channel not ready')
    })

    expect(service.open('home')).toEqual({ status: 'queued', destinationId: 'home' })
    expect(service.open('settings-update')).toEqual({
      status: 'opened',
      destinationId: 'settings-update'
    })
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
  })

  it('waits for a replacement renderer handshake instead of retrying its predecessor state', () => {
    const { service, transport, replaceWebContents, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    transport.broadcastToWindow.mockImplementationOnce(() => {
      throw new Error('renderer replaced')
    })

    expect(service.open('home').status).toBe('queued')
    replaceWebContents()
    expect(service.open('settings-update').status).toBe('queued')
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)

    service.markPrimaryRendererReady(REPLACEMENT_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(2)
    expect(transport.broadcastToWindow).toHaveBeenLastCalledWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/setting/update' }
    )
  })

  it('reports an unavailable window and clears the route when the window dies during a failed broadcast', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    transport.broadcastToWindow.mockImplementationOnce(() => {
      window.isDestroyed.mockReturnValue(true)
      throw new Error('window went away')
    })

    expect(service.open('home')).toEqual({
      status: 'unavailable',
      destinationId: 'home',
      reason: 'window-unavailable'
    })

    // The window is gone for good, so the intent is not kept for a handshake that cannot come.
    window.isDestroyed.mockReturnValue(false)
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)
  })

  it('keeps a queued route while the renderer is momentarily unavailable', () => {
    const { service, transport, window } = createService()
    expect(service.open('home').status).toBe('queued')

    window.webContents.isDestroyed.mockReturnValue(true)
    expect(service.open('settings-update')).toEqual({
      status: 'unavailable',
      destinationId: 'settings-update',
      reason: 'renderer-unavailable'
    })

    window.webContents.isDestroyed.mockReturnValue(false)
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home' }
    )
  })

  it('clears a pending route when the window closes', () => {
    const { service, transport, emit } = createService()
    service.open('settings-voice')

    emit('closed')
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('reports unavailable without revealing or broadcasting when the window is destroyed', () => {
    const { service, transport, window } = createService()
    window.isDestroyed.mockReturnValue(true)

    expect(service.open('home')).toEqual({
      status: 'unavailable',
      destinationId: 'home',
      reason: 'window-unavailable'
    })
    expect(window.show).not.toHaveBeenCalled()
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('reports unavailable when the renderer is destroyed', () => {
    const { service, transport, window } = createService()
    window.webContents.isDestroyed.mockReturnValue(true)

    expect(service.open('home')).toEqual({
      status: 'unavailable',
      destinationId: 'home',
      reason: 'renderer-unavailable'
    })
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('rejects an arbitrary destination id without revealing the window', () => {
    const { service, transport, window } = createService()

    expect(service.open('settings-download' as AppDestinationId)).toEqual({
      status: 'unavailable',
      destinationId: 'settings-download',
      reason: 'destination-unavailable'
    })
    expect(window.show).not.toHaveBeenCalled()
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('shares readiness state across callers that resolve the same runtime', () => {
    const { service, runtime, transport } = createService()

    const sameRuntime = getAppDestinationNavigationService(runtime)
    expect(sameRuntime).toBe(service)

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(sameRuntime.open('home').status).toBe('opened')
    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)
  })
})

/**
 * `beforeEffect` is the fence the privileged plugin host uses to re-validate its activation
 * generation between individual window effects. If the hook fired once for the whole call — or
 * if a throw were swallowed into an `unavailable` result — a revoked plugin could still be
 * focused into the user's face and its action would look like a plain failure instead of an
 * authority error.
 */
describe('appDestinationNavigationService beforeEffect fence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('propagates an authority failure raised between restore and show, skipping later effects', () => {
    const { service, window } = createService()
    window.isMinimized.mockReturnValue(true)
    const authorityError = new Error('PLUGIN_HOST_CAPABILITY_CANCELLED')
    let calls = 0
    const beforeEffect = vi.fn(() => {
      calls += 1
      if (calls === 2) throw authorityError
    })

    expect(() => service.open('main-window', { beforeEffect })).toThrow(authorityError)
    expect(beforeEffect).toHaveBeenCalledTimes(2)
    expect(window.restore).toHaveBeenCalledTimes(1)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('applies no window effect at all when the first fence call fails', () => {
    const { service, window } = createService()
    window.isMinimized.mockReturnValue(true)
    const authorityError = new Error('PLUGIN_HOST_CAPABILITY_CANCELLED')

    expect(() =>
      service.open('main-window', {
        beforeEffect: () => {
          throw authorityError
        }
      })
    ).toThrow(authorityError)
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('fences the route broadcast on the ready path', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    const authorityError = new Error('PLUGIN_HOST_CAPABILITY_CANCELLED')
    let calls = 0
    const beforeEffect = vi.fn(() => {
      calls += 1
      if (calls === 3) throw authorityError
    })

    expect(() => service.open('home', { beforeEffect })).toThrow(authorityError)
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledTimes(1)
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('runs the fence immediately before every effect it guards', () => {
    const { service, transport, window } = createService()
    const order: string[] = []
    window.isMinimized.mockReturnValue(true)
    window.restore.mockImplementation(() => order.push('restore'))
    window.show.mockImplementation(() => order.push('show'))
    window.focus.mockImplementation(() => order.push('focus'))
    transport.broadcastToWindow.mockImplementation(() => order.push('broadcast'))
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    const result = service.open('home', { beforeEffect: () => order.push('fence') })

    expect(result.status).toBe('opened')
    expect(order).toEqual([
      'fence',
      'restore',
      'fence',
      'show',
      'fence',
      'focus',
      'fence',
      'broadcast'
    ])
  })

  it('does not re-run the fence when a queued route is flushed by the handshake', () => {
    const { service, transport } = createService()
    const beforeEffect = vi.fn()

    expect(service.open('home', { beforeEffect }).status).toBe('queued')
    expect(beforeEffect).toHaveBeenCalledTimes(2)

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    expect(transport.broadcastToWindow).toHaveBeenCalledTimes(1)
    expect(beforeEffect).toHaveBeenCalledTimes(2)
  })
})

/**
 * 会话是唯一一个目录表说不出名字的目的地：它来自数据库的一行，所以 id 由调用方带进来。这里是
 * id 变成路由的唯一闸门，失败方式分两种，都很安静——校验放宽会把一条搜索结果变成任意路由导航；
 * 校验收紧或分支写错则会让「打开这段对话」什么也不做，而调用方看到的只是一个 status。
 */
describe('openConversation route boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queues the conversation route before readiness without dropping it', () => {
    const { service, transport, window } = createService()

    expect(service.openConversation('thread-1')).toEqual({
      status: 'queued',
      conversationId: 'thread-1'
    })
    expect(window.show).toHaveBeenCalledTimes(1)
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()

    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)
    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home/c/thread-1' }
    )
  })

  it('delivers the conversation route immediately once the renderer is ready', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    expect(service.openConversation('thread-1')).toEqual({
      status: 'opened',
      conversationId: 'thread-1'
    })
    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home/c/thread-1' }
    )
  })

  it('percent-encodes the id so it stays one route parameter', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    service.openConversation('local:abc')

    // 未编码的 `:` 会让这段路径被切成别的参数形状；路由参数必须原样还原成 id。
    expect(transport.broadcastToWindow).toHaveBeenCalledExactlyOnceWith(
      window.id,
      AppEvents.window.navigate,
      { path: '/home/c/local%3Aabc' }
    )
  })

  it.each([
    { label: 'path traversal', id: '../../etc/passwd' },
    { label: 'slash', id: 'has/slash' },
    { label: 'space', id: 'has space' },
    { label: 'empty', id: '' },
    { label: 'query', id: 'id?x=1' },
    { label: 'fragment', id: 'id#frag' },
    { label: 'percent escape', id: 'id%2e%2e' },
    { label: 'over-long', id: 'a'.repeat(129) },
    { label: 'non-ascii', id: 'emoji😀' }
  ])('refuses to reveal the window for a $label id', ({ id }) => {
    const { service, transport, window } = createService()

    expect(service.openConversation(id)).toEqual({
      status: 'unavailable',
      conversationId: id,
      reason: 'conversation-unavailable'
    })
    // 拒绝必须发生在任何原生副作用之前：show/focus 一次就已经把用户从当前界面拽走了。
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
    expect(transport.broadcastToWindow).not.toHaveBeenCalled()
  })

  it('keeps the route inside /home/c/ for every accepted id shape', () => {
    const { service, transport, window } = createService()
    service.markPrimaryRendererReady(PRIMARY_WEB_CONTENTS_ID)

    service.openConversation('9f1c6a2e-4b7d-4e5f-8a90-1234567890ab')
    service.openConversation('  trimmed-id  ')
    service.openConversation('a_b.c-d')

    expect(transport.broadcastToWindow).toHaveBeenNthCalledWith(
      1,
      window.id,
      AppEvents.window.navigate,
      { path: '/home/c/9f1c6a2e-4b7d-4e5f-8a90-1234567890ab' }
    )
    expect(transport.broadcastToWindow).toHaveBeenNthCalledWith(
      2,
      window.id,
      AppEvents.window.navigate,
      { path: '/home/c/trimmed-id' }
    )
    expect(transport.broadcastToWindow).toHaveBeenNthCalledWith(
      3,
      window.id,
      AppEvents.window.navigate,
      { path: '/home/c/a_b.c-d' }
    )
  })
})

describe('normalizeConversationId', () => {
  it.each([
    ['9f1c6a2e-4b7d-4e5f-8a90-1234567890ab', '9f1c6a2e-4b7d-4e5f-8a90-1234567890ab'],
    ['thread-1', 'thread-1'],
    ['a_b.c-d', 'a_b.c-d'],
    ['local:abc', 'local:abc'],
    ['  padded  ', 'padded'],
    ['a'.repeat(128), 'a'.repeat(128)]
  ])('accepts %s', (value, expected) => {
    expect(normalizeConversationId(value)).toBe(expected)
  })

  it.each([
    '../../etc/passwd',
    'has/slash',
    'has space',
    'id?x=1',
    'id#frag',
    'id%2e%2e',
    'back\\slash',
    'emoji😀',
    '',
    '   ',
    'a'.repeat(129)
  ])('rejects %s', (value) => {
    expect(normalizeConversationId(value)).toBeNull()
  })

  it.each([[undefined], [null], [42], [{ id: 'thread-1' }]])(
    'rejects the non-string carrier %s',
    (value) => {
      expect(normalizeConversationId(value)).toBeNull()
    }
  )
})
