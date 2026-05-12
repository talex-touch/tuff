import type {
  ClipboardActionResult,
  ClipboardApplyRequest,
  ClipboardChangePayload,
  ClipboardCopyAndPasteRequest,
  ClipboardDeleteRequest,
  ClipboardGetImageUrlRequest,
  ClipboardGetImageUrlResponse,
  ClipboardItem,
  ClipboardMetaQueryRequest,
  ClipboardQueryRequest,
  ClipboardQueryResponse,
  ClipboardReadImageRequest,
  ClipboardReadImageResponse,
  ClipboardReadResponse,
  ClipboardSetFavoriteRequest,
  ClipboardWriteRequest
} from '@talex-touch/utils/transport/events/types'
import type {
  HandlerContext,
  ITuffTransportMain,
  StreamContext
} from '@talex-touch/utils/transport/main'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import type { IClipboardItem } from './clipboard-history-persistence'

export type ClipboardPermissionName = 'clipboard:read' | 'clipboard:write'
export type ClipboardHandlerDisposer = () => void

export interface ClipboardWritePayload {
  text?: string
  html?: string
  image?: string
  files?: string[]
}

export interface ClipboardTransportHistoryResult {
  rows: IClipboardItem[]
  total: number
  page: number
  limit: number
}

export interface ClipboardTransportHandlers {
  enforcePermission: (
    pluginName: string | undefined,
    permission: ClipboardPermissionName,
    payload: unknown
  ) => void
  ensureInitialCacheLoaded: () => Promise<void>
  getLatestItem: () => IClipboardItem | undefined
  toTransportItem: (item: IClipboardItem) => ClipboardItem | null
  queryClipboardHistory: (
    request: ClipboardQueryRequest | null | undefined
  ) => Promise<ClipboardTransportHistoryResult>
  getImageUrl: (request: ClipboardGetImageUrlRequest) => Promise<ClipboardGetImageUrlResponse>
  queryHistoryByMeta: (request: ClipboardMetaQueryRequest) => Promise<IClipboardItem[]>
  apply: (request: ClipboardApplyRequest, context: HandlerContext) => Promise<ClipboardActionResult>
  deleteItem: (request: ClipboardDeleteRequest) => Promise<void>
  setFavorite: (request: ClipboardSetFavoriteRequest) => Promise<void>
  clearHistory: () => Promise<void>
  write: (request: ClipboardWriteRequest) => Promise<void>
  clearClipboard: () => void
  copyAndPaste: (
    request: ClipboardCopyAndPasteRequest,
    context: HandlerContext
  ) => Promise<ClipboardActionResult>
  readClipboard: () => ClipboardReadResponse
  readImage: (request: ClipboardReadImageRequest) => Promise<ClipboardReadImageResponse | null>
  readFiles: () => string[]
  buildChangePayload: () => ClipboardChangePayload
}

export class ClipboardTransportHandlersRegistry {
  private transport: ITuffTransportMain | null = null
  private disposers: ClipboardHandlerDisposer[] = []
  private changeListeners = new Set<() => void>()

  public register(
    channel: unknown,
    handlers: ClipboardTransportHandlers
  ): ITuffTransportMain | null {
    this.dispose()
    if (!channel) {
      return null
    }

    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    this.registerQueryHandlers(handlers)
    this.registerMutationHandlers(handlers)
    this.registerReadHandlers(handlers)
    this.registerStreamHandlers(handlers)

    return this.transport
  }

  public notifyChange(): void {
    const listeners = Array.from(this.changeListeners)
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        this.changeListeners.delete(listener)
      }
    }
  }

  public dispose(): void {
    for (const dispose of this.disposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.disposers = []
    this.changeListeners.clear()
    this.transport = null
  }

  private requireTransport(): ITuffTransportMain {
    if (!this.transport) {
      throw new Error('Clipboard transport is not registered.')
    }
    return this.transport
  }

  private registerQueryHandlers(handlers: ClipboardTransportHandlers): void {
    const transport = this.requireTransport()

    this.disposers.push(
      transport.on(ClipboardEvents.getLatest, async (_request: void, context: HandlerContext) => {
        handlers.enforcePermission(context.plugin?.name, 'clipboard:read', undefined)
        await handlers.ensureInitialCacheLoaded()
        const latest = handlers.getLatestItem()
        return latest ? handlers.toTransportItem(latest) : null
      })
    )

    this.disposers.push(
      transport.on(
        ClipboardEvents.getHistory,
        async (request: ClipboardQueryRequest, context: HandlerContext) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:read', request)
          const { rows, total, page, limit } = await handlers.queryClipboardHistory(request)
          const items = rows
            .map((row) => handlers.toTransportItem(row))
            .filter((item): item is ClipboardItem => !!item)

          return { items, total, page, limit, pageSize: limit } satisfies ClipboardQueryResponse
        }
      )
    )

    this.disposers.push(
      transport.on(
        ClipboardEvents.getImageUrl,
        async (
          request: ClipboardGetImageUrlRequest,
          context: HandlerContext
        ): Promise<ClipboardGetImageUrlResponse> => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:read', request)
          return await handlers.getImageUrl(request)
        }
      )
    )

    this.disposers.push(
      transport.on(ClipboardEvents.queryMeta, async (payload, context) => {
        handlers.enforcePermission(context.plugin?.name, 'clipboard:read', payload)
        return await handlers.queryHistoryByMeta(payload ?? {})
      })
    )
  }

  private registerMutationHandlers(handlers: ClipboardTransportHandlers): void {
    const transport = this.requireTransport()

    this.disposers.push(
      transport.on(
        ClipboardEvents.apply,
        async (request: ClipboardApplyRequest, context: HandlerContext) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:write', request)
          return await handlers.apply(request, context)
        }
      ),
      transport.on(
        ClipboardEvents.delete,
        async (request: ClipboardDeleteRequest, context: HandlerContext) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:write', request)
          await handlers.deleteItem(request)
        }
      ),
      transport.on(
        ClipboardEvents.setFavorite,
        async (request: ClipboardSetFavoriteRequest, context: HandlerContext) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:write', request)
          await handlers.setFavorite(request)
        }
      ),
      transport.on(
        ClipboardEvents.clearHistory,
        async (_request: void, context: HandlerContext) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:write', undefined)
          await handlers.clearHistory()
        }
      ),
      transport.on(
        ClipboardEvents.write,
        async (request: ClipboardWriteRequest, context: HandlerContext) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:write', request)
          await handlers.write(request)
        }
      ),
      transport.on(ClipboardEvents.clear, async (_request: void, context: HandlerContext) => {
        handlers.enforcePermission(context.plugin?.name, 'clipboard:write', undefined)
        handlers.clearClipboard()
      }),
      transport.on(
        ClipboardEvents.copyAndPaste,
        async (
          request: ClipboardCopyAndPasteRequest,
          context: HandlerContext
        ): Promise<ClipboardActionResult> => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:write', request)
          return await handlers.copyAndPaste(request, context)
        }
      )
    )
  }

  private registerReadHandlers(handlers: ClipboardTransportHandlers): void {
    const transport = this.requireTransport()

    this.disposers.push(
      transport.on(
        ClipboardEvents.read,
        async (_request: void, context: HandlerContext): Promise<ClipboardReadResponse> => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:read', undefined)
          return handlers.readClipboard()
        }
      ),
      transport.on(
        ClipboardEvents.readImage,
        async (
          request: ClipboardReadImageRequest,
          context: HandlerContext
        ): Promise<ClipboardReadImageResponse | null> => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:read', request)
          return await handlers.readImage(request)
        }
      ),
      transport.on(ClipboardEvents.readFiles, async (_request: void, context: HandlerContext) => {
        handlers.enforcePermission(context.plugin?.name, 'clipboard:read', undefined)
        return handlers.readFiles()
      })
    )
  }

  private registerStreamHandlers(handlers: ClipboardTransportHandlers): void {
    const transport = this.requireTransport()

    this.disposers.push(
      transport.onStream(
        ClipboardEvents.change,
        (_request: void, context: StreamContext<ClipboardChangePayload>) => {
          handlers.enforcePermission(context.plugin?.name, 'clipboard:read', undefined)
          const listener = () => {
            if (context.isCancelled()) {
              this.changeListeners.delete(listener)
              return
            }
            context.emit(handlers.buildChangePayload())
          }

          this.changeListeners.add(listener)
          void handlers.ensureInitialCacheLoaded().finally(() => {
            if (!context.isCancelled()) {
              listener()
            }
          })
        }
      )
    )
  }
}
