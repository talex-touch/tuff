/**
 * setFile round-trips content through JSON to drop non-cloneables, and neither failure mode of
 * that round trip was caught (#870): JSON.stringify *throws* on circular references and BigInt,
 * and it *returns* undefined for a top-level undefined/function/symbol - which JSON.parse then
 * reads as the string "undefined" and rejects. Either way a method declared to resolve
 * `{ success, error? }` threw synchronously instead.
 *
 * The returns-undefined half is the one worth having tests for: it is not an exception being
 * forwarded, so a bare try/catch around the expression fixes only half the issue and still throws
 * SyntaxError for `setFile('state.json', undefined)`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePluginStorage } from '../plugin/sdk/storage'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  usePluginName: vi.fn(() => 'demo-plugin'),
  ensureRendererChannel: vi.fn(() => ({ send: vi.fn() })),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  usePluginName: mocks.usePluginName,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({ send: mocks.send, on: vi.fn() })),
}))

describe('setFile reports non-serializable content instead of throwing', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.send.mockResolvedValue({ success: true })
  })

  it('可序列化的内容照常发送,并剥掉不可克隆的部分', async () => {
    const content = { items: [1, 2], when: new Date('2026-02-01T10:00:00.000Z'), skip: undefined }

    await expect(usePluginStorage().setFile('state.json', content)).resolves.toEqual({
      success: true,
    })
    expect(mocks.send).toHaveBeenCalledWith(PluginEvents.storage.setFile, {
      pluginName: 'demo-plugin',
      fileName: 'state.json',
      // Date became a string and the undefined property is gone - that is what the round trip is for.
      content: { items: [1, 2], when: '2026-02-01T10:00:00.000Z' },
    })
  })

  it.each([
    ['undefined', undefined],
    ['函数', () => 'nope'],
    ['symbol', Symbol('nope')],
  ])('顶层 %s 没有 JSON 表示,返回失败而不是抛 SyntaxError', async (_label, content) => {
    const result = await usePluginStorage().setFile('state.json', content)

    expect(result.success).toBe(false)
    expect(result.error).toContain('state.json')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('循环引用返回失败而不是抛 TypeError', async () => {
    const content: Record<string, unknown> = { name: 'loop' }
    content.self = content

    const result = await usePluginStorage().setFile('state.json', content)

    expect(result.success).toBe(false)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('BigInt 返回失败而不是抛 TypeError', async () => {
    const result = await usePluginStorage().setFile('state.json', { size: 1n })

    expect(result.success).toBe(false)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('null 与 false 是合法内容,不能被当成"不可序列化"一起挡掉', async () => {
    await expect(usePluginStorage().setFile('a.json', null)).resolves.toEqual({ success: true })
    await expect(usePluginStorage().setFile('b.json', false)).resolves.toEqual({ success: true })

    expect(mocks.send).toHaveBeenCalledTimes(2)
    expect(mocks.send).toHaveBeenNthCalledWith(1, PluginEvents.storage.setFile, {
      pluginName: 'demo-plugin',
      fileName: 'a.json',
      content: null,
    })
  })
})
