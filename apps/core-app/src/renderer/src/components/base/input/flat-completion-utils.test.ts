import { describe, expect, it, vi } from 'vitest'
import {
  createFlatCompletionUpdate,
  resolveFlatCompletionPlaceholder
} from './flat-completion-utils'

describe('flat-completion utils', () => {
  it('保留调用方 placeholder，未提供时回退为空字符串', () => {
    expect(resolveFlatCompletionPlaceholder('Search plugins')).toBe('Search plugins')
    expect(resolveFlatCompletionPlaceholder()).toBe('')
  })

  it('规范化查询并把补全结果裁剪到 8 条', () => {
    const queryFetcher = vi.fn(() => ['1', '2', '3', '4', '5', '6', '7', '8', '9'])

    const update = createFlatCompletionUpdate(undefined, queryFetcher)
    expect(update.query).toBe('')
    expect(queryFetcher).toHaveBeenCalledWith('')

    const nextUpdate = createFlatCompletionUpdate('plugin', queryFetcher)
    expect(nextUpdate.query).toBe('plugin')
    expect(queryFetcher).toHaveBeenLastCalledWith('plugin')
    expect(nextUpdate.results).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })
})
