// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPluginChannelPreludeCode } from '../transport/prelude'

/**
 * The plugin channel's isolation boundary (#875).
 *
 * The prelude validated `header.uniqueKey` against the injected key, but a message carrying no
 * `uniqueKey` at all only logged a warning and was then dispatched normally. Anything able to
 * emit on the shared `@plugin-process-message` channel could therefore reach this plugin's
 * handlers by simply omitting the key — the check was bypassed by not participating in it.
 *
 * The prelude is a generated source string, so these evaluate it with a fake electron and
 * drive the real handler rather than asserting on the text. jsdom because the generated code
 * assigns to `window`.
 */

const UNIQUE_KEY = 'plugin-unique-key-abc'

interface Harness {
  /** The listener the prelude registered for @plugin-process-message. */
  deliver: (message: unknown) => void
  /** Messages that reached a registered plugin handler. */
  received: unknown[]
}

function loadPrelude(): Harness {
  const received: unknown[] = []
  let listener: ((event: unknown, arg: unknown) => void) | null = null

  const fakeElectron = {
    ipcRenderer: {
      on(channel: string, handler: (event: unknown, arg: unknown) => void) {
        if (channel === '@plugin-process-message')
          listener = handler
      },
      send() {},
      removeListener() {},
    },
  }

  const code = getPluginChannelPreludeCode({ uniqueKey: UNIQUE_KEY })
  // eslint-disable-next-line no-new-func
  new Function('require', 'window', `${code}`)(
    (name: string) => (name === 'electron' ? fakeElectron : {}),
    window,
  )

  const channel = (window as unknown as { $channel: { regChannel: (name: string, cb: (data: unknown) => void) => void } }).$channel
  channel.regChannel('demo-event', (data) => {
    received.push(data)
  })

  if (!listener)
    throw new Error('prelude did not register a @plugin-process-message listener')

  return {
    deliver: (message: unknown) => (listener as (event: unknown, arg: unknown) => void)({}, message),
    received,
  }
}

function message(header: Record<string, unknown>) {
  return {
    name: 'demo-event',
    code: 200,
    data: { hello: 'world' },
    sync: undefined,
    header: { status: 'request', type: 'plugin', ...header },
  }
}

describe('plugin prelude uniqueKey enforcement', () => {
  let harness: Harness

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    harness = loadPrelude()
  })

  it('delivers a message carrying the right key', () => {
    // Positive control: an enforcement that dropped everything would satisfy the rejections
    // below while making the plugin channel useless.
    harness.deliver(message({ uniqueKey: UNIQUE_KEY }))
    expect(harness.received).toHaveLength(1)
  })

  it('drops a message with no uniqueKey at all', () => {
    // The regression: this used to warn and then dispatch.
    harness.deliver(message({}))
    expect(harness.received).toHaveLength(0)
  })

  it.each([undefined, null, '', 0, false])('drops a falsy uniqueKey (%s)', (value) => {
    harness.deliver(message({ uniqueKey: value }))
    expect(harness.received).toHaveLength(0)
  })

  it('still drops a mismatched key', () => {
    harness.deliver(message({ uniqueKey: 'someone-elses-key' }))
    expect(harness.received).toHaveLength(0)
  })

  it('reports a missing key as an error rather than a warning', () => {
    // It is a rejection now, so it belongs at the same level as a mismatch — a warning reads
    // as "this happened and we continued", which is exactly what used to happen.
    harness.deliver(message({}))
    expect(console.error).toHaveBeenCalled()
  })
})
