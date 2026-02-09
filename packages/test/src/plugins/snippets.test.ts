import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const codePlugin = loadPluginModule(new URL('../../../../plugins/touch-code-snippets/index.js', import.meta.url))
const textPlugin = loadPluginModule(new URL('../../../../plugins/touch-text-snippets/index.js', import.meta.url))
const { __test: codeTest } = codePlugin
const { __test: textTest } = textPlugin

describe('code snippets', () => {
  it('replaces placeholders', () => {
    const now = new Date(2025, 0, 2, 3, 4, 5)
    const text = codeTest.applyPlaceholders('date={{date}} time={{time}} clip={{clipboard}}', {
      now,
      clipboardText: 'CLIP',
    })

    expect(text).toContain('date=2025-01-02')
    expect(text).toContain('time=03:04:05')
    expect(text).toContain('clip=CLIP')
  })

  it('matches snippet by tag or title', () => {
    const snippet = {
      title: 'React useEffect 模板',
      tags: ['react', 'hook'],
      language: 'ts',
      content: 'useEffect(() => {})',
    }

    expect(codeTest.matchSnippet(snippet, 'react')).toBe(true)
    expect(codeTest.matchSnippet(snippet, 'hook')).toBe(true)
    expect(codeTest.matchSnippet(snippet, 'vue')).toBe(false)
  })

  it('matches text snippet content', () => {
    const snippet = {
      title: '邮件模板',
      tags: ['邮件'],
      content: '你好，今天的进度如下',
    }

    expect(textTest.matchSnippet(snippet, '邮件')).toBe(true)
    expect(textTest.matchSnippet(snippet, '进度')).toBe(true)
    expect(textTest.matchSnippet(snippet, '无关')).toBe(false)
  })
})
