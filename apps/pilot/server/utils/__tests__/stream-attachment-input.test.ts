import { describe, expect, it } from 'vitest'
import { normalizeStreamInputAttachments } from '../pilot-stream-attachment-input'

describe('stream attachment input normalization', () => {
  it('accepts structured attachment array and keeps id-first payload', () => {
    const normalized = normalizeStreamInputAttachments([
      {
        id: 'att_image_1',
        type: 'image',
        ref: 'https://cdn.example.com/a.png',
        name: 'a.png',
        mimeType: 'image/png',
        previewUrl: 'https://cdn.example.com/a.png',
      },
      {
        id: 'att_file_1',
        type: 'file',
      },
    ])

    expect(normalized).toEqual([
      {
        id: 'att_image_1',
        type: 'image',
        ref: 'https://cdn.example.com/a.png',
        name: 'a.png',
        mimeType: 'image/png',
        previewUrl: 'https://cdn.example.com/a.png',
      },
      {
        id: 'att_file_1',
        type: 'file',
        ref: 'attachment://att_file_1',
        name: undefined,
        mimeType: undefined,
        previewUrl: undefined,
      },
    ])
  })

  it('rejects attachment without id', () => {
    expect(() => normalizeStreamInputAttachments([
      {
        type: 'image',
        ref: 'https://cdn.example.com/a.png',
      },
    ])).toThrow('attachments[0].id is required')
  })

  it('rejects inline data url payload', () => {
    expect(() => normalizeStreamInputAttachments([
      {
        id: 'att_inline',
        type: 'image',
        ref: 'data:image/png;base64,QUJD',
      },
    ])).toThrow('data URL is not allowed')
  })
})
