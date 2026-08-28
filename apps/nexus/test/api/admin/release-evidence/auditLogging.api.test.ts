import type { H3Event } from 'h3'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Release evidence is the record a release is signed off against, so creating a
 * run or flipping an item's status has to leave the same who/what/when/where
 * trail every other mutating admin endpoint leaves. These endpoints wrote none.
 */

const logAdminAudit = vi.fn()
const requireAdminOrApiKey = vi.fn()
const createReleaseEvidenceRun = vi.fn()
const upsertReleaseEvidenceItem = vi.fn()
const validateReleaseEvidenceItemInput = vi.fn()
const readBody = vi.fn()

vi.mock('../../../../server/utils/adminAuditStore', () => ({ logAdminAudit }))
vi.mock('../../../../server/utils/auth', () => ({ requireAdminOrApiKey }))
vi.mock('../../../../server/utils/releaseEvidenceStore', () => ({
  createReleaseEvidenceRun,
  upsertReleaseEvidenceItem,
  validateReleaseEvidenceItemInput,
}))
vi.mock('h3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('h3')>()),
  readBody,
}))

type Handler = (event: H3Event) => Promise<any>

let createRun: Handler
let upsertItem: Handler
let docGuard: Handler

const RUN = {
  id: 'run-1',
  version: '2.5.0',
  platform: 'all',
  scope: 'docs',
  status: 'passed',
}

const ITEM = {
  id: 'item-1',
  category: 'docs',
  caseId: 'docs-guard',
  status: 'passed',
  requiredForRelease: true,
}

function createEvent(params: Record<string, string> = {}): H3Event {
  return { context: { params } } as unknown as H3Event
}

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: Handler) => fn
  createRun = (await import('../../../../server/api/admin/release-evidence/runs.post')).default as unknown as Handler
  upsertItem = (await import('../../../../server/api/admin/release-evidence/runs/[runId]/items.post')).default as unknown as Handler
  docGuard = (await import('../../../../server/api/admin/release-evidence/doc-guard.post')).default as unknown as Handler
})

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminOrApiKey.mockResolvedValue({ userId: 'admin-1', authType: 'admin' })
  createReleaseEvidenceRun.mockResolvedValue({ ...RUN })
  upsertReleaseEvidenceItem.mockResolvedValue({ ...ITEM })
  readBody.mockResolvedValue({ version: '2.5.0', platform: 'all', scope: 'docs', status: 'passed' })
})

describe('release evidence audit logging', () => {
  it('records an audit entry when a run is created', async () => {
    await createRun(createEvent())

    expect(logAdminAudit).toHaveBeenCalledTimes(1)
    expect(logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin-1',
      action: 'release.evidence.run.create',
      targetType: 'release_evidence_run',
      targetId: 'run-1',
    }))
  })

  it('records an audit entry when an item is upserted', async () => {
    await upsertItem(createEvent({ runId: 'run-1' }))

    expect(logAdminAudit).toHaveBeenCalledTimes(1)
    expect(logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin-1',
      action: 'release.evidence.item.upsert',
      targetType: 'release_evidence_item',
      targetId: 'item-1',
    }))
  })

  it('records an audit entry when the doc guard result is recorded', async () => {
    await docGuard(createEvent())

    expect(logAdminAudit).toHaveBeenCalledTimes(1)
    expect(logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin-1',
      action: 'release.evidence.doc-guard.record',
      targetId: 'run-1',
    }))
  })

  it('attributes the entry to the API key caller, not an anonymous actor', async () => {
    // requireAdminOrApiKey falls back to a scoped API key, and items.post
    // discarded its return value entirely — an unattributable mutation.
    requireAdminOrApiKey.mockResolvedValue({ userId: 'svc-user-9', authType: 'apiKey' })

    await upsertItem(createEvent({ runId: 'run-1' }))

    expect(logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'svc-user-9',
      metadata: expect.objectContaining({ authType: 'apiKey' }),
    }))
  })

  it('does not record an audit entry when the mutation itself fails', async () => {
    upsertReleaseEvidenceItem.mockRejectedValue(new Error('store exploded'))

    await expect(upsertItem(createEvent({ runId: 'run-1' }))).rejects.toThrow('store exploded')
    expect(logAdminAudit).not.toHaveBeenCalled()
  })
})
