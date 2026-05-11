import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { TuffInputType } from '@talex-touch/utils/transport/events/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ClipboardTransportHandlersRegistry,
  type ClipboardTransportHandlers
} from './clipboard-transport-handlers'
import type { IClipboardItem } from './clipboard-history-persistence'

const transportOn = vi.fn()
const transportOnStream = vi.fn()
const disposeCallbacks: Array<() => void> = []

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: transportOn,
    onStream: transportOnStream
  }))
}))

function createContext(pluginName = 'sample-plugin') {
  return {
    plugin: { name: pluginName }
  }
}

function createHandlers(
  overrides: Partial<ClipboardTransportHandlers> = {}
): ClipboardTransportHandlers {
  const latestItem: IClipboardItem = {
    id: 1,
    type: 'text',
    content: 'latest'
  }

  return {
    enforcePermission: vi.fn(),
    ensureInitialCacheLoaded: vi.fn(async () => {}),
    getLatestItem: vi.fn(() => latestItem),
    toTransportItem: vi.fn((item) => ({
      id: item.id ?? 0,
      type: TuffInputType.Text,
      value: item.content,
      createdAt: 1
    })),
    queryClipboardHistory: vi.fn(async () => ({
      rows: [latestItem],
      total: 1,
      page: 1,
      limit: 20
    })),
    getImageUrl: vi.fn(async () => ({ url: null })),
    queryHistoryByMeta: vi.fn(async () => []),
    apply: vi.fn(async () => ({ success: true })),
    deleteItem: vi.fn(async () => {}),
    setFavorite: vi.fn(async () => {}),
    clearHistory: vi.fn(async () => {}),
    write: vi.fn(async () => {}),
    clearClipboard: vi.fn(),
    copyAndPaste: vi.fn(async () => ({ success: true })),
    readClipboard: vi.fn(() => ({
      text: 'text',
      html: '',
      hasImage: false,
      hasFiles: false,
      formats: []
    })),
    readImage: vi.fn(async () => null),
    readFiles: vi.fn(() => []),
    buildChangePayload: vi.fn(() => ({ latest: null, history: [] })),
    ...overrides
  }
}

describe('clipboard-transport-handlers', () => {
  beforeEach(() => {
    transportOn.mockReset()
    transportOnStream.mockReset()
    disposeCallbacks.length = 0
    transportOn.mockImplementation(() => {
      const dispose = vi.fn()
      disposeCallbacks.push(dispose)
      return dispose
    })
    transportOnStream.mockImplementation(() => {
      const dispose = vi.fn()
      disposeCallbacks.push(dispose)
      return dispose
    })
  })

  it('registers typed clipboard handlers and preserves history response shape', async () => {
    const registry = new ClipboardTransportHandlersRegistry()
    const handlers = createHandlers()
    registry.register({ keyManager: {} }, handlers)

    expect(transportOn).toHaveBeenCalledWith(ClipboardEvents.getLatest, expect.any(Function))
    expect(transportOn).toHaveBeenCalledWith(ClipboardEvents.getHistory, expect.any(Function))
    expect(transportOnStream).toHaveBeenCalledWith(ClipboardEvents.change, expect.any(Function))

    const getHistoryHandler = transportOn.mock.calls.find(
      ([event]) => event === ClipboardEvents.getHistory
    )?.[1]
    const response = await getHistoryHandler({ page: 1 }, createContext())

    expect(response).toEqual({
      items: [{ id: 1, type: TuffInputType.Text, value: 'latest', createdAt: 1 }],
      total: 1,
      page: 1,
      limit: 20,
      pageSize: 20
    })
    expect(handlers.enforcePermission).toHaveBeenCalledWith('sample-plugin', 'clipboard:read', {
      page: 1
    })
  })

  it('fans out change stream updates and disposes registered handlers', async () => {
    const registry = new ClipboardTransportHandlersRegistry()
    const handlers = createHandlers({
      buildChangePayload: vi.fn(() => ({
        latest: { id: 1, type: TuffInputType.Text, value: 'latest', createdAt: 1 },
        history: []
      }))
    })
    registry.register({}, handlers)

    const streamHandler = transportOnStream.mock.calls[0]?.[1]
    const context = {
      plugin: { name: 'sample-plugin' },
      emit: vi.fn(),
      isCancelled: vi.fn(() => false)
    }

    await streamHandler(undefined, context)
    await Promise.resolve()
    registry.notifyChange()

    expect(context.emit).toHaveBeenCalledTimes(2)
    expect(context.emit).toHaveBeenLastCalledWith({
      latest: { id: 1, type: TuffInputType.Text, value: 'latest', createdAt: 1 },
      history: []
    })

    registry.dispose()
    expect(disposeCallbacks).toHaveLength(15)
    expect(disposeCallbacks.every((dispose) => vi.mocked(dispose).mock.calls.length === 1)).toBe(
      true
    )
  })
})
