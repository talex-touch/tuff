import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const snippetsUrl = new URL('../../../../plugins/touch-snippets/index.js', import.meta.url)
const snippetsPlugin = loadPluginModule(snippetsUrl)
const { __test: snippetsTest } = snippetsPlugin

class FakeBuilder {
  item: Record<string, unknown>

  constructor(id: string) {
    this.item = { id }
  }

  setSource() {
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon() {
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  build() {
    return this.item
  }
}

describe('code snippets', () => {
  it('replaces placeholders', () => {
    const now = new Date(2025, 0, 2, 3, 4, 5)
    const text = snippetsTest.applyPlaceholders('date={{date}} time={{time}} clip={{clipboard}}', {
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

    expect(snippetsTest.matchSnippet(snippet, 'react')).toBe(true)
    expect(snippetsTest.matchSnippet(snippet, 'hook')).toBe(true)
    expect(snippetsTest.matchSnippet(snippet, 'vue')).toBe(false)
  })

  it('matches text snippet content', () => {
    const snippet = {
      title: '邮件模板',
      tags: ['邮件'],
      content: '你好，今天的进度如下',
    }

    expect(snippetsTest.matchSnippet(snippet, '邮件')).toBe(true)
    expect(snippetsTest.matchSnippet(snippet, '进度')).toBe(true)
    expect(snippetsTest.matchSnippet(snippet, '无关')).toBe(false)
  })

  it('blocks snippet copy when clipboard.write permission is denied', async () => {
    const writeText = vi.fn()
    const request = vi.fn(async () => false)
    const storageSetFile = vi.fn()
    const pluginModule = loadPluginModule(snippetsUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request,
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          async getFile() {
            return {
              version: 1,
              snippets: [
                {
                  id: 'hello',
                  title: 'Hello',
                  content: 'hello world',
                  type: 'text',
                },
              ],
            }
          },
          setFile: storageSetFile,
        },
      },
    }))

    await pluginModule.onFeatureTriggered('snippets-search', 'hello')
    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'copy',
        featureId: 'snippets-search',
        snippetId: 'hello',
      },
    })

    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以复制片段内容')
    expect(writeText).not.toHaveBeenCalled()
    expect(storageSetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks snippet copy when permission sdk is unavailable', async () => {
    const writeText = vi.fn()
    const storageSetFile = vi.fn()
    const pluginModule = loadPluginModule(snippetsUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      clipboard: { writeText },
      permission: withoutGlobal(),
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          async getFile() {
            return {
              version: 1,
              snippets: [
                {
                  id: 'hello',
                  title: 'Hello',
                  content: 'hello world',
                  type: 'text',
                },
              ],
            }
          },
          setFile: storageSetFile,
        },
      },
    }))

    await pluginModule.onFeatureTriggered('snippets-search', 'hello')
    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'copy',
        featureId: 'snippets-search',
        snippetId: 'hello',
      },
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(storageSetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
  })

  it('blocks snippet copy when clipboard permission request fails', async () => {
    const writeText = vi.fn()
    const storageSetFile = vi.fn()
    const pluginModule = loadPluginModule(snippetsUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          async getFile() {
            return {
              version: 1,
              snippets: [
                {
                  id: 'hello',
                  title: 'Hello',
                  content: 'hello world',
                  type: 'text',
                },
              ],
            }
          },
          setFile: storageSetFile,
        },
      },
    }))

    await pluginModule.onFeatureTriggered('snippets-search', 'hello')
    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'copy',
        featureId: 'snippets-search',
        snippetId: 'hello',
      },
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(storageSetFile).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
  })

  it('blocks snippet pack export when clipboard.write permission is denied', async () => {
    const writeText = vi.fn()
    const request = vi.fn(async () => false)
    const pluginModule = loadPluginModule(snippetsUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request,
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          async getFile() {
            return {
              version: 1,
              snippets: [
                { id: 'safe', title: 'Safe', content: 'safe content' },
              ],
            }
          },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'manage',
        actionId: 'pack-export',
        featureId: 'snippets-manage',
      },
    })

    expect(request).toHaveBeenCalledWith('clipboard.write', '需要剪贴板写入权限以导出片段包')
    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
    })
  })

  it('blocks snippet pack export when permission sdk is unavailable', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(snippetsUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: withoutGlobal(),
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          async getFile() {
            return {
              version: 1,
              snippets: [
                { id: 'safe', title: 'Safe', content: 'safe content' },
              ],
            }
          },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'manage',
        actionId: 'pack-export',
        featureId: 'snippets-manage',
      },
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
    })
  })

  it('blocks snippet pack export when clipboard permission request fails', async () => {
    const writeText = vi.fn()
    const pluginModule = loadPluginModule(snippetsUrl, createPluginGlobals({
      clipboard: { writeText },
      permission: {
        check: async () => false,
        request: async () => {
          throw new Error('permission transport failed')
        },
      },
      plugin: {
        feature: {
          clearItems() {},
          pushItems() {},
        },
        storage: {
          async getFile() {
            return {
              version: 1,
              snippets: [
                { id: 'safe', title: 'Safe', content: 'safe content' },
              ],
            }
          },
          async setFile() {},
        },
      },
    }))

    const result = await pluginModule.onItemAction({
      meta: {
        defaultAction: 'manage',
        actionId: 'pack-export',
        featureId: 'snippets-manage',
      },
    })

    expect(writeText).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-request-failed',
    })
  })
})
