import { describe, expect, it, vi } from 'vitest'
import { resolveLegacyUiStreamInput } from '../../../app/composables/api/base/v1/aigc/completion/legacy-stream-input'

describe('legacy stream input payload', () => {
  it('text + attachment 出站时拆分为 message 与 attachments', async () => {
    const payload = await resolveLegacyUiStreamInput('session_a', [
      {
        role: 'user',
        page: 0,
        content: [
          {
            page: 0,
            value: [
              { type: 'text', value: '帮我分析代码结构' },
              {
                type: 'image',
                value: 'https://cdn.example.com/a.png',
                data: 'image/png',
                name: 'a.png',
                attachmentId: 'att_image_1',
              },
            ],
          },
        ],
      },
    ])

    expect(payload.message).toBe('帮我分析代码结构')
    expect(payload.attachments).toEqual([
      {
        id: 'att_image_1',
        type: 'image',
        ref: 'https://cdn.example.com/a.png',
        name: 'a.png',
        mimeType: 'image/png',
        previewUrl: 'https://cdn.example.com/a.png',
      },
    ])
  })

  it('仅附件时允许 message 为空并透传 attachments', async () => {
    const payload = await resolveLegacyUiStreamInput('session_b', [
      {
        role: 'user',
        page: 0,
        content: [
          {
            page: 0,
            value: [
              {
                type: 'file',
                value: 'https://cdn.example.com/a.pdf',
                data: 'application/pdf',
                name: 'a.pdf',
                attachmentId: 'att_file_1',
              },
            ],
          },
        ],
      },
    ])

    expect(payload.message).toBe('')
    expect(payload.attachments).toEqual([
      {
        id: 'att_file_1',
        type: 'file',
        ref: 'https://cdn.example.com/a.pdf',
        name: 'a.pdf',
        mimeType: 'application/pdf',
        previewUrl: 'https://cdn.example.com/a.pdf',
      },
    ])
  })

  it('历史 dataURL 附件会先上传并回填 attachmentId', async () => {
    const uploadDataUrlAttachment = vi.fn().mockResolvedValue({
      id: 'att_from_dataurl',
      type: 'image',
      ref: 'https://pilot.example.com/api/chat/sessions/s1/attachments/att_from_dataurl/content?exp=1&sig=2',
      name: 'legacy.png',
      mimeType: 'image/png',
      previewUrl: 'https://pilot.example.com/api/chat/sessions/s1/attachments/att_from_dataurl/content?exp=1&sig=2',
    })

    const messages: Array<Record<string, any>> = [
      {
        role: 'user',
        page: 0,
        content: [
          {
            page: 0,
            value: [
              {
                type: 'image',
                value: 'data:image/png;base64,QUJD',
                data: 'data:image/png;base64,QUJD',
                name: 'legacy.png',
              },
            ],
          },
        ],
      },
    ]

    const payload = await resolveLegacyUiStreamInput('session_c', messages, {
      uploadDataUrlAttachment,
    })

    expect(uploadDataUrlAttachment).toHaveBeenCalledTimes(1)
    expect(uploadDataUrlAttachment).toHaveBeenCalledWith('session_c', {
      type: 'image',
      name: 'legacy.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,QUJD',
    })
    expect(payload.message).toBe('')
    expect(payload.attachments).toEqual([
      {
        id: 'att_from_dataurl',
        type: 'image',
        ref: 'https://pilot.example.com/api/chat/sessions/s1/attachments/att_from_dataurl/content?exp=1&sig=2',
        name: 'legacy.png',
        mimeType: 'image/png',
        previewUrl: 'https://pilot.example.com/api/chat/sessions/s1/attachments/att_from_dataurl/content?exp=1&sig=2',
      },
    ])

    const patched = messages[0]!.content[0]!.value[0]!
    expect(patched.attachmentId).toBe('att_from_dataurl')
    expect(patched.value).toContain('/api/chat/sessions/s1/attachments/att_from_dataurl/content')
    expect(patched.data).toBe('image/png')
  })

  it('attachmentId 存在但 value 是 dataURL 时不会直接出站 dataURL', async () => {
    const payload = await resolveLegacyUiStreamInput('session_fallback', [
      {
        role: 'user',
        page: 0,
        content: [
          {
            page: 0,
            value: [
              {
                type: 'image',
                value: 'data:image/png;base64,QUJD',
                data: 'image/png',
                name: 'old.png',
                attachmentId: 'att_image_legacy',
              },
            ],
          },
        ],
      },
    ])

    expect(payload.message).toBe('')
    expect(payload.attachments).toEqual([
      {
        id: 'att_image_legacy',
        type: 'image',
        ref: 'attachment://att_image_legacy',
        name: 'old.png',
        mimeType: 'image/png',
        previewUrl: undefined,
      },
    ])
  })

  it('非 dataURL 且无 attachmentId 的历史附件会提示重新上传', async () => {
    await expect(resolveLegacyUiStreamInput('session_d', [
      {
        role: 'user',
        page: 0,
        content: [
          {
            page: 0,
            value: [
              {
                type: 'image',
                value: 'https://legacy.example.com/old.png',
                data: 'image/png',
                name: 'old.png',
              },
            ],
          },
        ],
      },
    ])).rejects.toThrow('请重新上传后再发送')
  })
})
