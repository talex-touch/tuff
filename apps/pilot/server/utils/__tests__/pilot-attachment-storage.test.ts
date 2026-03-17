import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPilotAttachmentPreviewUrl,
  buildPilotAttachmentSignedPreviewUrl,
  createPilotAttachmentRef,
  deletePilotAttachmentObject,
  getPilotAttachmentObject,
  getPilotAttachmentUploadAvailability,
  parsePilotAttachmentRef,
  putPilotAttachmentObject,
  resolvePilotAttachmentModelUrl,
  verifyPilotAttachmentSignedAccess,
} from '../pilot-attachment-storage'

let mockAdminStorageSettings: Record<string, unknown> = {}

vi.mock('../pilot-admin-storage-config', () => ({
  getPilotAdminStorageSettings: vi.fn(async () => mockAdminStorageSettings),
}))

function createEvent(): H3Event {
  return {
    context: {},
  } as unknown as H3Event
}

afterEach(() => {
  mockAdminStorageSettings = {}
  delete process.env.PILOT_COOKIE_SECRET
  delete process.env.PILOT_ATTACHMENT_PROVIDER
  delete process.env.PILOT_ATTACHMENT_PUBLIC_BASE_URL
  delete process.env.PILOT_ATTACHMENT_SIGNING_SECRET
  delete process.env.PILOT_MINIO_ENDPOINT
  delete process.env.PILOT_MINIO_BUCKET
  delete process.env.PILOT_MINIO_ACCESS_KEY
  delete process.env.PILOT_MINIO_SECRET_KEY
  delete process.env.PILOT_MINIO_REGION
  delete process.env.PILOT_MINIO_FORCE_PATH_STYLE
  delete process.env.PILOT_MINIO_PUBLIC_BASE_URL
})

describe('pilot-attachment-storage', () => {
  it('supports ref create and parse', () => {
    const ref = createPilotAttachmentRef('memory', 'pilot/u/s/a/file.png')
    expect(ref).toBe('memory://pilot/u/s/a/file.png')
    expect(parsePilotAttachmentRef(ref)).toEqual({
      provider: 'memory',
      key: 'pilot/u/s/a/file.png',
    })

    expect(parsePilotAttachmentRef('s3://pilot/u/s/a/file.png')).toEqual({
      provider: 's3',
      key: 'pilot/u/s/a/file.png',
    })
  })

  it('writes and reads attachment object in memory fallback', async () => {
    const event = createEvent()
    const data = new TextEncoder().encode('hello pilot')

    const saved = await putPilotAttachmentObject(event, {
      key: 'pilot/test/session/att/file.txt',
      bytes: data,
      mimeType: 'text/plain',
    })

    expect(saved.provider).toBe('memory')
    expect(saved.ref).toBe('memory://pilot/test/session/att/file.txt')

    const loaded = await getPilotAttachmentObject(event, saved.ref)
    expect(loaded).toBeTruthy()
    expect(loaded?.mimeType).toBe('text/plain')
    expect(new TextDecoder().decode(loaded?.bytes || new Uint8Array())).toBe('hello pilot')

    await deletePilotAttachmentObject(event, saved.ref)
    const afterDelete = await getPilotAttachmentObject(event, saved.ref)
    expect(afterDelete).toBeNull()
  })

  it('builds preview url by session and attachment id', () => {
    const preview = buildPilotAttachmentPreviewUrl('session-123', 'att-456')
    expect(preview).toBe('/api/chat/sessions/session-123/attachments/att-456/content')
  })

  it('builds model url from minio public base when s3 ref is used', async () => {
    const event = createEvent()
    mockAdminStorageSettings = {
      minioEndpoint: 'https://minio.local',
      minioBucket: 'pilot-attachments',
      minioAccessKey: 'access',
      minioSecretKey: 'secret',
      minioPublicBaseUrl: 'https://cdn.example.com/pilot-attachments',
    }

    const url = await resolvePilotAttachmentModelUrl(event, {
      sessionId: 'session-123',
      attachmentId: 'att-456',
      ref: 's3://pilot/u/s/att-456/image.png',
    })
    expect(url).toBe('https://cdn.example.com/pilot-attachments/pilot/u/s/att-456/image.png')
  })

  it('builds signed preview url when base url is configured', async () => {
    const event = createEvent()
    mockAdminStorageSettings = {
      attachmentPublicBaseUrl: 'https://pilot.example.com',
    }
    process.env.PILOT_COOKIE_SECRET = 'unit-test-secret'

    const url = await buildPilotAttachmentSignedPreviewUrl(event, 'session-123', 'att-456')
    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://pilot.example.com/api/chat/sessions/session-123/attachments/att-456/content')
    const expiresAt = Number(parsed.searchParams.get('exp') || 0)
    const signature = String(parsed.searchParams.get('sig') || '')
    expect(verifyPilotAttachmentSignedAccess(event, {
      sessionId: 'session-123',
      attachmentId: 'att-456',
      expiresAt,
      signature,
    })).toBe(true)
  })

  it('falls back to memory upload when no storage config is provided', async () => {
    const event = createEvent()
    const availability = await getPilotAttachmentUploadAvailability(event)
    expect(availability.allowed).toBe(true)
    expect(availability.provider).toBe('memory')
  })

  it('enables attachment upload when minio config exists', async () => {
    const event = createEvent()
    mockAdminStorageSettings = {
      attachmentProvider: 's3',
      minioEndpoint: 'https://minio.local',
      minioBucket: 'pilot-attachments',
      minioAccessKey: 'access',
      minioSecretKey: 'secret',
    }
    const availability = await getPilotAttachmentUploadAvailability(event)
    expect(availability.allowed).toBe(true)
    expect(availability.hasS3Config).toBe(true)
  })

  it('falls back to memory when provider is s3 but config is incomplete', async () => {
    const event = createEvent()
    mockAdminStorageSettings = {
      attachmentProvider: 's3',
      minioEndpoint: '',
      minioBucket: '',
    }

    const availability = await getPilotAttachmentUploadAvailability(event)
    expect(availability.allowed).toBe(true)
    expect(availability.provider).toBe('memory')
    expect(availability.hasS3Config).toBe(false)
  })

  it('enables attachment upload when minio config is provided by env', async () => {
    const event = createEvent()
    process.env.PILOT_ATTACHMENT_PROVIDER = 's3'
    process.env.PILOT_MINIO_ENDPOINT = 'https://minio.env.local'
    process.env.PILOT_MINIO_BUCKET = 'pilot-attachments'
    process.env.PILOT_MINIO_ACCESS_KEY = 'env-access'
    process.env.PILOT_MINIO_SECRET_KEY = 'env-secret'

    const availability = await getPilotAttachmentUploadAvailability(event)
    expect(availability.allowed).toBe(true)
    expect(availability.provider).toBe('s3')
    expect(availability.hasS3Config).toBe(true)
  })
})
