import type {
  NapiCarrier as NapiCarrierInstance,
  NativeProtocolBinding
} from '@talex-touch/tuff-native/protocol'
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NativeTransport } from './native-transport'

const require = createRequire(import.meta.url)
const protocolModule = require('@talex-touch/tuff-native/protocol') as {
  NapiCarrier: new (options: {
    id: string
    binding: NativeProtocolBinding
    clientVersion?: string
  }) => NapiCarrierInstance
}

function loadFixtureBinding(): NativeProtocolBinding {
  const fixturePath = path.resolve(
    process.cwd(),
    '../../packages/tuff-native/build/fixtures/tuff_native_protocol_fixture.node'
  )
  return require(fixturePath) as NativeProtocolBinding
}

describe('NativeTransport real N-API integration', () => {
  it('runs unary attachments and credit-bounded streams through all three layers', async () => {
    const carrier = new protocolModule.NapiCarrier({
      id: 'fixture-napi',
      binding: loadFixtureBinding(),
      clientVersion: '2.4.13'
    })
    const transport = new NativeTransport({ carriers: [carrier] })
    const snapshot = await transport.initialize()
    expect(snapshot.capabilities.map((item) => item.id)).toEqual([
      'fixture.counter',
      'fixture.echo'
    ])

    const input = Buffer.from('three-layer-buffer')
    const unary = transport.invoke<{ source: string }, { source: string }>(
      'fixture.echo',
      'echo',
      { source: 'integration' },
      {
        attachments: [
          {
            id: 'input',
            data: input,
            mediaType: 'application/octet-stream'
          }
        ]
      }
    )
    input.fill(0)
    const unaryResult = await unary
    expect(unaryResult.value).toEqual({ source: 'integration' })
    expect(unaryResult.attachments[0]?.toString()).toBe('three-layer-buffer')

    const stream = transport.openStream<{ count: number }, { value: number }>(
      'fixture.counter',
      'count',
      { count: 3 },
      { initialWindow: 1 }
    )
    const values: number[] = []
    for await (const chunk of stream) values.push(chunk.value.value)
    expect(values).toEqual([1, 2, 3])
    await expect(stream.closed).resolves.toEqual({
      kind: 'end',
      value: { emitted: 3 }
    })

    const failed = transport.openStream<{ count: number; failAt: number }, { value: number }>(
      'fixture.counter',
      'count',
      { count: 3, failAt: 2 },
      { initialWindow: 1 }
    )
    const failedIterator = failed[Symbol.asyncIterator]()
    await expect(failedIterator.next()).resolves.toMatchObject({
      done: false,
      value: { value: { value: 1 } }
    })
    await expect(failedIterator.next()).rejects.toMatchObject({
      code: 'FIXTURE_STREAM_FAILED'
    })
    await expect(failed.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'FIXTURE_STREAM_FAILED' }
    })

    const cancelled = transport.openStream<{ count: number }, { value: number }>(
      'fixture.counter',
      'count',
      { count: 10 },
      { initialWindow: 1 }
    )
    const iterator = cancelled[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    cancelled.cancel()
    await expect(cancelled.closed).resolves.toEqual({ kind: 'cancelled' })

    await transport.dispose()
    expect(transport.getState()).toBe('disposed')
  })
})
