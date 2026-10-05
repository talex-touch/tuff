// @vitest-environment jsdom
import type {
  AuditLogPage,
  AuditLogQuery,
  IntelligenceAuditLogEntry
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIT_EXPORT_PAGE_SIZE,
  AuditExportCancelledError,
  auditExportFilename,
  buildAuditCsv,
  buildAuditJson,
  downloadTextFile,
  fetchAllAuditRows
} from './audit-export'

function row(
  index: number,
  overrides: Partial<IntelligenceAuditLogEntry> = {}
): IntelligenceAuditLogEntry {
  return {
    traceId: `trace-${index}`,
    timestamp: 1_790_000_000_000 - index * 1000,
    capabilityId: 'text.chat',
    provider: 'custom-1',
    model: 'gpt-4o',
    caller: 'core.home.conversation',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latency: 120,
    success: true,
    estimatedCost: 0.0001,
    ...overrides
  }
}

/** A host that holds `count` rows newest first and pages them the way `queryAuditLogs` does. */
function hostWith(count: number) {
  const all = Array.from({ length: count }, (_, index) => row(index))
  const calls: AuditLogQuery[] = []
  const fetchPage = vi.fn(async (query: AuditLogQuery): Promise<AuditLogPage> => {
    calls.push(query)
    const offset = query.offset ?? 0
    const limit = Math.min(200, query.limit ?? 50)
    return { rows: all.slice(offset, offset + limit), total: all.length }
  })
  return { all, calls, fetchPage }
}

describe('fetchAllAuditRows', () => {
  it('reads every row, 200 at a time, up to the total', async () => {
    const host = hostWith(450)
    const progress: Array<[number, number]> = []
    const result = await fetchAllAuditRows({ startMs: 1, endMs: 2 }, host.fetchPage, {
      onProgress: ({ fetched, total }) => progress.push([fetched, total])
    })
    expect(result.rows).toHaveLength(450)
    expect(result.total).toBe(450)
    expect(host.calls.map((call) => [call.offset, call.limit])).toEqual([
      [0, AUDIT_EXPORT_PAGE_SIZE],
      [200, AUDIT_EXPORT_PAGE_SIZE],
      [400, AUDIT_EXPORT_PAGE_SIZE]
    ])
    // The filters ride along on every page.
    expect(host.calls.every((call) => call.startMs === 1 && call.endMs === 2)).toBe(true)
    expect(progress).toEqual([
      [200, 450],
      [400, 450],
      [450, 450]
    ])
  })

  it('drops the repeat a late flush pushes onto the next page', async () => {
    const all = Array.from({ length: 300 }, (_, index) => row(index))
    let calls = 0
    const fetchPage = async (query: AuditLogQuery): Promise<AuditLogPage> => {
      calls += 1
      // After the first page a row lands near the top: every later row moves down by one.
      const shifted = calls > 1 ? [row(-1), ...all] : all
      const offset = query.offset ?? 0
      return { rows: shifted.slice(offset, offset + 200), total: calls > 1 ? 301 : 300 }
    }
    const result = await fetchAllAuditRows({}, fetchPage)
    expect(result.rows).toHaveLength(300)
    expect(new Set(result.rows.map((entry) => entry.traceId)).size).toBe(300)
  })

  it('stops at a short page when rows were deleted meanwhile', async () => {
    const fetchPage = async (query: AuditLogQuery): Promise<AuditLogPage> =>
      query.offset === 0
        ? { rows: Array.from({ length: 200 }, (_, index) => row(index)), total: 500 }
        : { rows: Array.from({ length: 20 }, (_, index) => row(200 + index)), total: 220 }
    const result = await fetchAllAuditRows({}, fetchPage)
    expect(result.rows).toHaveLength(220)
  })

  it('stops between pages once cancelled', async () => {
    const host = hostWith(450)
    const signal = { cancelled: false }
    const pending = fetchAllAuditRows({}, host.fetchPage, {
      signal,
      onProgress: () => {
        signal.cancelled = true
      }
    })
    await expect(pending).rejects.toBeInstanceOf(AuditExportCancelledError)
    expect(host.calls).toHaveLength(1)
  })
})

const LABELS = {
  channel: (id: string) => (id === 'custom-1' ? '我的渠道' : id),
  capability: (id: string) => (id === 'text.chat' ? '对话' : id),
  caller: (caller: string) =>
    caller === 'core.home.conversation' ? 'Home 对话' : caller || '应用内其他'
}

describe('CSV', () => {
  it('writes a BOM, a header, CRLF lines and the labels beside the ids', () => {
    const failed = row(1, { success: false, error: 'PROVIDER_TIMEOUT' })
    const csv = buildAuditCsv([row(0), failed], LABELS)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines.at(-1)).toBe('')
    expect(lines[0]).toBe(
      'time,timestamp_ms,trace_id,status,error_code,capability_id,capability,channel_id,channel,model,caller_id,caller,prompt_tokens,completion_tokens,total_tokens,estimated_cost_usd,latency_ms,metadata'
    )
    expect(lines).toHaveLength(4)
    expect(lines[1]).toContain('"text.chat","对话","custom-1","我的渠道","gpt-4o"')
    expect(lines[2]).toContain('"failure","PROVIDER_TIMEOUT"')
  })

  it('quotes text and defuses anything a spreadsheet would run as a formula', () => {
    const csv = buildAuditCsv(
      [row(0, { model: '=HYPERLINK("x")', caller: 'say "hi"', metadata: { operation: 'home' } })],
      LABELS
    )
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"say ""hi"""')
    expect(csv).toContain('"{""operation"":""home""}"')
  })
})

describe('JSON', () => {
  it('records the window, the filters and every row with its labels', () => {
    const json = JSON.parse(
      buildAuditJson(
        [row(0)],
        LABELS,
        {
          range: '7d',
          startMs: Date.UTC(2026, 8, 27),
          endMs: Date.UTC(2026, 9, 4),
          timezone: 'Asia/Shanghai',
          filters: { status: 'failure', providerId: null, caller: '', capabilityId: null }
        },
        Date.UTC(2026, 9, 3)
      )
    )
    expect(json.range).toBe('7d')
    expect(json.total).toBe(1)
    expect(json.window.timezone).toBe('Asia/Shanghai')
    expect(json.filters).toEqual({
      status: 'failure',
      providerId: null,
      caller: '',
      capabilityId: null
    })
    expect(json.rows[0]).toMatchObject({
      traceId: 'trace-0',
      channel: '我的渠道',
      capability: '对话'
    })
  })

  it('names the file after the local date and the range', () => {
    expect(auditExportFilename('csv', '30d', new Date(2026, 9, 3, 23, 59).getTime())).toBe(
      'tuff-ai-audit-2026-10-03-30d.csv'
    )
    expect(auditExportFilename('json', 'today', new Date(2026, 0, 2).getTime())).toBe(
      'tuff-ai-audit-2026-01-02-today.json'
    )
  })
})

describe('download', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('hands the text over as a Blob through <a download>, and frees it later', () => {
    vi.useFakeTimers()
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:audit'
    })
    URL.revokeObjectURL = vi.fn()
    const clicks: Array<{ href: string; download: string }> = []
    const anchor = HTMLAnchorElement.prototype
    vi.spyOn(anchor, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download })
    })

    downloadTextFile('a,b\r\n', 'tuff-ai-audit.csv', 'text/csv;charset=utf-8')

    expect(clicks).toEqual([{ href: 'blob:audit', download: 'tuff-ai-audit.csv' }])
    // jsdom's Blob has no `text()`; its size and type are what the click hands over.
    expect(blobs[0]!.size).toBe('a,b\r\n'.length)
    expect(blobs[0]!.type).toBe('text/csv;charset=utf-8')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audit')
  })
})
