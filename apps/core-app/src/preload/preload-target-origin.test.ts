/**
 * sendPreloadEvent used to fall back to '*', delivering the loading-state payload to any
 * cross-origin frame embedded in the page (#798).
 */
import { describe, expect, it } from 'vitest'
import { resolvePreloadTargetOrigin } from './preload-target-origin'

describe('resolvePreloadTargetOrigin', () => {
  it('返回真实来源', () => {
    expect(resolvePreloadTargetOrigin({ origin: 'https://app.example', protocol: 'https:' })).toBe(
      'https://app.example'
    )
  })

  it('file: 页面得到 file:// 而不是通配符', () => {
    expect(resolvePreloadTargetOrigin({ origin: 'null', protocol: 'file:' })).toBe('file://')
  })

  it('无法确定来源时返回 null,由调用方跳过投递', () => {
    expect(resolvePreloadTargetOrigin({ origin: 'null', protocol: 'https:' })).toBeNull()
    expect(resolvePreloadTargetOrigin({ protocol: 'about:' })).toBeNull()
    expect(resolvePreloadTargetOrigin({})).toBeNull()
  })

  it('永远不会返回 *', () => {
    for (const location of [
      { origin: 'null', protocol: 'https:' },
      { origin: '', protocol: 'data:' },
      {}
    ]) {
      expect(resolvePreloadTargetOrigin(location)).not.toBe('*')
    }
  })
})
