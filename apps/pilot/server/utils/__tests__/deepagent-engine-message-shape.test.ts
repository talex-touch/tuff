import { describe, expect, it } from 'vitest'
import {
  buildChatMessageContent,
  buildResponsesInput,
  resolveAttachmentImageUrl,
} from '../../../../../packages/tuff-intelligence/src/adapters/deepagent-engine'

function createBaseState() {
  return {
    sessionId: 'session-test',
    turnId: 'turn-test',
    done: false,
    seq: 0,
    events: [],
  }
}

describe('deepagent message shape', () => {
  it('text + image 保持同一条 user message 的多模态 content', () => {
    const state = {
      ...createBaseState(),
      messages: [
        { role: 'user', content: '这是什么' },
      ],
      attachments: [
        {
          id: 'att-image',
          type: 'image',
          ref: 'https://cdn.example.com/image.png',
        },
      ],
    } as any

    const input = buildResponsesInput(state)
    expect(input).toHaveLength(1)
    expect(input[0]).toMatchObject({ role: 'user' })
    expect(input[0].content).toEqual([
      { type: 'input_text', text: '这是什么' },
      { type: 'input_image', image_url: 'https://cdn.example.com/image.png' },
    ])
  })

  it('仅图片时仍生成可消费文本块并附带 input_image', () => {
    const state = {
      ...createBaseState(),
      messages: [
        { role: 'user', content: '' },
      ],
      attachments: [
        {
          id: 'att-image-only',
          type: 'image',
          ref: 'https://cdn.example.com/image-only.png',
        },
      ],
    } as any

    const input = buildResponsesInput(state)
    expect(input).toHaveLength(1)
    const content = input[0].content as Array<Record<string, unknown>>
    expect(content[0]).toEqual({
      type: 'input_text',
      text: 'Please analyze the provided attachments.',
    })
    expect(content[1]).toEqual({
      type: 'input_image',
      image_url: 'https://cdn.example.com/image-only.png',
    })
  })

  it('附件只挂载到最后一个 user turn，不会额外新增 user message', () => {
    const state = {
      ...createBaseState(),
      messages: [
        { role: 'user', content: '第一轮问题' },
        { role: 'assistant', content: '第一轮回答' },
        { role: 'user', content: '第二轮问题' },
      ],
      attachments: [
        {
          id: 'att-last-turn',
          type: 'image',
          ref: 'https://cdn.example.com/turn2.png',
        },
      ],
    } as any

    const input = buildResponsesInput(state)
    expect(input).toHaveLength(3)

    const rowsWithImage = input.filter((row) => {
      const content = Array.isArray(row.content) ? row.content : []
      return content.some(item => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'input_image')
    })

    expect(rowsWithImage).toHaveLength(1)
    expect(rowsWithImage[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'input_text', text: '第二轮问题' },
        { type: 'input_image', image_url: 'https://cdn.example.com/turn2.png' },
      ],
    })
  })

  it('非图片附件会生成 input_file 块（使用 base64 file_data）', () => {
    const state = {
      ...createBaseState(),
      messages: [
        { role: 'user', content: '请阅读附件' },
      ],
      attachments: [
        {
          id: 'att-file',
          type: 'file',
          ref: 'memory://pilot/file.docx',
          name: 'file.docx',
          dataUrl: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,QUJDREVGRw==',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 7,
        },
      ],
    } as any

    const input = buildResponsesInput(state)
    expect(input).toHaveLength(1)
    const content = input[0].content as Array<Record<string, unknown>>
    const inputFile = content.find(item => item.type === 'input_file')
    expect(inputFile).toEqual({
      type: 'input_file',
      file_data: 'QUJDREVGRw==',
      filename: 'file.docx',
    })
  })

  it('buildChatMessageContent 可按开关附带 input_file', () => {
    const attachments = [
      {
        id: 'att-file-toggle',
        type: 'file',
        ref: 'memory://pilot/file.pdf',
        name: 'file.pdf',
        dataUrl: 'data:application/pdf;base64,QUJD',
        mimeType: 'application/pdf',
        size: 3,
      },
    ] as any

    const withFile = buildChatMessageContent('分析附件', attachments)
    expect(withFile).toEqual([
      {
        type: 'text',
        text: '分析附件\n\n[Attachment metadata]\n1. file.pdf (application/pdf, 3 B)',
      },
      {
        type: 'input_file',
        file_data: 'QUJD',
        filename: 'file.pdf',
      },
    ])

    const withoutFile = buildChatMessageContent('分析附件', attachments, { includeInputFiles: false })
    expect(withoutFile).toBe('分析附件\n\n[Attachment metadata]\n1. file.pdf (application/pdf, 3 B)')
  })

  it('图片 URL 选择优先级为 dataUrl > previewUrl > ref', () => {
    expect(resolveAttachmentImageUrl({
      id: 'att-priority-1',
      type: 'image',
      ref: 'https://cdn.example.com/ref.png',
      previewUrl: 'https://cdn.example.com/preview.png',
      dataUrl: 'data:image/png;base64,AAAA',
    })).toBe('data:image/png;base64,AAAA')

    expect(resolveAttachmentImageUrl({
      id: 'att-priority-2',
      type: 'image',
      ref: 'https://cdn.example.com/ref.png',
      previewUrl: 'https://cdn.example.com/preview.png',
    })).toBe('https://cdn.example.com/preview.png')

    expect(resolveAttachmentImageUrl({
      id: 'att-priority-3',
      type: 'image',
      ref: 'https://cdn.example.com/ref.png',
    })).toBe('https://cdn.example.com/ref.png')
  })
})
