import { describe, expect, it } from 'vitest'
import { appendFileIndexReportId, resolveFileIndexFailureCopy } from './file-index-failure-copy'

const MESSAGES = {
  databaseBusy: '数据库正忙，请稍后重试。',
  writerBusy: '索引写入任务尚未排空，请稍后重试。',
  generic: '操作未能完成，请重试。'
}

describe('file index failure copy (issue #476)', () => {
  it('maps stable codes to localized copy', () => {
    expect(resolveFileIndexFailureCopy('FILE_INDEX_DATABASE_BUSY', MESSAGES)).toBe(
      MESSAGES.databaseBusy
    )
    expect(resolveFileIndexFailureCopy('INDEXED_SOURCE_DATABASE_BUSY', MESSAGES)).toBe(
      MESSAGES.databaseBusy
    )
    expect(resolveFileIndexFailureCopy('FILE_INDEX_WRITER_DRAIN_TIMEOUT', MESSAGES)).toBe(
      MESSAGES.writerBusy
    )
    expect(resolveFileIndexFailureCopy('FILE_INDEX_SCAN_FAILED', MESSAGES)).toBe(MESSAGES.generic)
    expect(resolveFileIndexFailureCopy(null, MESSAGES)).toBe(MESSAGES.generic)
    expect(resolveFileIndexFailureCopy(undefined, MESSAGES)).toBe(MESSAGES.generic)
  })

  it('never interpolates hostile payloads into copy', () => {
    const hostile =
      'Failed query: update "files" set "name" = ?\nparams: /Users/alice/Private/report.txt'
    const copy = resolveFileIndexFailureCopy(hostile, MESSAGES)
    expect(copy).toBe(MESSAGES.generic)
    expect(copy).not.toContain('Failed query:')
    expect(copy).not.toContain('params:')
    expect(copy).not.toContain('/Users/')
  })

  it('appends the report id suffix only when a report id exists', () => {
    const suffix = (reportId: string) => `报告 ID：${reportId}`
    expect(appendFileIndexReportId('重建失败', 'report-9', suffix)).toBe(
      '重建失败 报告 ID：report-9'
    )
    expect(appendFileIndexReportId('重建失败', null, suffix)).toBe('重建失败')
    expect(appendFileIndexReportId('重建失败', undefined, suffix)).toBe('重建失败')
    expect(appendFileIndexReportId('重建失败', '', suffix)).toBe('重建失败')
  })
})
