import { afterEach, describe, expect, it } from 'vitest'
import { AppEvents, ClipboardEvents, CoreBoxEvents } from '../../transport/events'
import { isPortChannelEnabled, resolvePortChannelAllowlist } from '../../transport/sdk/port-policy'

const ENV_KEY = 'TALEX_TRANSPORT_PORT_CHANNELS'
const ORIGINAL_ENV = process.env[ENV_KEY]

const restoreEnv = (): void => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env[ENV_KEY]
    return
  }
  process.env[ENV_KEY] = ORIGINAL_ENV
}

afterEach(() => {
  restoreEnv()
})

describe('port-policy', () => {
  it('uses default allowlist when env is unset', () => {
    delete process.env[ENV_KEY]
    const allowlist = resolvePortChannelAllowlist()
    expect(allowlist.has(ClipboardEvents.change.toEventName())).toBe(true)
    expect(allowlist.has(AppEvents.fileIndex.progress.toEventName())).toBe(true)
    expect(allowlist.has(CoreBoxEvents.search.update.toEventName())).toBe(true)
  })

  it('parses env override list', () => {
    process.env[ENV_KEY] = [
      CoreBoxEvents.search.update.toEventName(),
      ClipboardEvents.change.toEventName(),
    ].join(',')
    const allowlist = resolvePortChannelAllowlist()
    expect(allowlist.has(CoreBoxEvents.search.update.toEventName())).toBe(true)
    expect(allowlist.has(ClipboardEvents.change.toEventName())).toBe(true)
    expect(allowlist.has(AppEvents.fileIndex.progress.toEventName())).toBe(false)
  })

  it('disables allowlist when env is blank', () => {
    process.env[ENV_KEY] = '   '
    expect(isPortChannelEnabled(ClipboardEvents.change.toEventName())).toBe(false)
  })
})
