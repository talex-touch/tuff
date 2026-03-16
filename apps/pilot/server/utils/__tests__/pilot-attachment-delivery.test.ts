import { describe, expect, it } from 'vitest'
import {
  PilotAttachmentDeliveryError,
  resolvePilotAttachmentDeliveries,
  resolvePilotAttachmentDeliveriesOrThrow,
} from '../pilot-attachment-delivery'

describe('pilot-attachment-delivery', () => {
  it('uses id > url > base64 priority', async () => {
    const result = await resolvePilotAttachmentDeliveries([
      {
        id: 'att-id',
        type: 'file',
        ref: 'memory://a',
        providerFileId: 'file-123',
        modelUrl: 'https://cdn.example.com/a.pdf',
        dataUrl: 'data:application/pdf;base64,QUJD',
      },
      {
        id: 'att-url',
        type: 'file',
        ref: 'memory://b',
        modelUrl: 'https://cdn.example.com/b.pdf',
        dataUrl: 'data:application/pdf;base64,REVG',
      },
      {
        id: 'att-base64',
        type: 'image',
        ref: 'memory://c',
        dataUrl: 'data:image/png;base64,AA==',
      },
    ])

    expect(result.attachments).toHaveLength(3)
    expect(result.attachments[0]).toMatchObject({
      id: 'att-id',
      providerFileId: 'file-123',
      deliverySource: 'id',
    })
    expect(result.attachments[1]).toMatchObject({
      id: 'att-url',
      modelUrl: 'https://cdn.example.com/b.pdf',
      deliverySource: 'url',
    })
    expect(result.attachments[2]).toMatchObject({
      id: 'att-base64',
      deliverySource: 'base64',
    })
    expect(result.summary.idCount).toBe(1)
    expect(result.summary.urlCount).toBe(1)
    expect(result.summary.base64Count).toBe(1)
  })

  it('filters private/non-https url and falls back to loadObject inline', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    const result = await resolvePilotAttachmentDeliveries([
      {
        id: 'att-fallback',
        type: 'file',
        ref: 'http://127.0.0.1/internal/file.pdf',
        modelUrl: 'http://127.0.0.1/internal/file.pdf',
        loadObject: async () => ({
          bytes,
          mimeType: 'application/pdf',
          size: bytes.byteLength,
        }),
      },
    ])

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({
      id: 'att-fallback',
      deliverySource: 'base64',
    })
    expect(result.summary.urlCount).toBe(0)
    expect(result.summary.base64Count).toBe(1)
    expect(result.summary.loadedObjectCount).toBe(1)
  })

  it('throws ATTACHMENT_TOO_LARGE_FOR_INLINE when only fallback is oversized base64', async () => {
    await expect(resolvePilotAttachmentDeliveriesOrThrow([
      {
        id: 'att-large',
        type: 'file',
        ref: 'memory://large',
        loadObject: async () => ({
          bytes: new Uint8Array(1024 * 1024),
          mimeType: 'application/pdf',
          size: 1024 * 1024,
        }),
      },
    ], {
      inlineFileMaxBytes: 128,
      inlineFileTotalMaxBytes: 128,
    })).rejects.toMatchObject({
      name: 'PilotAttachmentDeliveryError',
      code: 'ATTACHMENT_TOO_LARGE_FOR_INLINE',
    })
  })

  it('throws ATTACHMENT_UNREACHABLE when no id/url/base64 is available', async () => {
    try {
      await resolvePilotAttachmentDeliveriesOrThrow([
        {
          id: 'att-empty',
          type: 'image',
          ref: 'memory://none',
        },
      ])
      throw new Error('expected throw')
    }
    catch (error) {
      expect(error).toBeInstanceOf(PilotAttachmentDeliveryError)
      expect((error as PilotAttachmentDeliveryError).code).toBe('ATTACHMENT_UNREACHABLE')
    }
  })
})
