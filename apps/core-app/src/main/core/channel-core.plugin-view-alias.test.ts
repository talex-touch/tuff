/**
 * The plugin channel key no longer travels to the plugin view (#697).
 *
 * It used to arrive as a renderer command-line argument, where any unprivileged process on the
 * machine reads it out of the process table. A per-surface alias replaces it on the wire, which
 * only works if the translation happens at *every* boundary — and a missed one is silent in both
 * directions. An unmasked outbound message hands the credential straight back to the surface this
 * change took it away from; an untranslated inbound one leaves the message unattributed, and the
 * plugin view drops a reply whose key it does not recognise without raising anything.
 *
 * So the assertions below are about the wire bytes rather than about the helper functions, which
 * `plugin-view-registry.test.ts` covers on their own.
 */
import { describe, expect, it, vi } from 'vitest'

// The import chain reaches talex-mica-electron, @sentry/electron and precore, all of which touch
// Electron at module scope.
import '../modules/ai/intelligence-test-harness'

import { ipcMain } from 'electron'
import {
  registerPluginWebContents,
  resolvePluginViewNonce,
  unregisterPluginWebContents
} from '../modules/plugin/runtime/plugin-view-registry'
import { RAW_MAIN_PROCESS_CHANNEL, RAW_PLUGIN_PROCESS_CHANNEL } from '../../shared/ipc/raw-channel'
import { genTouchChannel } from './channel-core'

interface ChannelInternals {
  __handle_main: (event: unknown, arg: unknown) => void
  regChannel: (type: string, eventName: string, callback: (data: unknown) => unknown) => () => void
  _sendTo: (
    win: unknown,
    type: string,
    eventName: string,
    arg: unknown,
    header?: Record<string, unknown>
  ) => Promise<unknown>
  __parse_raw_data: (
    event: unknown,
    arg: unknown
  ) => { header: { uniqueKey?: string; declaredKey?: string }; plugin?: string }
  requestKey: (
    name: string,
    activation: { pluginInstanceId: string; activationGeneration: number }
  ) => string
  revokeKey: (key: string) => boolean
  resolveIdentity: (key: string) => unknown
}

const ACTIVATION = {
  name: 'com.acme.demo',
  pluginInstanceId: 'instance-1',
  activationGeneration: 1,
  key: 'plugin-channel-key'
}

/**
 * `_sendTo` returns a promise that settles on the reply, which a fake window never sends. The
 * send itself happens synchronously inside the executor, so these calls are not awaited.
 */
function fakeWindow(webContentsId: number): {
  win: unknown
  sent: Array<{ channel: string; payload: unknown }>
} {
  const sent: Array<{ channel: string; payload: unknown }> = []
  return {
    sent,
    win: {
      webContents: {
        id: webContentsId,
        isDestroyed: () => false,
        send: (channel: string, payload: unknown) => sent.push({ channel, payload })
      }
    }
  }
}

function fakeSender(webContentsId: number): unknown {
  return { sender: { id: webContentsId, isDestroyed: () => false } }
}

/** An event whose replies are captured, both the async `sender.send` and the sync `returnValue`. */
function fakeReplyEvent(webContentsId: number): {
  event: unknown
  replies: unknown[]
  returned: unknown[]
} {
  const replies: unknown[] = []
  const returned: unknown[] = []
  const event = {
    sender: {
      id: webContentsId,
      isDestroyed: () => false,
      send: (_channel: string, payload: unknown) => replies.push(payload)
    },
    get returnValue(): unknown {
      return returned.at(-1)
    },
    set returnValue(value: unknown) {
      returned.push(value)
    }
  }
  return { event, replies, returned }
}

function replyKey(payload: unknown): unknown {
  return (payload as { header?: { uniqueKey?: unknown } } | undefined)?.header?.uniqueKey
}

const channel = genTouchChannel({
  window: { window: {} },
  app: { on: vi.fn() }
} as never) as unknown as ChannelInternals

function sentKey(sent: Array<{ channel: string; payload: unknown }>): unknown {
  return (sent[0]?.payload as { header?: { uniqueKey?: unknown } } | undefined)?.header?.uniqueKey
}

function rawChannelListener(channelName: string): (event: unknown, arg: unknown) => void {
  const registration = vi.mocked(ipcMain.on).mock.calls.find(([name]) => name === channelName)
  expect(registration?.[1]).toBeTypeOf('function')
  return registration?.[1] as unknown as (event: unknown, arg: unknown) => void
}

describe('outbound messages carry the alias, not the key', () => {
  it('replaces the key when the target is the surface it belongs to', () => {
    const token = registerPluginWebContents(7301, ACTIVATION)
    const nonce = resolvePluginViewNonce(7301)
    const { win, sent } = fakeWindow(7301)

    void channel._sendTo(
      win,
      'plugin',
      'demo:event',
      { plugin: ACTIVATION.name },
      {
        uniqueKey: ACTIVATION.key
      }
    )

    expect(sent).toHaveLength(1)
    expect(sentKey(sent)).toBe(nonce)
    // The assertion that matters: the credential is not in the payload under any field.
    expect(JSON.stringify(sent[0]?.payload)).not.toContain(ACTIVATION.key)

    unregisterPluginWebContents(7301, token)
  })

  /**
   * The app renderer receives bridged plugin messages and matches on the key itself, as does the
   * plugin host process. Masking there would make them drop everything with no error raised, so
   * the pass-through is asserted rather than assumed.
   */
  it('leaves the key alone for a target that is not a registered plugin surface', () => {
    const { win, sent } = fakeWindow(7302)

    void channel._sendTo(
      win,
      'plugin',
      'demo:event',
      { plugin: ACTIVATION.name },
      {
        uniqueKey: ACTIVATION.key
      }
    )

    expect(sentKey(sent)).toBe(ACTIVATION.key)
  })

  it('stops masking once the surface is unregistered', () => {
    const token = registerPluginWebContents(7303, ACTIVATION)
    const nonce = resolvePluginViewNonce(7303)
    const before = fakeWindow(7303)

    void channel._sendTo(
      before.win,
      'plugin',
      'demo:event',
      { plugin: ACTIVATION.name },
      {
        uniqueKey: ACTIVATION.key
      }
    )
    // Positive control: without this the case below passes even if masking never worked.
    expect(sentKey(before.sent)).toBe(nonce)

    unregisterPluginWebContents(7303, token)

    const after = fakeWindow(7303)
    void channel._sendTo(
      after.win,
      'plugin',
      'demo:event',
      { plugin: ACTIVATION.name },
      {
        uniqueKey: ACTIVATION.key
      }
    )

    expect(sentKey(after.sent)).toBe(ACTIVATION.key)
  })
})

describe('inbound messages resolve the alias back to the key', () => {
  it('hands downstream the real key, so identity checks still compare like for like', () => {
    const token = registerPluginWebContents(7401, ACTIVATION)
    const nonce = resolvePluginViewNonce(7401)

    const parsed = channel.__parse_raw_data(fakeSender(7401), {
      name: 'demo:event',
      header: { status: 'request', uniqueKey: nonce },
      code: 0,
      data: {}
    })

    expect(parsed.header.uniqueKey).toBe(ACTIVATION.key)
    expect(parsed.plugin).toBe(ACTIVATION.name)

    unregisterPluginWebContents(7401, token)
  })

  /**
   * Replies echo the header back to the sender, and the plugin view filters on the value it sent.
   * Echoing the resolved key instead would both leak it and make the view drop its own reply.
   */
  it('keeps the value the sender put on the wire for the reply to echo', () => {
    const token = registerPluginWebContents(7402, ACTIVATION)
    const nonce = resolvePluginViewNonce(7402)

    const parsed = channel.__parse_raw_data(fakeSender(7402), {
      name: 'demo:event',
      header: { status: 'request', uniqueKey: nonce },
      code: 0,
      data: {}
    })

    expect(parsed.header.declaredKey).toBe(nonce)
    expect(parsed.header.declaredKey).not.toBe(ACTIVATION.key)

    unregisterPluginWebContents(7402, token)
  })

  it('does not resolve an alias whose surface is gone', () => {
    const token = registerPluginWebContents(7403, ACTIVATION)
    const nonce = resolvePluginViewNonce(7403)

    const before = channel.__parse_raw_data(fakeSender(7403), {
      name: 'demo:event',
      header: { status: 'request', uniqueKey: nonce },
      code: 0,
      data: {}
    })
    expect(before.header.uniqueKey).toBe(ACTIVATION.key)

    unregisterPluginWebContents(7403, token)

    const after = channel.__parse_raw_data(fakeSender(7403), {
      name: 'demo:event',
      header: { status: 'request', uniqueKey: nonce },
      code: 0,
      data: {}
    })

    expect(after.header.uniqueKey).toBe(nonce)
    expect(after.plugin).toBeUndefined()
  })

  /**
   * The reply path is the one that leaks in both directions at once: it echoes the header back to
   * the sender, so echoing the resolved key would hand the credential to the surface this change
   * took it away from *and* make the view drop its own reply, since the view filters on the value
   * it sent. Both of those are silent.
   *
   * Driven through the real dispatch rather than asserted on `declaredKey`, because the field
   * existing proves nothing about which one the reply picks up.
   */
  it('echoes the alias back on a reply, not the key', () => {
    const token = registerPluginWebContents(7405, ACTIVATION)
    const nonce = resolvePluginViewNonce(7405)
    const { event, replies, returned } = fakeReplyEvent(7405)

    // No handler is registered for this name, which is the reply path that needs no plugin runtime.
    channel.__handle_main(event, {
      name: 'demo:no-such-handler',
      header: { status: 'request', uniqueKey: nonce },
      code: 0,
      data: {}
    })

    const reply = replies[0] ?? returned[0]
    expect(reply, 'the dispatch produced no reply to inspect').toBeTruthy()
    expect(replyKey(reply)).toBe(nonce)
    expect(JSON.stringify(reply)).not.toContain(ACTIVATION.key)

    unregisterPluginWebContents(7405, token)
  })

  it('leaves a sender that is not using an alias untouched', () => {
    const parsed = channel.__parse_raw_data(fakeSender(7404), {
      name: 'demo:event',
      header: { status: 'request', uniqueKey: 'some-other-key' },
      code: 0,
      data: {}
    })

    expect(parsed.header.uniqueKey).toBe('some-other-key')
  })

  it('keeps an unregistered raw plugin sender on the plugin lane without trusting claims', () => {
    const eventName = 'demo:unregistered-plugin-lane'
    const mainHandler = vi.fn()
    const pluginHandler = vi.fn()
    const unregisterMain = channel.regChannel('main', eventName, mainHandler)
    const unregisterPlugin = channel.regChannel('plugin', eventName, pluginHandler)
    const { event } = fakeReplyEvent(7406)

    try {
      rawChannelListener(RAW_PLUGIN_PROCESS_CHANNEL)(event, {
        name: eventName,
        header: { status: 'request', type: 'main', uniqueKey: ACTIVATION.key },
        code: 0,
        data: {},
        plugin: ACTIVATION.name
      })

      expect(mainHandler).not.toHaveBeenCalled()
      expect(pluginHandler).toHaveBeenCalledTimes(1)
      const received = pluginHandler.mock.calls[0]?.[0] as {
        header?: { type?: string }
        plugin?: string
        pluginIdentity?: unknown
      }
      expect(received.header?.type).toBe('plugin')
      expect(received.plugin).toBe('__unverified_plugin_caller__')
      expect(received.plugin).not.toBe(ACTIVATION.name)
      expect(received.pluginIdentity).toBeUndefined()
    } finally {
      unregisterMain()
      unregisterPlugin()
    }
  })

  it('keeps an unregistered valid-key sender on the plugin lane from the raw main listener', () => {
    const eventName = 'demo:unregistered-valid-key-main-lane'
    const key = channel.requestKey(ACTIVATION.name, ACTIVATION)
    const mainHandler = vi.fn()
    const pluginHandler = vi.fn()
    const unregisterMain = channel.regChannel('main', eventName, mainHandler)
    const unregisterPlugin = channel.regChannel('plugin', eventName, pluginHandler)
    const { event } = fakeReplyEvent(7408)

    try {
      rawChannelListener(RAW_MAIN_PROCESS_CHANNEL)(event, {
        name: eventName,
        header: { status: 'request', type: 'main', uniqueKey: key },
        code: 0,
        data: {},
        plugin: ACTIVATION.name
      })

      expect(mainHandler).not.toHaveBeenCalled()
      expect(pluginHandler).toHaveBeenCalledTimes(1)
      const received = pluginHandler.mock.calls[0]?.[0] as {
        header?: { type?: string }
        plugin?: string
        pluginIdentity?: unknown
      }
      expect(received.header?.type).toBe('plugin')
      expect(received.plugin).toBe('__unverified_plugin_caller__')
      expect(received.plugin).not.toBe(ACTIVATION.name)
      expect(received.pluginIdentity).toBeUndefined()
    } finally {
      unregisterMain()
      unregisterPlugin()
      channel.revokeKey(key)
    }
  })

  it('routes a registered plugin sender through the plugin lane from the raw main listener', () => {
    const eventName = 'demo:registered-plugin-main-lane'
    const key = channel.requestKey(ACTIVATION.name, ACTIVATION)
    const activation = { ...ACTIVATION, key }
    const token = registerPluginWebContents(7407, activation)
    const mainHandler = vi.fn()
    const pluginHandler = vi.fn()
    const unregisterMain = channel.regChannel('main', eventName, mainHandler)
    const unregisterPlugin = channel.regChannel('plugin', eventName, pluginHandler)
    const { event } = fakeReplyEvent(7407)

    try {
      rawChannelListener(RAW_MAIN_PROCESS_CHANNEL)(event, {
        name: eventName,
        header: { status: 'request', type: 'main', uniqueKey: key },
        code: 0,
        data: {}
      })

      expect(mainHandler).not.toHaveBeenCalled()
      expect(pluginHandler).toHaveBeenCalledTimes(1)
      const received = pluginHandler.mock.calls[0]?.[0] as {
        header?: { type?: string }
        plugin?: string
        pluginIdentity?: unknown
      }
      expect(received.header?.type).toBe('plugin')
      expect(received.plugin).toBe(ACTIVATION.name)
      expect(received.pluginIdentity).toEqual(activation)
    } finally {
      unregisterMain()
      unregisterPlugin()
      unregisterPluginWebContents(7407, token)
      channel.revokeKey(key)
    }
  })
})
