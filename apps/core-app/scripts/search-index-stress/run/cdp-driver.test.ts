import vm from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCdpSearchDriver, toSearchRow } from './cdp-driver'
import { DriverError, RunAbort } from './errors'
import { createAppControl } from './main-ipc'
import { PageSession } from './page-bridge'
import { BRIDGE_SOURCE } from './page-scripts'
import { FakeApp, toWireItem, type FakeItem, type StreamControl } from './test-support/fake-app'

const TIMEOUT = 2_000
let app: FakeApp
let session: PageSession

function respondWith(
  items: FakeItem[],
  options: { updates?: FakeItem[][]; replyBeforeData?: boolean } = {}
) {
  return (control: StreamControl): void => {
    if (options.replyBeforeData !== false) control.reply(200, { sessionId: 'x' })
    control.chunk({ type: 'session', sessionId: 'sess' })
    control.chunk({ type: 'snapshot', result: { items: items.map(toWireItem) } })
    for (const update of options.updates ?? [])
      control.chunk({ type: 'update', items: update.map(toWireItem) })
    control.chunk({ type: 'complete' })
    control.end()
  }
}

const file = (name: string, score = 0.5): FakeItem => ({
  id: `/Users/Shared/tuff-stress/r/${name}`,
  kind: 'file',
  title: name,
  path: `/Users/Shared/tuff-stress/r/${name}`,
  score
})

beforeEach(async () => {
  app = await FakeApp.start()
  session = await PageSession.open({ cdpPort: app.cdpPort, now: Date.now, readyTimeoutMs: 2_000 })
})

afterEach(async () => {
  session.close()
  await app.stop()
})

describe('bridge source', () => {
  it('compiles as plain script text', () => {
    expect(() => new vm.Script(BRIDGE_SOURCE)).not.toThrow()
  })

  it('installs once and is idempotent', async () => {
    expect(app.page.hasBridge).toBe(true)
    expect(app.page.listenerCount).toBe(1)
    await session.inject()
    expect(app.page.listenerCount).toBe(1)
  })
})

describe('createCdpSearchDriver', () => {
  it('merges the snapshot and update batches the way the list does, and reports the end signal', async () => {
    app.page.onStreamStart = respondWith([file('a.png', 0.4), file('b.png', 0.9)], {
      updates: [[file('c.png', 0.99)]]
    })
    const driver = createCdpSearchDriver(session, { sliceMs: 50 })

    const answer = await driver.search('png', { timeoutMs: TIMEOUT })

    expect(answer.endSignalSeen).toBe(true)
    expect(answer.batches).toBe(2)
    expect(answer.rows.map((row) => row.name)).toEqual(['a.png', 'b.png', 'c.png'])
    expect(answer.rows[0]).toMatchObject({
      kind: 'file',
      path: '/Users/Shared/tuff-stress/r/a.png',
      sourceId: 'file-provider'
    })
    expect(answer.answerMs).toBeGreaterThanOrEqual(0)
    expect(answer.answerMs).toBeLessThan(TIMEOUT)
  })

  it('sends the query on the stream the CoreBox renderer uses', async () => {
    app.page.onStreamStart = respondWith([])
    await createCdpSearchDriver(session, { sliceMs: 50 }).search('hello world', {
      timeoutMs: TIMEOUT
    })

    const start = app.page.sent.find(
      (message) => message.name === 'core-box:search:session:stream:start'
    )
    expect(start?.data).toMatchObject({
      query: { text: 'hello world', inputs: [] },
      surface: 'core-box',
      activations: null
    })
    expect(start?.header).toEqual({ status: 'request', type: 'main' })
  })

  it('does not depend on the order of the reply, the data and the end signal', async () => {
    app.page.onStreamStart = (control) => {
      control.chunk({ type: 'snapshot', result: { items: [toWireItem(file('x.png'))] } })
      control.chunk({ type: 'complete' })
      control.end()
      control.reply(200, {})
    }
    const answer = await createCdpSearchDriver(session, { sliceMs: 50 }).search('x', {
      timeoutMs: TIMEOUT
    })
    expect(answer.rows.map((row) => row.name)).toEqual(['x.png'])
    expect(answer.endSignalSeen).toBe(true)
  })

  it('finishes on the end event alone when the complete chunk never comes', async () => {
    app.page.onStreamStart = (control) => {
      control.chunk({ type: 'snapshot', result: { items: [toWireItem(file('y.png'))] } })
      control.end()
    }
    const answer = await createCdpSearchDriver(session, { sliceMs: 50 }).search('y', {
      timeoutMs: TIMEOUT
    })
    expect(answer.endSignalSeen).toBe(true)
    expect(answer.rows).toHaveLength(1)
  })

  it('answers an empty list with an end signal for a query nothing matches', async () => {
    app.page.onStreamStart = (control) => {
      control.chunk({ type: 'no-results' })
      control.chunk({ type: 'complete' })
      control.end()
    }
    const answer = await createCdpSearchDriver(session, { sliceMs: 50 }).search('zzqq', {
      timeoutMs: TIMEOUT
    })
    expect(answer).toMatchObject({ rows: [], endSignalSeen: true })
  })

  it('returns what arrived, flagged as cut, when the stream never ends', async () => {
    app.page.onStreamStart = (control) => {
      control.chunk({ type: 'snapshot', result: { items: [toWireItem(file('slow.png'))] } })
    }
    const answer = await createCdpSearchDriver(session, { sliceMs: 50 }).search('slow', {
      timeoutMs: 300
    })

    expect(answer.endSignalSeen).toBe(false)
    expect(answer.answerMs).toBe(300)
    expect(answer.rows.map((row) => row.name)).toEqual(['slow.png'])
    expect(
      app.page.sent.some((message) => message.name === 'core-box:search:session:stream:cancel')
    ).toBe(true)
  })

  it('treats a stream error pushed by main as a main-side failure, not as an empty answer', async () => {
    app.page.onStreamStart = (control) =>
      control.error(
        'Search admission blocked: onboarding-incomplete',
        'SEARCH_ONBOARDING_GATE_BLOCKED'
      )
    const failure = await createCdpSearchDriver(session, { sliceMs: 50 })
      .search('q', { timeoutMs: TIMEOUT })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DriverError)
    expect((failure as DriverError).kind).toBe('main-error')
    expect((failure as DriverError).message).toContain('onboarding-incomplete')
  })

  it('treats a refused stream start as a main-side failure', async () => {
    app.page.onStreamStart = (control) => control.reply(500, { message: 'boom' })
    const failure = await createCdpSearchDriver(session, { sliceMs: 50 })
      .search('q', { timeoutMs: TIMEOUT })
      .catch((error: unknown) => error)
    expect((failure as DriverError).kind).toBe('main-error')
  })

  it('treats a cancelled complete as a cut answer', async () => {
    app.page.onStreamStart = (control) => {
      control.chunk({ type: 'complete', cancelled: true })
      control.end()
    }
    const answer = await createCdpSearchDriver(session, { sliceMs: 50 }).search('q', {
      timeoutMs: TIMEOUT
    })
    expect(answer.endSignalSeen).toBe(false)
  })

  it('runs many searches at once and keeps their rows apart', async () => {
    app.page.onStreamStart = (control) => {
      setTimeout(
        () => respondWith([file(`${control.query}.png`)])(control),
        (control.query.length % 3) * 5
      )
    }
    const driver = createCdpSearchDriver(session, { sliceMs: 50 })
    const queries = Array.from({ length: 24 }, (_unused, index) => `q${'x'.repeat(index)}`)

    const answers = await Promise.all(
      queries.map((query) => driver.search(query, { timeoutMs: TIMEOUT }))
    )

    answers.forEach((answer, index) =>
      expect(answer.rows.map((row) => row.name)).toEqual([`${queries[index]}.png`])
    )
  })

  it('installs the bridge again after the page was reloaded', async () => {
    app.page.onStreamStart = respondWith([file('after.png')])
    const driver = createCdpSearchDriver(session, { sliceMs: 50 })
    app.page.reset()
    expect(app.page.hasBridge).toBe(false)

    const answer = await driver.search('after', { timeoutMs: TIMEOUT })

    expect(answer.rows.map((row) => row.name)).toEqual(['after.png'])
    expect(app.page.hasBridge).toBe(true)
  })

  it('reports page-missing when the page is reloaded in the middle of a search', async () => {
    app.page.onStreamStart = () => {
      setTimeout(() => app.page.reset(), 20)
    }
    const failure = await createCdpSearchDriver(session, { sliceMs: 50 })
      .search('q', { timeoutMs: TIMEOUT })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(DriverError)
    expect((failure as DriverError).kind).toBe('page-missing')

    app.page.onStreamStart = respondWith([file('ok.png')])
    const next = await createCdpSearchDriver(session, { sliceMs: 50 }).search('ok', {
      timeoutMs: TIMEOUT
    })
    expect(next.rows).toHaveLength(1)
  })

  it('stops with an abort, cancels the stream in the page and leaves nothing behind', async () => {
    app.page.onStreamStart = () => undefined
    const controller = new AbortController()
    const driver = createCdpSearchDriver(session, { sliceMs: 50 })

    const pending = driver
      .search('q', { timeoutMs: 10_000, signal: controller.signal })
      .catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 80))
    controller.abort()

    expect(await pending).toBeInstanceOf(RunAbort)
    const status = await session.bridge<{ ops?: number }>('status')
    expect(status).toMatchObject({ ops: 0 })
    expect(
      app.page.sent.some((message) => message.name === 'core-box:search:session:stream:cancel')
    ).toBe(true)
  })

  it('refuses to start a search that is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      createCdpSearchDriver(session).search('q', { timeoutMs: TIMEOUT, signal: controller.signal })
    ).rejects.toBeInstanceOf(RunAbort)
    expect(app.page.sent).toHaveLength(0)
  })

  it('reconnects when the debugging connection dropped, and fails the search that was running', async () => {
    app.page.onStreamStart = () => {
      setTimeout(() => app.server.dropAll('/devtools/page'), 20)
    }
    const failure = await createCdpSearchDriver(session, { sliceMs: 50 })
      .search('q', { timeoutMs: TIMEOUT })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(DriverError)

    app.page.onStreamStart = respondWith([file('back.png')])
    const answer = await createCdpSearchDriver(session, { sliceMs: 50 }).search('back', {
      timeoutMs: TIMEOUT
    })
    expect(answer.rows.map((row) => row.name)).toEqual(['back.png'])
  })
})

describe('row projection', () => {
  const base = {
    id: 'i',
    title: 't',
    sourceId: 's',
    sourceType: 'x',
    score: null,
    pinned: false,
    matchType: null
  }

  it('reads the bundle path of an app and the file path of a file', () => {
    expect(
      toSearchRow({ ...base, kind: 'app', appPath: '/Applications/X.app', filePath: null }).path
    ).toBe('/Applications/X.app')
    expect(toSearchRow({ ...base, kind: 'file', appPath: null, filePath: '/a/b.png' }).path).toBe(
      '/a/b.png'
    )
  })

  it('falls back to an absolute id for file rows and to nothing for other kinds', () => {
    expect(
      toSearchRow({ ...base, id: '/a/c.png', kind: 'file', appPath: null, filePath: null }).path
    ).toBe('/a/c.png')
    expect(
      toSearchRow({ ...base, id: 'cmd', kind: 'command', appPath: null, filePath: null }).path
    ).toBeUndefined()
  })
})

describe('createAppControl', () => {
  it('completes onboarding by merging the flag into the stored settings and verifying it', async () => {
    const stored: Record<string, Record<string, unknown>> = {
      'app-setting.ini': { theme: 'dark', beginner: { init: false, step: 2 } }
    }
    app.page.onCall = (name, data) => {
      const { key, value } = data as { key: string; value?: Record<string, unknown> }
      if (name === 'storage:app:get') return stored[key] ?? {}
      if (name === 'storage:app:save') {
        stored[key] = value as Record<string, unknown>
        return { success: true, version: 1 }
      }
      return {}
    }

    const outcome = await createAppControl(session, { sliceMs: 50 }).completeOnboarding()

    expect(stored['app-setting.ini']).toEqual({ theme: 'dark', beginner: { init: true, step: 2 } })
    expect(stored['sentry-config.json']).toMatchObject({ enabled: false, anonymous: true })
    expect(outcome.sentryDisabled).toBe(true)
    const save = app.page.sent.find((message) => message.name === 'storage:app:save')
    expect(save?.data).toMatchObject({ force: true, persist: true })
  })

  it('does not write the settings again when onboarding is already done', async () => {
    app.page.onCall = (name) =>
      name === 'storage:app:get' ? { beginner: { init: true } } : { success: true, version: 1 }
    await createAppControl(session, { sliceMs: 50 }).completeOnboarding()
    const saved = app.page.sent
      .filter((message) => message.name === 'storage:app:save')
      .map((message) => (message.data as { key: string }).key)
    expect(saved).toEqual(['sentry-config.json'])
  })

  it('fails when the write is refused', async () => {
    app.page.onCall = (name) =>
      name === 'storage:app:get' ? {} : { success: false, version: 0, reason: 'persist-failed' }
    await expect(createAppControl(session, { sliceMs: 50 }).completeOnboarding()).rejects.toThrow(
      /persist-failed/
    )
  })

  it('reads the file index status and stats into plain numbers', async () => {
    app.page.onCall = (name) =>
      name === 'app:file-index:status'
        ? {
            isInitializing: false,
            initializationFailed: false,
            startupPending: true,
            progress: { stage: 'scanning', current: 3, total: 9 }
          }
        : { totalFiles: 120, failedFiles: 1, completedFiles: 100 }
    const control = createAppControl(session, { sliceMs: 50 })

    expect(await control.fileIndexStatus()).toEqual({
      isInitializing: false,
      initializationFailed: false,
      startupPending: true,
      stage: 'scanning',
      current: 3,
      total: 9
    })
    expect(await control.fileIndexStats()).toEqual({
      totalFiles: 120,
      failedFiles: 1,
      completedFiles: 100
    })
  })

  it('turns a non-200 reply into a main-error and a missing reply into a timeout', async () => {
    app.page.onCall = () => ({ message: 'nope' })
    app.page.codes.set('x:refused', 500)
    app.page.silent.add('x:silent')
    const control = createAppControl(session, { sliceMs: 50 })

    const refused = await control.call('x:refused').catch((error: unknown) => error)
    const silent = await control.call('x:silent', null, 200).catch((error: unknown) => error)

    expect((refused as DriverError).kind).toBe('main-error')
    expect((refused as DriverError).message).toContain('500')
    expect((silent as DriverError).kind).toBe('timeout')
  })

  it('treats a vanished connection while quitting as an answer', async () => {
    app.page.onCall = (name) => {
      if (name === 'app:window:close') setTimeout(() => app.server.dropAll('/devtools/page'), 5)
      return {}
    }
    app.page.silent.add('app:window:close')
    await expect(createAppControl(session, { sliceMs: 50 }).requestQuit()).resolves.toBeUndefined()
  })
})
