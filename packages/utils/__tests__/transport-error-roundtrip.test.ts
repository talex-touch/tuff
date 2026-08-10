/**
 * toJSON serialised `timestamp` and fromJSON threw it away - the constructor overwrote it with
 * Date.now() at rehydration time (#873). A renderer correlating an IPC-transported error against
 * a main-process log line read the deserialisation moment, so the two never lined up, and the
 * pair did not round-trip despite being named as if it did.
 *
 * The timestamp now arrives through a constructor option rather than a post-hoc write, so the
 * field stays `readonly` and untrusted input still cannot install a non-number: fromJSON's cast
 * is a lie whenever the payload came off the wire, and the constructor is where that is caught.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TuffTransportError, TuffTransportErrorCode } from '../transport/errors'

const FAILURE_TIME = Date.parse('2026-02-01T10:00:00.000Z')
const REHYDRATION_TIME = Date.parse('2026-02-01T10:05:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

/** Serialises an error stamped at FAILURE_TIME, then rehydrates it five minutes later. */
function roundTrip(mutate: (payload: Record<string, unknown>) => void = () => {}): {
  original: TuffTransportError
  restored: TuffTransportError
} {
  vi.useFakeTimers()
  vi.setSystemTime(FAILURE_TIME)
  const original = new TuffTransportError(
    TuffTransportErrorCode.INVALID_PLUGIN_KEY,
    'plugin key rejected',
    { eventName: 'storage:get', pluginName: 'com.acme.demo' },
  )
  const payload = original.toJSON()

  vi.setSystemTime(REHYDRATION_TIME)
  mutate(payload)
  return { original, restored: TuffTransportError.fromJSON(payload) }
}

describe('TuffTransportError round-trips through toJSON/fromJSON', () => {
  it('还原出来的 timestamp 是故障发生的时刻,不是反序列化的时刻', () => {
    const { original, restored } = roundTrip()

    expect(restored.timestamp).toBe(FAILURE_TIME)
    expect(restored.timestamp).toBe(original.timestamp)
    expect(restored.timestamp).not.toBe(REHYDRATION_TIME)
  })

  it('其余字段一并还原(否则上一条会掩盖 fromJSON 整体损坏)', () => {
    const { restored } = roundTrip()

    expect(restored).toMatchObject({
      code: TuffTransportErrorCode.INVALID_PLUGIN_KEY,
      message: 'plugin key rejected',
      eventName: 'storage:get',
      pluginName: 'com.acme.demo',
    })
    expect(restored).toBeInstanceOf(TuffTransportError)
  })

  it('新建的错误仍然打当前时间,而不是"永远用传入值"', () => {
    vi.useFakeTimers()
    vi.setSystemTime(REHYDRATION_TIME)

    expect(new TuffTransportError(TuffTransportErrorCode.INTERNAL_ERROR, 'fresh').timestamp).toBe(
      REHYDRATION_TIME,
    )
  })

  it.each([
    ['缺失', undefined],
    ['字符串', '2026-02-01T10:00:00.000Z'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('payload 的 timestamp 是%s时,退回当前时间而不是原样吞下', (_label, value) => {
    const { restored } = roundTrip((payload) => {
      payload.timestamp = value
    })

    expect(restored.timestamp).toBe(REHYDRATION_TIME)
  })
})
