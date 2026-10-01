import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

interface UserFixture {
  id: string
  email: string
  status: 'active' | 'merged' | 'disabled' | 'deletion_pending'
}

const fixture = vi.hoisted(() => ({
  body: {} as unknown,
  users: new Map<string, UserFixture>(),
}))

const authMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  getUserById: vi.fn(async (_event: unknown, userId: string) => fixture.users.get(userId) ?? null),
}))

const privacyMocks = vi.hoisted(() => ({
  requestAccountDeletionWithCleanup: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({
  logAdminAudit: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    readBody: vi.fn(async () => fixture.body),
  }
})

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../server/utils/adminAuditStore', () => auditMocks)
vi.mock('../../../server/utils/privacyDataStore', () => ({
  ACCOUNT_DELETION_TERMS_VERSION: '2026-06-22',
  requestAccountDeletionWithCleanup: privacyMocks.requestAccountDeletionWithCleanup,
}))

type Handler = (event: { context: { params?: { id?: string } } }) => Promise<unknown>

let handler: Handler

function createUser(overrides: Partial<UserFixture> = {}): UserFixture {
  return {
    id: 'target-1',
    email: 'target.user@example.com',
    status: 'active',
    ...overrides,
  }
}

function createEvent(id = 'target-1') {
  return { context: { params: { id } } }
}

function snapshotUsers() {
  return [...fixture.users.entries()].map(([id, user]) => [id, { ...user }] as const)
}

function expectNoDeletionMutation(before: ReturnType<typeof snapshotUsers>) {
  expect(snapshotUsers()).toEqual(before)
  expect(privacyMocks.requestAccountDeletionWithCleanup).not.toHaveBeenCalled()
  expect(auditMocks.logAdminAudit).not.toHaveBeenCalled()
}

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (callback: Handler) => callback)
  handler = (await import('../../../server/api/admin/users/[id]/deletion.post')).default as Handler
})

afterAll(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  fixture.users.clear()
  fixture.users.set('admin-1', createUser({
    id: 'admin-1',
    email: 'admin@example.com',
  }))
  fixture.users.set('target-1', createUser())
  fixture.body = { confirmEmail: 'target.user@example.com' }
  authMocks.requireAdmin.mockResolvedValue({
    userId: 'admin-1',
    user: { id: 'admin-1', role: 'admin', status: 'active' },
  })
  privacyMocks.requestAccountDeletionWithCleanup.mockRejectedValue(
    new Error('Deletion cleanup must remain unreachable in rejection-path tests.'),
  )
})

describe('POST /api/admin/users/[id]/deletion rejection boundaries', () => {
  it('rejects self-deletion with 400 and leaves the account unchanged', async () => {
    const before = snapshotUsers()
    fixture.body = { confirmEmail: 'admin@example.com' }

    await expect(handler(createEvent('admin-1'))).rejects.toMatchObject({
      statusCode: 400,
    })
    expectNoDeletionMutation(before)
  })

  it('returns 404 for an unknown target without changing another user', async () => {
    const before = snapshotUsers()

    await expect(handler(createEvent('missing-user'))).rejects.toMatchObject({
      statusCode: 404,
    })
    expectNoDeletionMutation(before)
  })

  it.each([
    ['merged'],
    ['deletion_pending'],
    ['disabled'],
  ] as const)('rejects a %s target with 409 and leaves it unchanged', async (status) => {
    fixture.users.set('target-1', createUser({ status }))
    const before = snapshotUsers()

    await expect(handler(createEvent())).rejects.toMatchObject({
      statusCode: 409,
    })
    expectNoDeletionMutation(before)
  })

  it.each([
    ['missing body', undefined],
    ['missing field', {}],
    ['null', { confirmEmail: null }],
    ['number', { confirmEmail: 123 }],
    ['array', { confirmEmail: ['target.user@example.com'] }],
    ['object with a deceptive trim method', { confirmEmail: { trim: () => 'target.user@example.com' } }],
    ['partial email', { confirmEmail: 'target.user' }],
    ['different full email', { confirmEmail: 'other@example.com' }],
  ])('returns 400 for %s confirmation and does not begin cleanup', async (_label, body) => {
    const before = snapshotUsers()
    fixture.body = body

    await expect(handler(createEvent())).rejects.toMatchObject({
      statusCode: 400,
    })
    expectNoDeletionMutation(before)
  })
})
