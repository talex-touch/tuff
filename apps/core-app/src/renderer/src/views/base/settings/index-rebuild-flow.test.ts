import { describe, expect, it } from 'vitest'
import { resolveIndexRebuildOutcome } from './index-rebuild-flow'

describe('index rebuild flow helpers', () => {
  it('keeps confirmation as its own outcome before executing rebuild work', () => {
    expect(
      resolveIndexRebuildOutcome(
        {
          success: false,
          requiresConfirm: true,
          battery: { level: 12, charging: false },
          threshold: 20
        },
        {
          success: '重建已开始',
          failure: '重建失败'
        }
      )
    ).toEqual({
      type: 'confirm',
      result: {
        success: false,
        requiresConfirm: true,
        battery: { level: 12, charging: false },
        threshold: 20
      }
    })
  })

  it('always uses localized success copy for renderer toast', () => {
    expect(
      resolveIndexRebuildOutcome(
        {
          success: true
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

  it('maps stable error codes to localized failure copy and keeps the report id', () => {
    expect(
      resolveIndexRebuildOutcome(
        {
          success: false,
          errorCode: 'FILE_INDEX_DATABASE_BUSY',
          retryable: true,
          reportId: 'report-42'
        },
        {
          success: '重建已开始',
          failure: '重建失败',
          errors: {
            FILE_INDEX_DATABASE_BUSY: '数据库繁忙，重建未开始，请稍后重试。'
          }
        }
      )
    ).toEqual({
      type: 'failure',
      message: '数据库繁忙，重建未开始，请稍后重试。',
      reportId: 'report-42'
    })
  })

  it('never falls back to raw error or reason text from the payload', () => {
    const outcome = resolveIndexRebuildOutcome(
      {
        success: false,
        // Hostile legacy payload fields must not reach the toast.
        ...({
          error: 'Failed query: update "files" set "name" = ?\nparams: secret.md,1',
          reason: 'C:\\Users\\alice\\Private\\report.txt',
          message: '/Users/alice/Private/report.txt'
        } as Record<string, unknown>)
      },
      {
        success: '重建已开始',
        failure: '重建失败'
      }
    )

    expect(outcome).toEqual({ type: 'failure', message: '重建失败', reportId: undefined })
    const serialized = JSON.stringify(outcome)
    expect(serialized).not.toContain('Failed query:')
    expect(serialized).not.toContain('params:')
    expect(serialized).not.toContain('/Users/alice')
    expect(serialized).not.toContain('C:\\Users')
  })
})
