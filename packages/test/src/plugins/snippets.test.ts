import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const snippetsUrl = new URL('../../../../plugins/touch-snippets/index.js', import.meta.url)

// Mirrors the builder in plugins/touch-snippets/index.test.cjs. This copy had
// drifted: createAndAddAction was missing entirely, and setMeta overwrote instead
// of merging. buildItem (index.js:116-131) puts the payload in the ACTION, and
// onItemAction reads it back from item.actions -- so without the action the
// payload never survives the round trip a test is trying to exercise.
class FakeBuilder {
  item: Record<string, unknown>

  constructor(id: string) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
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
    this.item.meta = { ...(this.item.meta as Record<string, unknown>), ...meta }
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: unknown) {
    ;(this.item.actions as unknown[]).push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

type Item = Record<string, any>

interface HarnessOptions {
  snippets?: Array<Record<string, unknown>>
  clipboard?: Record<string, unknown> | null
}

// e37c92c8c moved the permission model host-side: the plugin no longer prompts, it
// calls the capability and reads the thrown error. actionFailure (index.js:133-147)
// maps PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED to 'permission-denied' and
// PLUGIN_HOST_CAPABILITY_UNAVAILABLE to 'host-unavailable', with everything else
// falling through to the caller's fallback reason.
const HOST_DENIED = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'

function hostDenied(message: string) {
  return Object.assign(new Error(message), { code: HOST_DENIED })
}

function createHarness(options: HarnessOptions = {}) {
  const items: Item[] = []
  const writes: string[] = []
  const stored: Array<Record<string, unknown>> = []

  const clipboard = options.clipboard === null
    ? undefined
    : options.clipboard ?? {
      async readText() {
        return 'CLIP'
      },
      async writeText(value: string) {
        writes.push(value)
      },
    }

  const module = loadPluginModule(snippetsUrl, createPluginGlobals({
    TuffItemBuilder: FakeBuilder,
    ...(clipboard ? { clipboard } : {}),
    plugin: {
      feature: {
        clearItems() {
          items.length = 0
        },
        pushItems(next: Item[]) {
          items.push(...next)
        },
      },
      storage: {
        async getFile() {
          return { version: 1, snippets: options.snippets ?? [] }
        },
        async setFile(_name: string, value: Record<string, unknown>) {
          stored.push(value)
        },
      },
    },
  }))

  return { module, items, writes, stored }
}

// onItemAction resolves the payload from item.actions by matching the action id
// (index.js:356-358); the tests used to pass it inside meta, where nothing reads it.
function copyItem(content: string) {
  return {
    meta: { defaultAction: 'copy', featureId: 'snippets-search' },
    actions: [{ id: 'copy', payload: { content } }],
  }
}

describe('code snippets', () => {
  // applyPlaceholders and matchSnippet were both deleted in e37c92c8c, so the tests
  // that called them through a __test export had no subject left. The surviving
  // behaviour is reached the way the plugin exposes it: placeholders through the
  // copy action, matching through the search feature.
  //
  // The reduction is real and is reported on #330 rather than pinned here: the old
  // applyPlaceholders also substituted {{date}}, {{time}} and {{uuid}}, and only
  // {{clipboard}} survives. Those three were never advertised in the manifest, which
  // still documents {{clipboard}} alone, so this asserts what the plugin promises
  // and does not assert the absence of what it dropped.
  it('resolves the clipboard placeholder through the host read capability', async () => {
    const harness = createHarness()

    const result = await harness.module.onItemAction(copyItem('before {{clipboard}} after'))

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(harness.writes).toEqual(['before CLIP after'])
  })

  it('leaves content without placeholders untouched', async () => {
    const harness = createHarness()

    await harness.module.onItemAction(copyItem('plain content'))

    expect(harness.writes).toEqual(['plain content'])
  })

  it('matches snippet by tag or title', async () => {
    const snippet = {
      id: 'react',
      title: 'React useEffect 模板',
      tags: ['react', 'hook'],
      language: 'ts',
      content: 'useEffect(() => {})',
    }

    for (const keyword of ['react', 'hook']) {
      const harness = createHarness({ snippets: [snippet] })
      await harness.module.onFeatureTriggered('snippets-search', keyword)
      expect(harness.items.map(item => item.title)).toEqual(['React useEffect 模板'])
    }

    const miss = createHarness({ snippets: [snippet] })
    await miss.module.onFeatureTriggered('snippets-search', 'vue')
    expect(miss.items.map(item => item.title)).toEqual(['没有匹配的片段'])
  })

  it('matches text snippet content', async () => {
    const snippet = {
      id: 'mail',
      title: '邮件模板',
      tags: ['邮件'],
      content: '你好，今天的进度如下',
    }

    for (const keyword of ['邮件', '进度']) {
      const harness = createHarness({ snippets: [snippet] })
      await harness.module.onFeatureTriggered('snippets-search', keyword)
      expect(harness.items.map(item => item.title)).toEqual(['邮件模板'])
    }

    const miss = createHarness({ snippets: [snippet] })
    await miss.module.onFeatureTriggered('snippets-search', '无关')
    expect(miss.items.map(item => item.title)).toEqual(['没有匹配的片段'])
  })

  it('blocks snippet copy when the host denies clipboard.write', async () => {
    const writeText = vi.fn(async () => {
      throw hostDenied('/private/clipboard denied')
    })
    const harness = createHarness({ clipboard: {
      async readText() {
        return 'CLIP'
      },
      writeText,
    } })

    const result = await harness.module.onItemAction(copyItem('hello world'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少执行此操作所需的权限',
    })
    expect(harness.stored).toEqual([])
  })

  it('blocks snippet copy when the host exposes no clipboard reader', async () => {
    const writeText = vi.fn()
    // resolveClipboardPlaceholders raises PLUGIN_HOST_CAPABILITY_UNAVAILABLE rather
    // than substituting an empty string, so an absent host reader cannot silently
    // put a half-resolved template on the user's clipboard.
    const harness = createHarness({ clipboard: { writeText } })

    const result = await harness.module.onItemAction(copyItem('before {{clipboard}} after'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'host-unavailable',
      message: '宿主服务暂不可用',
    })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('separates a failed clipboard write from a denied one', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard transport failed')
    })
    const harness = createHarness({ clipboard: {
      async readText() {
        return 'CLIP'
      },
      writeText,
    } })

    const result = await harness.module.onItemAction(copyItem('hello world'))

    // A transport failure must not be reported as a permission problem: it would send
    // the user to a permission screen that has nothing to fix.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'action-failed',
      message: '操作失败',
    })
  })

  // The three 'snippet pack export' tests that stood here were removed: e37c92c8c
  // deleted the pack-export action outright, so onItemAction has no branch for it and
  // returns undefined. There is nothing left to re-target them at. The cloud-share
  // flow that took over that ground is covered by the plugin's own suite
  // (plugins/touch-snippets/index.test.cjs), including its denial path.
})
