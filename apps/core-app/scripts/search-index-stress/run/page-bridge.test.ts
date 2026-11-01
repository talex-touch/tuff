import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriverError } from './errors'
import { PageSession, type PageSessionOptions } from './page-bridge'
import { FakeApp } from './test-support/fake-app'

// Every window of the real app is the same index.html titled "Tuff"; only the preload's windowMode tells them apart.
let app: FakeApp | null = null
let session: PageSession | null = null

afterEach(async () => {
  session?.close()
  session = null
  await app?.stop()
  app = null
})

const open = (extra: Partial<PageSessionOptions> = {}): Promise<PageSession> =>
  PageSession.open({
    cdpPort: app!.cdpPort,
    now: Date.now,
    readyTimeoutMs: 4_000,
    pollMs: 10,
    ...extra
  })

describe('which page the session attaches to', () => {
  it('takes the CoreBox page whatever the list order, titles and URLs say', async () => {
    app = await FakeApp.start({ windowMode: 'MainApp' })
    const box = app.addPage('box', { windowMode: 'CoreBox' })

    session = await open()

    expect(box.hasBridge).toBe(true)
    expect(app.page.hasBridge).toBe(false)
    expect(session.target).toContain('[CoreBox]')
  })

  it('is not misled by the other windows of the app or by a page the preload did not reach', async () => {
    app = await FakeApp.start({ windowMode: 'OmniPanel' })
    const division = app.addPage('division', { windowMode: 'DivisionBox' })
    const overlay = app.addPage('overlay', { windowMode: 'MetaOverlay' })
    const unreached = app.addPage('unreached', { windowMode: 'CoreBox', ipc: false })
    const box = app.addPage('box', { windowMode: 'CoreBox' })

    session = await open()

    expect(box.hasBridge).toBe(true)
    for (const other of [app.page, division, overlay, unreached])
      expect(other.hasBridge).toBe(false)
  })

  it('reads the class on <body> when the preload reports no window mode', async () => {
    app = await FakeApp.start({ windowMode: null })
    const division = app.addPage('division', {
      windowMode: null,
      bodyClasses: ['core-box', 'division-box']
    })
    const box = app.addPage('box', { windowMode: null, bodyClasses: ['core-box'] })

    session = await open()

    expect(box.hasBridge).toBe(true)
    expect(app.page.hasBridge).toBe(false)
    expect(division.hasBridge).toBe(false)
  })

  it('never connects to targets that are not pages', async () => {
    app = await FakeApp.start()
    const { server } = app
    server.json.set('/json/list', () => [
      {
        id: 'sw',
        type: 'service_worker',
        title: '',
        url: 'http://localhost:5173/sw.js',
        webSocketDebuggerUrl: server.url('/devtools/page/sw')
      },
      {
        id: 'dev',
        type: 'page',
        title: 'DevTools',
        url: 'devtools://devtools/bundled/inspector.html',
        webSocketDebuggerUrl: server.url('/devtools/page/dev')
      },
      {
        id: 'page-1',
        type: 'page',
        title: 'Tuff',
        url: 'http://localhost:5173/',
        webSocketDebuggerUrl: server.url('/devtools/page/page-1')
      }
    ])

    session = await open()

    expect(app.page.hasBridge).toBe(true)
    expect(
      server.received.filter(
        (entry) => entry.startsWith('/devtools/page/sw') || entry.startsWith('/devtools/page/dev')
      )
    ).toEqual([])
  })

  it('waits for a CoreBox page that is not there yet', async () => {
    app = await FakeApp.start({ windowMode: 'MainApp' })
    const pending = open({ boxWaitMs: 3_000 })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const box = app.addPage('box', { windowMode: 'CoreBox' })

    session = await pending

    expect(box.hasBridge).toBe(true)
    expect(app.page.hasBridge).toBe(false)
  })

  it('settles for the first other page with an ipcRenderer, and says so, when no CoreBox page comes', async () => {
    app = await FakeApp.start({ windowMode: 'MainApp' })
    const division = app.addPage('division', { windowMode: 'DivisionBox' })
    const lines: string[] = []

    session = await open({ boxWaitMs: 150, log: (line) => lines.push(line) })

    expect(app.page.hasBridge).toBe(true)
    expect(division.hasBridge).toBe(false)
    expect(session.target).toContain('MainApp, not CoreBox')
    expect(lines.join('\n')).toMatch(/no CoreBox page after/)
  })

  it('goes back to the CoreBox page, not to another one, when the connection drops', async () => {
    app = await FakeApp.start({ windowMode: 'MainApp' })
    const box = app.addPage('box', { windowMode: 'CoreBox' })
    session = await open()
    app.server.dropAll('/devtools/page')
    await vi.waitFor(() => expect(session!.closed).toBe(true))

    await session.bridge('status')

    expect(session.closed).toBe(false)
    expect(session.target).toContain('[CoreBox]')
    expect(box.hasBridge).toBe(true)
    expect(app.page.hasBridge).toBe(false)
  })

  it('reports page-missing, naming the reason, when no page has an ipcRenderer', async () => {
    app = await FakeApp.start({ ipc: false })

    const failure = await open({ readyTimeoutMs: 300 }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DriverError)
    expect((failure as DriverError).kind).toBe('page-missing')
    expect((failure as DriverError).message).toMatch(/no ipcRenderer/)
  })
})
