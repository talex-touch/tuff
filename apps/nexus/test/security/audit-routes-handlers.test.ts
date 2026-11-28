import { Buffer } from 'node:buffer'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h3Mocks = vi.hoisted(() => ({
  getHeader: vi.fn(),
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
  readFormData: vi.fn(),
  send: vi.fn((_event: unknown, data: unknown) => ({ sent: data })),
  setHeader: vi.fn(),
  setResponseHeader: vi.fn(),
  setResponseStatus: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  requireAppAuth: vi.fn(),
  requireAuth: vi.fn(),
  requireAdmin: vi.fn(),
  requireAuthOrApiKey: vi.fn(),
  requireSessionAuth: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  consumeLoginToken: vi.fn(),
  countActiveDevices: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  readDeviceId: vi.fn((ev: any) => ev?.headers?.['x-device-id'] ?? null),
  readDeviceMetadata: vi.fn(() => ({})),
  recordDeviceAuthAudit: vi.fn(),
  revokeInactiveDevicesAndCountActive: vi.fn(),
  revokeOldestDevices: vi.fn(),
  setDeviceTrusted: vi.fn(),
  touchDevice: vi.fn(),
}))

const syncStoreMocks = vi.hoisted(() => ({
  findExistingSyncBlob: vi.fn(),
  getOrInitQuota: vi.fn(),
  getSyncBlob: vi.fn(),
  getSyncSession: vi.fn(),
  handshakeSyncSession: vi.fn(),
  reconcileSyncBlobsV1: vi.fn(),
  validateQuota: vi.fn(),
}))

const handoffMocks = vi.hoisted(() => ({
  getAsrHandoffObject: vi.fn(),
}))

const sceneMocks = vi.hoisted(() => ({
  runSceneOrchestrator: vi.fn(),
}))

const teamContextMocks = vi.hoisted(() => ({
  assertTeamCapability: vi.fn(),
  resolveActiveTeamContext: vi.fn(),
}))

const teamStoreMocks = vi.hoisted(() => ({
  createInvite: vi.fn(),
  getInviteById: vi.fn(),
  hasInviteForEmail: vi.fn(),
}))

const creditsMocks = vi.hoisted(() => ({
  getUserRoleInTeam: vi.fn(),
  isUserTeamMember: vi.fn(),
  listUserTeams: vi.fn(),
}))

const auditStoreMocks = vi.hoisted(() => ({
  listAdminAudits: vi.fn(),
  logAdminAudit: vi.fn(),
}))

const dualControlMocks = vi.hoisted(() => ({
  confirmDualControlOperation: vi.fn(),
  getDualControlOperation: vi.fn(),
  rejectDualControlOperation: vi.fn(),
}))

const controlPlaneMocks = vi.hoisted(() => ({
  requireAdminControlPlaneAuth: vi.fn(),
}))

const breakglassMocks = vi.hoisted(() => ({
  appendAdminBreakglassAudit: vi.fn(),
}))

const pluginsMocks = vi.hoisted(() => ({
  createPlugin: vi.fn(),
  deletePlugin: vi.fn(),
  publishPluginVersion: vi.fn(),
}))

const imageStorageMocks = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  uploadImageFromBuffer: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getHeader: h3Mocks.getHeader,
    getQuery: h3Mocks.getQuery,
    getRouterParam: h3Mocks.getRouterParam,
    readBody: h3Mocks.readBody,
    readFormData: h3Mocks.readFormData,
    send: h3Mocks.send,
    setHeader: h3Mocks.setHeader,
    setResponseHeader: h3Mocks.setResponseHeader,
    setResponseStatus: h3Mocks.setResponseStatus,
  }
})

vi.mock('../../server/utils/auth', () => authMocks)
vi.mock('../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../server/utils/asrTranscriptionStore', () => handoffMocks)
vi.mock('../../server/utils/sceneOrchestrator', () => sceneMocks)
vi.mock('../../server/utils/teamContext', () => teamContextMocks)
vi.mock('../../server/utils/teamStore', () => teamStoreMocks)
vi.mock('../../server/utils/creditsStore', () => creditsMocks)
vi.mock('../../server/utils/adminAuditStore', () => auditStoreMocks)
vi.mock('../../server/utils/adminDualControlStore', () => dualControlMocks)
vi.mock('../../server/utils/adminControlPlaneGuard', () => controlPlaneMocks)
vi.mock('../../server/utils/adminBreakglassAuditStore', () => breakglassMocks)
vi.mock('../../server/utils/pluginsStore', () => pluginsMocks)
vi.mock('../../server/utils/imageStorage', () => imageStorageMocks)
vi.mock('../../server/utils/syncStoreV1', () => syncStoreMocks)

type Handler = (event: any) => Promise<any>

let handoffHandler: Handler
let sceneRunHandler: Handler
let trustDeviceHandler: Handler
let teamInvitesHandler: Handler
let acceptInviteHandler: Handler
let auditExportHandler: Handler
let dualControlConfirmHandler: Handler
let createPluginHandler: Handler
let syncPrepareHandler: Handler
let syncDownloadHandler: Handler
let syncHandshakeHandler: Handler
let quotasIndexHandler: Handler
let quotasValidateHandler: Handler

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getQuery', h3Mocks.getQuery)
  vi.stubGlobal('getRouterParam', h3Mocks.getRouterParam)
  vi.stubGlobal('readBody', h3Mocks.readBody)

  handoffHandler = (await import('../../server/api/v1/ai/audio/handoff/[requestId].get')).default as Handler
  sceneRunHandler = (await import('../../server/api/v1/scenes/[id]/run.post')).default as Handler
  trustDeviceHandler = (await import('../../server/api/devices/trust.post')).default as Handler
  teamInvitesHandler = (await import('../../server/api/dashboard/team/invites.post')).default as Handler
  acceptInviteHandler = (await import('../../server/api/team/invitations/[id]/accept.post')).default as Handler
  auditExportHandler = (await import('../../server/api/admin/audits/export.get')).default as Handler
  dualControlConfirmHandler = (await import('../../server/api/admin/risk/dual-control/confirm.post')).default as Handler
  createPluginHandler = (await import('../../server/api/dashboard/plugins.post')).default as Handler
  syncPrepareHandler = (await import('../../server/api/v1/sync/blobs/prepare.post')).default as Handler
  syncDownloadHandler = (await import('../../server/api/v1/sync/blobs/[blob_id]/download.get')).default as Handler
  syncHandshakeHandler = (await import('../../server/api/v1/sync/handshake.post')).default as Handler
  quotasIndexHandler = (await import('../../server/api/v1/quotas/index.get')).default as Handler
  quotasValidateHandler = (await import('../../server/api/v1/quotas/validate.post')).default as Handler
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('audit regressions: route handlers (#2, #5, #12, #13, #16, #20, #24)', () => {
  it('#5: GET /api/v1/ai/audio/handoff/:requestId sends binary audio body via send()', async () => {
    const wav = Buffer.from('RIFF....WAVE')
    h3Mocks.getRouterParam.mockReturnValue('req-1')
    h3Mocks.getQuery.mockReturnValue({ token: 't'.repeat(32) })
    handoffMocks.getAsrHandoffObject.mockResolvedValue({
      data: wav,
      contentType: 'audio/wav',
      byteSize: wav.byteLength,
    })

    const res = await handoffHandler({ context: {} })
    expect(h3Mocks.send).toHaveBeenCalledWith(expect.anything(), wav)
    expect(res).toEqual({ sent: wav })
  })

  it('#2: POST /api/devices/trust requires web session auth and passkey step-up token', async () => {
    authMocks.requireSessionAuth.mockResolvedValue({ userId: 'user-1' })
    h3Mocks.getHeader.mockReturnValue(undefined)
    h3Mocks.readBody.mockResolvedValue({ deviceId: 'dev-1', trusted: true })

    await expect(trustDeviceHandler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(authStoreMocks.setDeviceTrusted).not.toHaveBeenCalled()

    // With valid passkey step-up token belonging to user-1, succeeds.
    h3Mocks.getHeader.mockReturnValue('step-up-tok')
    authStoreMocks.consumeLoginToken.mockResolvedValue({ id: 'user-1' })
    authStoreMocks.setDeviceTrusted.mockResolvedValue({ id: 'dev-1', isTrusted: true })

    const ok = await trustDeviceHandler({})
    expect(authStoreMocks.consumeLoginToken).toHaveBeenCalledWith(expect.anything(), 'step-up-tok', 'passkey')
    expect(authStoreMocks.setDeviceTrusted).toHaveBeenCalledWith(expect.anything(), 'user-1', 'dev-1', true)
    expect(ok).toEqual({ id: 'dev-1', isTrusted: true })
  })

  it('#2: sync/blobs/prepare, sync/blobs/download, sync/handshake, quotas, and quotas/validate reject unbound tokens and spoofed x-device-id', async () => {
    const boundRoutes: Array<[string, Handler]> = [
      ['sync/blobs/prepare', syncPrepareHandler],
      ['sync/blobs/download', syncDownloadHandler],
      ['sync/handshake', syncHandshakeHandler],
      ['quotas/index', quotasIndexHandler],
      ['quotas/validate', quotasValidateHandler],
    ]

    for (const [label, handler] of boundRoutes) {
      // Unbound app token (deviceId: null) must be refused 403 even if x-device-id is supplied.
      authMocks.requireAppAuth.mockResolvedValueOnce({ userId: 'user-1', deviceId: null })
      await expect(handler({ headers: { 'x-device-id': 'dev-spoof' } }), `${label} unbound`).rejects.toMatchObject({
        statusCode: 403,
      })

      // Mismatched x-device-id header must be refused 403.
      authMocks.requireAppAuth.mockResolvedValueOnce({ userId: 'user-1', deviceId: 'dev-bound' })
      await expect(handler({ headers: { 'x-device-id': 'dev-other' } }), `${label} mismatch`).rejects.toMatchObject({
        statusCode: 403,
      })
    }

    expect(syncStoreMocks.getSyncSession).not.toHaveBeenCalled()
    expect(syncStoreMocks.getOrInitQuota).not.toHaveBeenCalled()
    expect(syncStoreMocks.validateQuota).not.toHaveBeenCalled()
    expect(authStoreMocks.touchDevice).not.toHaveBeenCalled()
  })

  it('#12: POST /api/v1/scenes/:id/run strips internal endpoint, authRef, region, candidates, fallbackTrail & trace for non-admins', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'user-1', user: { role: 'user', status: 'active' } })
    h3Mocks.getRouterParam.mockReturnValue('scene.public')
    h3Mocks.readBody.mockResolvedValue({ input: { text: 'hi' } })
    sceneMocks.runSceneOrchestrator.mockResolvedValue({
      runId: 'run-1',
      sceneId: 'scene.public',
      status: 'completed',
      mode: 'execute',
      strategyMode: 'priority',
      requestedCapabilities: ['text.translate'],
      selected: [
        {
          providerId: 'prv-1',
          providerName: 'Internal',
          vendor: 'openai',
          capability: 'text.translate',
          priority: 1,
          weight: 100,
          model: 'gpt-4o-mini',
          bindingId: 'b1',
          authRef: 'secret-cred-ref-123',
          endpoint: 'http://10.0.0.5:8080/internal',
          region: 'cn-internal',
        },
      ],
      candidates: [{ providerId: 'prv-1' }],
      fallbackTrail: [{ providerId: 'prv-1', capability: 'text.translate', status: 'selected' }],
      trace: [{ phase: 'adapter.dispatch', status: 'success', at: '2026-01-01', message: 'internal' }],
      usage: [],
      output: { translatedText: '你好' },
    })

    const result = await sceneRunHandler({})
    expect(result.run.selected[0]).toMatchObject({
      providerId: 'prv-1',
      authRef: null,
      endpoint: null,
      region: null,
    })
    expect(result.run.candidates).toEqual([])
    expect(result.run.fallbackTrail).toEqual([])
    expect(result.run.trace).toEqual([])
    expect(JSON.stringify(result)).not.toContain('secret-cred-ref-123')
    expect(JSON.stringify(result)).not.toContain('10.0.0.5')
  })

  it('#13: team invites hide target user email when invited by userId, and accept rejects unverified email', async () => {
    authMocks.requireAuth.mockResolvedValue({ userId: 'admin-1' })
    teamContextMocks.resolveActiveTeamContext.mockResolvedValue({ team: { id: 'org-1' } })
    teamContextMocks.assertTeamCapability.mockReturnValue(undefined)
    h3Mocks.readBody.mockResolvedValue({ target: 'target-user-id', role: 'member', expiresInDays: 7 })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'target-user-id', email: 'private-pii@example.com', status: 'active' })
    creditsMocks.isUserTeamMember.mockResolvedValue(false)
    creditsMocks.listUserTeams.mockResolvedValue([])
    teamStoreMocks.hasInviteForEmail.mockResolvedValue(false)
    teamStoreMocks.createInvite.mockResolvedValue({
      id: 'inv-1',
      email: 'private-pii@example.com',
      role: 'member',
      status: 'pending',
      expiresAt: '2026-12-31T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const created = await teamInvitesHandler({})
    expect(created.invite.email).toBeNull()
    expect(JSON.stringify(created)).not.toContain('private-pii@example.com')

    // Unverified user cannot accept an invitation.
    authMocks.requireAuth.mockResolvedValue({
      userId: 'target-user-id',
      user: { id: 'target-user-id', email: 'private-pii@example.com', emailState: 'unverified' },
    })
    h3Mocks.getRouterParam.mockReturnValue('inv-1')
    teamStoreMocks.getInviteById.mockResolvedValue({ id: 'inv-1', email: 'private-pii@example.com' })

    await expect(acceptInviteHandler({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('#16: dual-control confirm refuses unattributed OOB submissions and same-admin self-confirmation', async () => {
    h3Mocks.readBody.mockResolvedValue({ operation_id: 'op-1', decision: 'confirm' })
    controlPlaneMocks.requireAdminControlPlaneAuth.mockResolvedValue({
      adminId: 'admin-1',
      actorId: 'A:admin-1:hash',
      channel: 'A',
      scope: [],
      restricted: false,
    })

    // Unattributed operation (submitterAdminId === null) -> refused 403.
    dualControlMocks.getDualControlOperation.mockResolvedValueOnce({
      id: 'op-1',
      status: 'pending',
      action: 'risk.mode.override',
      scope: 'risk.mode.override',
      submitterActorId: 'oob:abc',
      submitterAdminId: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    await expect(dualControlConfirmHandler({})).rejects.toMatchObject({ statusCode: 403 })

    // Same admin across different channel (C -> A) -> refused 403.
    dualControlMocks.getDualControlOperation.mockResolvedValueOnce({
      id: 'op-1',
      status: 'pending',
      action: 'risk.mode.override',
      scope: 'risk.mode.override',
      submitterActorId: 'oob:abc',
      submitterAdminId: 'admin-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    await expect(dualControlConfirmHandler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(dualControlMocks.confirmDualControlOperation).not.toHaveBeenCalled()
  })

  it('#20: CSV audit export neutralizes spreadsheet formula injection prefixes', async () => {
    authMocks.requireAdmin.mockResolvedValue({ userId: 'admin-1', user: { email: 'admin@example.com' } })
    h3Mocks.getQuery.mockReturnValue({})
    auditStoreMocks.listAdminAudits.mockResolvedValue({
      audits: [
        {
          createdAt: '2026-10-01T00:00:00.000Z',
          adminUserId: 'admin-1',
          adminName: '=CMD|"/C calc"!A0',
          adminEmail: '+1+2@example.com',
          action: 'user.update',
          targetType: 'user',
          targetId: '-123',
          targetLabel: '@SUM(A1:A2)',
          ip: '203.0.113.1',
          userAgent: '  =HYPERLINK("http://evil")',
          metadata: null,
        },
      ],
    })
    auditStoreMocks.logAdminAudit.mockResolvedValue(undefined)

    const csv = await auditExportHandler({})
    const dataLine = String(csv).split('\n')[1] ?? ''
    expect(dataLine).toContain(`"'=CMD|""/C calc""!A0"`)
    expect(dataLine).toContain(`'+1+2@example.com`)
    expect(dataLine).toContain(`'-123`)
    expect(dataLine).toContain(`'@SUM(A1:A2)`)
    expect(dataLine).toContain(`"'  =HYPERLINK(""http://evil"")"`)
  })

  it('#24: POST /api/dashboard/plugins redacts raw internal error messages on HTTP 500', async () => {
    authMocks.requireAuthOrApiKey.mockResolvedValue({ userId: 'dev-1' })
    authStoreMocks.getUserById.mockResolvedValue({ id: 'dev-1', role: 'user', name: 'Dev' })
    const form = new FormData()
    form.set('slug', 'my-plugin')
    form.set('name', 'My Plugin')
    form.set('summary', 'Summary')
    form.set('category', 'tools')
    form.set('icon', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'icon.png', { type: 'image/png' }))
    h3Mocks.readFormData.mockResolvedValue(form)
    imageStorageMocks.uploadImage.mockResolvedValue({ key: 'icon.png', url: '/api/images/icon.png' })
    pluginsMocks.createPlugin.mockRejectedValue(new Error('D1_ERROR: SQLITE_CONSTRAINT internal table auth_secrets'))

    await expect(createPluginHandler({})).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to create plugin.',
    })
  })
})
