/**
 * The preload's loading-overlay sinks dispatched on `ev.data` alone, in the privileged preload
 * context, so any cross-origin frame embedded in the page could post `{ payload: 'removeLoading' }`
 * or a crafted channel event and be obeyed (#797).
 */
import { describe, expect, it } from 'vitest'
import { isTrustedPreloadMessage } from './trusted-preload-message'

function selfWindow(origin: string): Window {
  return { location: { origin } } as unknown as Window
}

describe('isTrustedPreloadMessage', () => {
  it('接受本窗口 postMessage 给自己的消息', () => {
    const self = selfWindow('https://app.example')

    expect(isTrustedPreloadMessage({ source: self, origin: 'https://app.example' }, self)).toBe(
      true
    )
  })

  it('拒绝来自其它窗口的消息,哪怕 origin 相同', () => {
    const self = selfWindow('https://app.example')
    const frame = {} as unknown as Window

    // A same-origin iframe is still not this window: source is what cannot be forged.
    expect(isTrustedPreloadMessage({ source: frame, origin: 'https://app.example' }, self)).toBe(
      false
    )
  })

  it('拒绝跨源来源', () => {
    const self = selfWindow('https://app.example')
    const frame = {} as unknown as Window

    expect(isTrustedPreloadMessage({ source: frame, origin: 'https://evil.example' }, self)).toBe(
      false
    )
  })

  it('source 相同但 origin 不符时仍然拒绝', () => {
    const self = selfWindow('https://app.example')

    expect(isTrustedPreloadMessage({ source: self, origin: 'https://evil.example' }, self)).toBe(
      false
    )
  })

  it('file: 页面不会被自己的 null origin 挡住', () => {
    // The packaged app loads from file:, whose origin serialises as 'null'. Rejecting on that
    // would break the real app rather than an attacker.
    const self = selfWindow('null')

    expect(isTrustedPreloadMessage({ source: self, origin: 'null' }, self)).toBe(true)
    expect(isTrustedPreloadMessage({ source: self, origin: '' }, self)).toBe(true)
  })

  it('没有 source 的消息一律拒绝', () => {
    const self = selfWindow('https://app.example')

    expect(isTrustedPreloadMessage({ source: null, origin: 'https://app.example' }, self)).toBe(
      false
    )
  })
})
