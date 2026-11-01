import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CdpClosedError,
  CdpConnection,
  CdpError,
  CdpTimeoutError,
  cdpEvaluate,
  describeTarget,
  fetchJson,
  isPageTarget,
  type CdpTarget
} from './cdp'
import { FakeWsServer } from './testing/fake-cdp-server'
import { until } from './testing/manual-clock'

describe('CdpConnection and fetchJson against a loopback server', () => {
  let server: FakeWsServer
  let clock: number
  const now = (): number => clock

  beforeEach(async () => {
    server = await FakeWsServer.start()
    clock = 1_000
  })

  afterEach(async () => {
    await server.stop()
  })

  it('answers a request with its result', async () => {
    server.respond = (_connection, request) => ({
      result: { echoed: request.method, params: request.params }
    })
    const connection = await CdpConnection.open(server.url('/devtools/page/x'), now)
    await expect(connection.send('Runtime.evaluate', { expression: '1+1' })).resolves.toEqual({
      echoed: 'Runtime.evaluate',
      params: { expression: '1+1' }
    })
    expect(connection.pendingCount).toBe(0)
    connection.close()
  })

  it('rejects with the protocol error code', async () => {
    server.respond = () => ({
      error: { code: -32601, message: "'SystemInfo.getProcessInfo' wasn't found" }
    })
    const connection = await CdpConnection.open(server.url('/x'), now)
    const failure = await connection
      .send('SystemInfo.getProcessInfo')
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(CdpError)
    expect((failure as CdpError).code).toBe(-32601)
    expect((failure as CdpError).message).toContain("wasn't found")
    connection.close()
  })

  it('times out an unanswered request', async () => {
    server.respond = () => undefined
    const connection = await CdpConnection.open(server.url('/x'), now)
    await expect(connection.send('Slow.method', {}, 40)).rejects.toBeInstanceOf(CdpTimeoutError)
    expect(connection.pendingCount).toBe(0)
    connection.close()
  })

  it('reports how long the oldest request has been waiting, by the injected clock', async () => {
    const connection = await CdpConnection.open(server.url('/x'), now)
    expect(connection.oldestPendingAgeMs()).toBe(0)
    server.hold()
    const first = connection.send('A', {}, 0)
    clock += 700
    const second = connection.send('B', {}, 0)
    clock += 300
    await until(() => server.pendingHeld === 2, 'both requests to arrive')
    expect(connection.pendingCount).toBe(2)
    expect(connection.oldestPendingAgeMs()).toBe(1_000)
    server.release()
    await Promise.all([first, second])
    expect(connection.oldestPendingAgeMs()).toBe(0)
    connection.close()
  })

  it('fails every pending request when the socket drops, and says so to close listeners', async () => {
    const connection = await CdpConnection.open(server.url('/x'), now)
    server.hold()
    const pending = connection.send('Stuck', {}, 0)
    const reasons: string[] = []
    connection.onClose((reason) => reasons.push(reason))
    await until(() => server.pendingHeld === 1, 'the request to arrive')
    server.dropAll()
    await expect(pending).rejects.toBeInstanceOf(CdpClosedError)
    expect(connection.closed).toBe(true)
    expect(reasons).toHaveLength(1)
    await expect(connection.send('After')).rejects.toBeInstanceOf(CdpClosedError)
  })

  it('calls a close listener registered after the fact straight away', async () => {
    const connection = await CdpConnection.open(server.url('/x'), now)
    connection.close()
    let called = false
    connection.onClose(() => {
      called = true
    })
    expect(called).toBe(true)
  })

  it('delivers protocol events to subscribers', async () => {
    const connection = await CdpConnection.open(server.url('/x'), now)
    const seen: unknown[] = []
    const off = connection.on('Inspector.targetCrashed', (params) => seen.push(params))
    await until(() => server.connections.size === 1, 'the server side to register')
    const [side] = [...server.connections]
    side.send({ method: 'Inspector.targetCrashed', params: { why: 'oom' } })
    await until(() => seen.length === 1, 'the event')
    off()
    side.send({ method: 'Inspector.targetCrashed', params: { why: 'again' } })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).toEqual([{ why: 'oom' }])
    connection.close()
  })

  it('handles a large reply split over several frames of the stream', async () => {
    const big = 'x'.repeat(200_000)
    server.respond = () => ({ result: { big } })
    const connection = await CdpConnection.open(server.url('/x'), now)
    const result = await connection.send<{ big: string }>('Big')
    expect(result.big.length).toBe(200_000)
    connection.close()
  })

  it('refuses to open when the server declines the upgrade', async () => {
    server.refuseUpgrades = true
    await expect(CdpConnection.open(server.url('/x'), now, 500)).rejects.toThrow(/failed|closed/)
  })

  it('cdpEvaluate returns the value and turns a thrown exception into an error', async () => {
    server.respond = (_connection, request) =>
      request.params.expression === 'throw'
        ? {
            result: {
              exceptionDetails: {
                text: 'Uncaught',
                exception: { description: 'TypeError: x is not a function' }
              }
            }
          }
        : { result: { result: { type: 'number', value: 42 } } }
    const connection = await CdpConnection.open(server.url('/x'), now)
    await expect(cdpEvaluate<number>(connection, '6*7')).resolves.toBe(42)
    await expect(cdpEvaluate(connection, 'throw')).rejects.toThrow(/TypeError: x is not a function/)
    connection.close()
  })

  it('fetchJson reads a listing, rejects other statuses, and gives up on a dead port', async () => {
    server.json.set('/json/version', { Browser: 'Chrome/156' })
    await expect(fetchJson(`http://127.0.0.1:${server.port}/json/version`)).resolves.toEqual({
      Browser: 'Chrome/156'
    })
    await expect(fetchJson(`http://127.0.0.1:${server.port}/nope`)).rejects.toThrow(/404/)
    const dead = await FakeWsServer.start()
    const port = dead.port
    await dead.stop()
    await expect(fetchJson(`http://127.0.0.1:${port}/json/version`, 500)).rejects.toThrow()
  })
})

describe('target helpers', () => {
  const target = (overrides: Partial<CdpTarget>): CdpTarget => ({
    id: 'a',
    type: 'page',
    title: 'CoreBox',
    url: 'http://localhost:5173/#/box',
    webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/a',
    ...overrides
  })

  it('counts pages and webviews that can be attached to, not service workers or DevTools', () => {
    expect(isPageTarget(target({}))).toBe(true)
    expect(isPageTarget(target({ type: 'webview' }))).toBe(true)
    expect(isPageTarget(target({ type: 'service_worker' }))).toBe(false)
    expect(isPageTarget(target({ type: 'browser' }))).toBe(false)
    expect(isPageTarget(target({ webSocketDebuggerUrl: undefined }))).toBe(false)
    expect(isPageTarget(target({ url: 'devtools://devtools/bundled/inspector.html' }))).toBe(false)
  })

  it('describes a target without its query string', () => {
    expect(
      describeTarget({
        title: 'CoreBox',
        url: 'http://localhost:5173/index.html?token=abc#/box/search/results/very/long/path/xxxxxxxx'
      })
    ).toBe('CoreBox (http://localhost:5173/index.html#/box/search/results/very/long/path/xxxx)')
    expect(describeTarget({ title: '', url: 'not a url' })).toBe('not a url')
  })
})
