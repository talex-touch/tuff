import { describe, expect, it } from 'vitest'
import { resolveIndexRebuildOutcome } from './index-rebuild-flow'

describe('index rebuild flow helpers', () => {
  it('keeps confirmation as its own outcome before executing rebuild work', () => {
    expect(
      resolveIndexRebuildOutcome(
        {
          success: false,
          requiresConfirm: true,
          message: 'App index reindex requires confirmation'
        },
        {
          success: '重建已开始',
          failure: '重建失败'
        }
      )
    ).toEqual({ type: 'confirm' })
  })

  it('uses localized success fallback over raw sdk message for renderer toast', () => {
    expect(
      resolveIndexRebuildOutcome(
        {
          success: true,
          message: 'Index rebuild started'
        },
        {
          success: '索引重建已开始，请稍等片刻...',
          failure: '重建失败'
        }
      )
    ).toEqual({
      type: 'success',
      message: '索引重建已开始，请稍等片刻...'
    })
  })

  it('normalizes error and reason failures into one renderer failure message', () => {
    expect(
      resolveIndexRebuildOutcome(
        {
          success: false,
          error: 'Cannot rebuild: initialization context not available'
        },
        {
          success: '重建已开始',
          failure: '重建失败'
        }
      )
    ).toEqual({
      type: 'failure',
      message: 'Cannot rebuild: initialization context not available'
    })

    expect(
      resolveIndexRebuildOutcome(
        {
          success: false,
          reason: 'target-not-found'
        },
        {
          success: '重建已开始',
          failure: '重建失败'
        }
      )
    ).toEqual({
      type: 'failure',
      message: 'target-not-found'
    })
  })
})
