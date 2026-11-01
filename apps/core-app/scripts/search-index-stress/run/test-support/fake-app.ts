import vm from 'node:vm'
import {
  FakeWsServer,
  type WsConnection,
  type WsRequest
} from '../../monitor/testing/fake-cdp-server'
import { MAIN_CHANNEL, SEARCH_STREAM_EVENT } from '../page-scripts'

type Message = {
  name: string
  data?: unknown
  sync?: { id: string; timeStamp: number; timeout: number }
  header?: { status: string; type: string }
  code?: number
}
type Handler = (event: unknown, message: Message) => void

export interface FakeItem {
  id: string
  kind: string
  title: string
  path?: string
  sourceId?: string
  score?: number
}

export function toWireItem(item: FakeItem): unknown {
  return {
    id: item.id,
    kind: item.kind,
    source: {
      id: item.sourceId ?? 'file-provider',
      type: item.kind === 'app' ? 'application' : 'file'
    },
    render: { basic: { title: item.title } },
    meta: item.kind === 'app' ? { app: { path: item.path } } : { file: { path: item.path } },
    scoring: { final: item.score ?? 0.5 }
  }
}

export interface StreamControl {
  streamId: string
  query: string
  chunk: (chunk: unknown) => void
  end: () => void
  error: (error: string, code?: string) => void
  reply: (code: number, data?: unknown) => void
}

export interface FakePageOptions {
  /** The preload's `windowMode`; null leaves `window.api` out, as a preload that reports none. */
  windowMode?: string | null
  /** Classes on <body>; by default what `AppEntrance.vue` sets for the window mode. */
  bodyClasses?: string[]
  /** false leaves `window.electron` out, as a page the preload did not reach. */
  ipc?: boolean
}

function bodyClassesFor(mode: string | null): string[] {
  if (mode === 'CoreBox') return ['core-box']
  if (mode === 'DivisionBox') return ['core-box', 'division-box']
  return []
}

/** A renderer page the bridge can be injected into, with the main process on the other end of its ipcRenderer. */
export class FakePage {
  private handlers: Handler[] = []
  private context: vm.Context = vm.createContext({})
  readonly sent: Message[] = []
  /** Called for every stream start the page sends; the default answers every query with no rows. */
  onStreamStart: (control: StreamControl) => void = (control) => {
    control.chunk({ type: 'snapshot', result: { items: [] } })
    control.chunk({ type: 'complete' })
    control.end()
  }
  /** Called for every other request; return a value to reply with code 200. */
  onCall: (name: string, data: unknown) => unknown = () => ({})
  /** Names whose replies are never sent. */
  silent = new Set<string>()
  /** Reply code per request name when it is not 200. */
  readonly codes = new Map<string, number>()

  constructor(private readonly options: FakePageOptions = {}) {
    this.reset()
  }

  /** A fresh page: no bridge, no listeners, the way a reload leaves it. */
  reset(): void {
    this.handlers = []
    const ipcRenderer = {
      send: (channel: string, message: Message) => {
        if (channel !== MAIN_CHANNEL) return
        this.sent.push(message)
        setImmediate(() => this.receive(message))
      },
      on: (channel: string, handler: Handler) => {
        if (channel === MAIN_CHANNEL) this.handlers.push(handler)
        return () => {
          this.handlers = this.handlers.filter((entry) => entry !== handler)
        }
      }
    }
    const mode = this.options.windowMode === undefined ? 'CoreBox' : this.options.windowMode
    const classes = new Set(this.options.bodyClasses ?? bodyClassesFor(mode))
    const pageWindow: Record<string, unknown> = {}
    if (this.options.ipc !== false) pageWindow.electron = { ipcRenderer }
    if (mode !== null)
      pageWindow.api = {
        getStartupContextSnapshot: () => ({ startupInfo: null, windowMode: mode })
      }
    const pageDocument = { body: { classList: { contains: (name: string) => classes.has(name) } } }
    this.context = vm.createContext({
      window: pageWindow,
      document: pageDocument,
      performance,
      setTimeout,
      clearTimeout
    })
  }

  get listenerCount(): number {
    return this.handlers.length
  }

  get hasBridge(): boolean {
    return Boolean(vm.runInContext('window.__tuffStress', this.context))
  }

  push(message: Message): void {
    for (const handler of [...this.handlers]) handler({}, message)
  }

  async evaluate(expression: string, awaitPromise: boolean): Promise<unknown> {
    const value = vm.runInContext(expression, this.context) as unknown
    const settled = awaitPromise ? await value : value
    return settled === undefined ? undefined : JSON.parse(JSON.stringify(settled))
  }

  private reply(message: Message, code: number, data?: unknown): void {
    if (!message.sync || this.silent.has(message.name)) return
    this.push({
      name: message.name,
      code,
      data,
      sync: message.sync,
      header: { status: 'reply', type: 'main' }
    })
  }

  private receive(message: Message): void {
    const prefix = `${SEARCH_STREAM_EVENT}:stream:`
    if (message.name === `${prefix}start`) {
      const request = message.data as { query: { text: string }; streamId: string }
      const streamId = request.streamId
      const push = (kind: string, data: unknown): void =>
        this.push({
          name: `${prefix}${kind}:${streamId}`,
          data,
          header: { status: 'request', type: 'main' }
        })
      this.onStreamStart({
        streamId,
        query: request.query.text,
        chunk: (chunk) => push('data', { chunk }),
        end: () => push('end', {}),
        error: (error, code) => push('error', { error, ...(code ? { code } : {}) }),
        reply: (code, data) => this.reply(message, code, data)
      })
      return
    }
    if (message.name === `${prefix}cancel`) return
    const result = this.onCall(message.name, message.data)
    this.reply(message, this.codes.get(message.name) ?? 200, result)
  }
}

interface Listed {
  id: string
  page: FakePage
  title: string
  url: string
}

export interface FakeWindowOptions extends FakePageOptions {
  title?: string
  url?: string
}

/** A DevTools endpoint serving `page` (the CoreBox window unless told otherwise) and any windows added next to it. */
export class FakeApp {
  private readonly listed: Listed[] = []

  private constructor(
    readonly server: FakeWsServer,
    readonly page: FakePage
  ) {}

  static async start(options: FakeWindowOptions = {}): Promise<FakeApp> {
    const server = await FakeWsServer.start()
    const app = new FakeApp(server, new FakePage(options))
    // Every window of the real app is the same index.html titled "Tuff"; only the preload knows which is which.
    app.listed.push({
      id: 'page-1',
      page: app.page,
      title: options.title ?? 'Tuff',
      url: options.url ?? 'http://localhost:5173/'
    })
    server.json.set('/json/list', () =>
      app.listed.map((entry) => ({
        id: entry.id,
        type: 'page',
        title: entry.title,
        url: entry.url,
        webSocketDebuggerUrl: server.url(`/devtools/page/${entry.id}`)
      }))
    )
    server.respond = (connection, request) => app.answer(connection, request)
    return app
  }

  get cdpPort(): number {
    return this.server.port
  }

  /** Another window, listed after the ones already there unless `first` is set. */
  addPage(id: string, options: FakeWindowOptions & { first?: boolean } = {}): FakePage {
    const page = new FakePage(options)
    const entry = {
      id,
      page,
      title: options.title ?? 'Tuff',
      url: options.url ?? 'http://localhost:5173/'
    }
    if (options.first) this.listed.unshift(entry)
    else this.listed.push(entry)
    return page
  }

  stop(): Promise<void> {
    return this.server.stop()
  }

  private answer(connection: WsConnection, request: WsRequest): undefined {
    if (request.method !== 'Runtime.evaluate') {
      connection.send({ id: request.id, result: {} })
      return undefined
    }
    const { expression, awaitPromise } = request.params as {
      expression: string
      awaitPromise?: boolean
    }
    const page =
      this.listed.find((entry) => connection.path === `/devtools/page/${entry.id}`)?.page ??
      this.page
    page.evaluate(expression, awaitPromise === true).then(
      (value) => connection.send({ id: request.id, result: { result: { value } } }),
      (error: unknown) =>
        connection.send({
          id: request.id,
          result: {
            exceptionDetails: {
              text: 'Uncaught',
              exception: {
                description:
                  error instanceof Error ? `${error.name}: ${error.message}` : String(error)
              }
            }
          }
        })
    )
    return undefined
  }
}
