import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Six admin mutations used to change state and leave no trace in admin_audits.
// Each case asserts the five elements the trail needs from the caller: who
// (adminUserId), on what (targetType + targetId + targetLabel), and what was
// done (action + metadata). The ip/user-agent/timestamp columns are filled in by
// logAdminAudit itself, so they are not the handler's contract to satisfy.

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireAdminOrApiKey: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({ logAdminAudit: vi.fn() }))

const subscriptionMocks = vi.hoisted(() => ({ createActivationCode: vi.fn() }))
const docCommentMocks = vi.hoisted(() => ({
  deleteComment: vi.fn(),
  ensureCommentsSchema: vi.fn(),
  getCommentOwner: vi.fn(),
  getD1Database: vi.fn(),
}))
const waiverMocks = vi.hoisted(() => ({
  createPluginSecurityScanWaiver: vi.fn(),
  revokePluginSecurityScanWaiver: vi.fn(),
}))
const reviewMocks = vi.hoisted(() => ({ setPluginReviewStatus: vi.fn() }))
const retentionMocks = vi.hoisted(() => ({ runTelemetryRetention: vi.fn() }))

const h3Mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: h3Mocks.readBody,
    getQuery: h3Mocks.getQuery,
    getRouterParam: h3Mocks.getRouterParam,
  }
})

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/adminAuditStore', () => auditMocks)
vi.mock('../../../server/utils/subscriptionStore', () => subscriptionMocks)
vi.mock('../../../server/utils/docCommentsStore', () => docCommentMocks)
vi.mock('../../../server/utils/pluginSecurityScanWaiverStore', () => waiverMocks)
vi.mock('../../../server/utils/pluginReviewStore', () => reviewMocks)
vi.mock('../../../server/utils/telemetryRetentionStore', () => retentionMocks)

type Handler = (event: any) => Promise<any>

let generateCodes: Handler
let deleteDocComment: Handler
let createWaiver: Handler
let revokeWaiver: Handler
let patchReviewStatus: Handler
let runRetention: Handler

beforeAll(async () => {
  const h3 = await vi.importActual<typeof import('h3')>('h3')
  ;(globalThis as any).defineEventHandler = (fn: Handler) => fn
  ;(globalThis as any).createError = h3.createError
  ;(globalThis as any).readBody = h3Mocks.readBody
  ;(globalThis as any).getQuery = h3Mocks.getQuery
  ;(globalThis as any).getRouterParam = h3Mocks.getRouterParam

  generateCodes = (await import('../../../server/api/admin/codes/generate.post')).default as Handler
  deleteDocComment = (await import('../../../server/api/admin/doc-comments/[id].delete')).default as Handler
  createWaiver = (await import('../../../server/api/admin/plugin-scan-waivers.post')).default as Handler
  revokeWaiver = (await import('../../../server/api/admin/plugin-scan-waivers/[id].delete')).default as Handler
  patchReviewStatus = (await import('../../../server/api/admin/store/reviews/[id]/status.patch')).default as Handler
  runRetention = (await import('../../../server/api/admin/maintenance/retention.post')).default as Handler
})

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.requireAdmin.mockResolvedValue({ userId: 'admin_1', user: { role: 'admin' } })
  authMocks.requireAdminOrApiKey.mockResolvedValue({ userId: 'admin_1', authType: 'admin' })
  auditMocks.logAdminAudit.mockResolvedValue(undefined)
  h3Mocks.getQuery.mockReturnValue({})
})

describe('admin mutations record an audit entry', () => {
  it('logs activation code generation with its redeemable reach', async () => {
    h3Mocks.readBody.mockResolvedValue({ plan: 'PRO', durationDays: 30, count: 2, maxUses: 5, expiresInDays: 90 })
    let seq = 0
    subscriptionMocks.createActivationCode.mockImplementation(async () => ({ id: `code_${++seq}` }))

    await generateCodes({})

    expect(auditMocks.logAdminAudit).toHaveBeenCalledTimes(1)
    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'activation_code.generate',
      targetType: 'activation_code',
      targetLabel: 'PRO x2',
      metadata: expect.objectContaining({
        plan: 'PRO',
        count: 2,
        maxUses: 5,
        expiresInDays: 90,
        codeIds: ['code_1', 'code_2'],
      }),
    }))
  })

  it('does not log when code generation is rejected before any code exists', async () => {
    h3Mocks.readBody.mockResolvedValue({ plan: 'PRO', durationDays: 30, count: 1, maxUses: -5 })

    await expect(generateCodes({})).rejects.toMatchObject({ statusCode: 400 })
    expect(auditMocks.logAdminAudit).not.toHaveBeenCalled()
    expect(subscriptionMocks.createActivationCode).not.toHaveBeenCalled()
  })

  it('logs doc comment deletion with the comment owner', async () => {
    h3Mocks.getRouterParam.mockReturnValue('dc_23')
    docCommentMocks.getD1Database.mockReturnValue({})
    docCommentMocks.getCommentOwner.mockResolvedValue('user_7')

    await deleteDocComment({})

    expect(docCommentMocks.deleteComment).toHaveBeenCalled()
    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'doc_comment.delete',
      targetType: 'doc_comment',
      targetId: 'dc_23',
      targetLabel: 'user_7',
      metadata: { before: { ownerId: 'user_7' } },
    }))
  })

  it('does not log when the comment does not exist', async () => {
    h3Mocks.getRouterParam.mockReturnValue('missing')
    docCommentMocks.getD1Database.mockReturnValue({})
    docCommentMocks.getCommentOwner.mockResolvedValue(null)

    await expect(deleteDocComment({})).rejects.toMatchObject({ statusCode: 404 })
    expect(docCommentMocks.deleteComment).not.toHaveBeenCalled()
    expect(auditMocks.logAdminAudit).not.toHaveBeenCalled()
  })

  it('logs which scan rule a waiver silences and for which artifact', async () => {
    h3Mocks.readBody.mockResolvedValue({})
    waiverMocks.createPluginSecurityScanWaiver.mockResolvedValue({
      id: 'waiver_1',
      ruleId: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
      artifactSha256: 'a'.repeat(64),
      reason: 'vendor confirmed',
      expiresAt: '2026-09-01T00:00:00.000Z',
      ticket: 'SEC-42',
    })

    await createWaiver({})

    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'plugin_scan_waiver.create',
      targetType: 'plugin_scan_waiver',
      targetId: 'waiver_1',
      targetLabel: `PLUGIN_SCAN_DYNAMIC_EXECUTION / ${'a'.repeat(64)}`,
      metadata: expect.objectContaining({
        after: expect.objectContaining({
          ruleId: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
          artifactSha256: 'a'.repeat(64),
          ticket: 'SEC-42',
        }),
      }),
    }))
  })

  it('logs waiver revocation', async () => {
    h3Mocks.getRouterParam.mockReturnValue('waiver_1')
    waiverMocks.revokePluginSecurityScanWaiver.mockResolvedValue({
      id: 'waiver_1',
      ruleId: 'PLUGIN_SCAN_FILE_LIMIT_EXCEEDED',
      artifactSha256: 'b'.repeat(64),
      revokedAt: '2026-08-27T00:00:00.000Z',
    })

    await revokeWaiver({})

    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'plugin_scan_waiver.revoke',
      targetType: 'plugin_scan_waiver',
      targetId: 'waiver_1',
      metadata: expect.objectContaining({
        after: expect.objectContaining({ revokedAt: '2026-08-27T00:00:00.000Z' }),
      }),
    }))
  })

  it('logs a store review moderation decision', async () => {
    h3Mocks.readBody.mockResolvedValue({ status: 'approved' })
    reviewMocks.setPluginReviewStatus.mockResolvedValue({
      id: 'rev_23',
      pluginId: 'plugin_9',
      userId: 'user_3',
      rating: 4,
      status: 'approved',
    })

    await patchReviewStatus({ context: { params: { id: 'rev_23' } } })

    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'store_review.status.update',
      targetType: 'store_review',
      targetId: 'rev_23',
      targetLabel: 'plugin_9 / user_3',
      metadata: expect.objectContaining({
        after: { status: 'approved' },
        pluginId: 'plugin_9',
        reviewerUserId: 'user_3',
      }),
    }))
  })

  it('records a destructive retention sweep with the rows it actually deleted', async () => {
    h3Mocks.readBody.mockResolvedValue({ dryRun: false })
    retentionMocks.runTelemetryRetention.mockResolvedValue({
      dryRun: false,
      generatedAt: '2026-08-27T00:00:00.000Z',
      telemetryRetentionDays: 90,
      governanceRetentionDays: 180,
      batchLimit: 500,
      tables: [
        { table: 'telemetry_events', cutoff: '2026-05-29T00:00:00.000Z', matched: 120, deleted: 120 },
        { table: 'platform_governance_events', cutoff: '2026-02-28T00:00:00.000Z', matched: 8, deleted: 8 },
      ],
    })

    await runRetention({})

    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      adminUserId: 'admin_1',
      action: 'maintenance.telemetry_retention.run',
      targetType: 'telemetry_retention',
      targetLabel: 'delete 128 row(s)',
      metadata: expect.objectContaining({
        authType: 'admin',
        dryRun: false,
        deletedTotal: 128,
        telemetryRetentionDays: 90,
        batchLimit: 500,
      }),
    }))
  })

  it('distinguishes a rehearsal from a real sweep in the trail', async () => {
    h3Mocks.readBody.mockResolvedValue({})
    retentionMocks.runTelemetryRetention.mockResolvedValue({
      dryRun: true,
      generatedAt: '2026-08-27T00:00:00.000Z',
      telemetryRetentionDays: 90,
      governanceRetentionDays: 180,
      batchLimit: 500,
      tables: [{ table: 'telemetry_events', cutoff: '2026-05-29T00:00:00.000Z', matched: 120, deleted: 0 }],
    })

    await runRetention({})

    expect(auditMocks.logAdminAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      targetLabel: 'dry-run',
      metadata: expect.objectContaining({ dryRun: true, deletedTotal: 0 }),
    }))
  })
})
