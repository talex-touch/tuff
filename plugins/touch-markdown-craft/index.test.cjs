const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

class FakeBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
    this.basic = {}
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    this.item.render = { mode: 'default', basic: { ...this.basic } }
    return this.item
  }
}

function createHarness(options = {}) {
  const grantedPermissions = new Set(options.permissions ?? ['clipboard.write'])
  const state = { items: [], clipboardWrites: [] }

  const plugin = {
    feature: {
      async clearItems() {
        state.items = []
        if (options.onClear)
          await options.onClear()
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }

  const clipboard = options.omitClipboard
    ? undefined
    : {
        async writeText(text) {
          if (options.failClipboard)
            throw new Error('clipboard locked')
          state.clipboardWrites.push(text)
        },
      }

  const permission = options.omitPermission
    ? undefined
    : {
        async check(permissionId) {
          if (options.failPermissionCheck)
            throw new Error('permission bridge offline')
          return grantedPermissions.has(permissionId)
        },
      }

  const sandbox = {
    plugin,
    clipboard,
    permission,
    logger: {},
    TuffItemBuilder: FakeBuilder,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox

  vm.runInNewContext(readFileSync(require.resolve('./index.js'), 'utf8'), sandbox, {
    filename: 'touch-markdown-craft/index.js',
  })

  return { module: sandbox.module.exports, state }
}

function findItemByDefaultAction(items, actionId) {
  return items.find(item => item.meta?.defaultAction === actionId)
}

test('exports only canonical lifecycle hooks and avoids all forbidden runtime globals', () => {
  const source = readFileSync(require.resolve('./index.js'), 'utf8')
  assert.doesNotMatch(source, /\brequire\s*\(/)
  assert.doesNotMatch(source, /\bprocess\b/)
  assert.doesNotMatch(source, /\bBuffer\b/)
  assert.doesNotMatch(source, /\beval\s*\(/)
  assert.doesNotMatch(source, /\bnew\s+Function\b/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)

  const harness = createHarness()
  assert.deepEqual(Object.keys(harness.module).sort(), [
    'onDestroy',
    'onFeatureTriggered',
    'onItemAction',
  ])
})

test('converts RFC-4180 CSV with quotes, pipe escaping, and right-aligned numbers to GFM tables', async () => {
  const harness = createHarness()
  const csv = [
    'Name,Note,Score',
    '"Alice, Jr.","A|B ""quoted""",98.5',
    'Bob,Fast,100',
  ].join('\n')

  await harness.module.onFeatureTriggered('markdown-craft', { text: csv })
  const tableItem = findItemByDefaultAction(harness.state.items, 'copy-table')
  assert.ok(tableItem)

  const alignedRes = await harness.module.onItemAction(tableItem)
  assert.equal(alignedRes.status, 'copied')
  const aligned = harness.state.clipboardWrites[0]
  assert.match(aligned, /\| Name\s+\| Note\s+\| Score \|/)
  assert.match(aligned, /\| -+ \| -+ \| -+: \|/)
  assert.match(aligned, /Alice, Jr\./)
  assert.match(aligned, /A\\\|B "quoted"/)

  // Secondary action via context.actionId copies compact table
  const compactRes = await harness.module.onItemAction(tableItem, { actionId: 'copy-compact-table' })
  assert.equal(compactRes.status, 'copied')
  assert.match(harness.state.clipboardWrites[1], /^\| Name \| Note \| Score \|\n\| --- \| --- \| ---: \|/)
})

test('converts TSV with CJK full-width characters and JSON arrays into aligned GFM tables', async () => {
  const harness = createHarness()
  const tsv = '项目\t状态\t分数\n核心引擎\t完成\t95\nUI\t进行中\t88'
  await harness.module.onFeatureTriggered('markdown-craft', { text: tsv })
  await harness.module.onItemAction(findItemByDefaultAction(harness.state.items, 'copy-table'))
  const tsvLines = harness.state.clipboardWrites[0].split('\n')
  assert.equal(tsvLines.length, 4)
  assert.match(tsvLines[1], /---:/)

  const jsonArr = JSON.stringify([
    { pkg: 'tuff-cli', stars: 120 },
    { pkg: 'tuffex', stars: 480, meta: { ok: true } },
  ])
  await harness.module.onFeatureTriggered('markdown-craft', { text: jsonArr })
  await harness.module.onItemAction(findItemByDefaultAction(harness.state.items, 'copy-table'))
  const jsonTable = harness.state.clipboardWrites[1]
  assert.match(jsonTable, /pkg/)
  assert.match(jsonTable, /stars/)
  assert.match(jsonTable, /meta/)
  assert.match(jsonTable, /\{"ok":true\}/)
})

test('builds Shields.io badges with hyphen/underscore escaping, style/logo params, and HTML/URL actions', async () => {
  const harness = createHarness()
  await harness.module.onFeatureTriggered('markdown-craft', {
    text: 'badge Code-Coverage | 98_percent | brightgreen style=for-the-badge logo=typescript',
  })

  const badgeItem = findItemByDefaultAction(harness.state.items, 'copy-markdown')
  assert.ok(badgeItem)

  await harness.module.onItemAction(badgeItem)
  assert.equal(
    harness.state.clipboardWrites[0],
    '![Code-Coverage: 98_percent](https://img.shields.io/badge/Code--Coverage-98__percent-brightgreen?style=for-the-badge&logo=typescript)',
  )

  await harness.module.onItemAction(badgeItem, { actionId: 'copy-html' })
  assert.match(harness.state.clipboardWrites[1], /^<img alt="Code-Coverage: 98_percent" src="https:\/\/img\.shields\.io\/badge\//)

  await harness.module.onItemAction(badgeItem, { actionId: 'copy-url' })
  assert.match(harness.state.clipboardWrites[2], /^https:\/\/img\.shields\.io\/badge\/Code--Coverage-98__percent-brightgreen/)
})

test('extracts Markdown TOC & GitHub anchor slugs while skipping fenced code blocks and deduplicating slugs', async () => {
  const harness = createHarness()
  const md = [
    '# Project Guide',
    '## 快速开始 (v2)',
    '```bash',
    '# not a heading inside code fence',
    '```',
    '### FAQ',
    '### FAQ',
  ].join('\n')

  await harness.module.onFeatureTriggered('markdown-craft', { text: `toc ${md}` })
  const tocItem = findItemByDefaultAction(harness.state.items, 'copy-toc')
  assert.ok(tocItem)

  await harness.module.onItemAction(tocItem)
  assert.equal(
    harness.state.clipboardWrites[0],
    [
      '- [Project Guide](#project-guide)',
      '  - [快速开始 (v2)](#快速开始-v2)',
      '    - [FAQ](#faq)',
      '    - [FAQ](#faq-1)',
    ].join('\n'),
  )

  await harness.module.onItemAction(tocItem, { actionId: 'copy-anchors' })
  assert.equal(
    harness.state.clipboardWrites[1],
    '#project-guide\n#快速开始-v2\n#faq\n#faq-1',
  )
})

test('estimates CJK words, Latin words, reading time, and LLM tokens accurately', async () => {
  const harness = createHarness()
  await harness.module.onFeatureTriggered('markdown-craft', {
    text: 'stats 你好世界 Tuff Markdown workbench 2026',
  })

  const statsItem = findItemByDefaultAction(harness.state.items, 'copy-stats')
  assert.ok(statsItem)
  assert.match(statsItem.render.basic.title, /8 words \(CJK 4 · Latin 4\)/)
  assert.match(statsItem.render.basic.title, /~\d+ tokens/)

  await harness.module.onItemAction(statsItem)
  assert.match(harness.state.clipboardWrites[0], /\| CJK Characters \| 4 \|/)
  assert.match(harness.state.clipboardWrites[0], /\| Latin Words \| 4 \|/)
  assert.match(harness.state.clipboardWrites[0], /\| Est\. LLM Tokens \| ~\d+ \|/)
})

test('wraps code in fences with language detection and expands backticks for nested fences', async () => {
  const harness = createHarness()
  await harness.module.onFeatureTriggered('markdown-craft', {
    text: 'fence md Here is a block:\n```js\nconsole.log(1)\n```',
  })

  const fenceItem = findItemByDefaultAction(harness.state.items, 'copy-fence')
  assert.ok(fenceItem)
  await harness.module.onItemAction(fenceItem)
  assert.match(harness.state.clipboardWrites[0], /^````md\nHere is a block:\n```js\nconsole\.log\(1\)\n```\n````$/)

  await harness.module.onFeatureTriggered('markdown-craft', {
    text: 'SELECT id, name FROM users WHERE active = 1',
  })
  const autoFence = findItemByDefaultAction(harness.state.items, 'copy-fence')
  assert.match(autoFence.render.basic.title, /\(sql\)/)
})

test('strips Markdown syntax cleanly into plain text', async () => {
  const harness = createHarness()
  const md = [
    '## Release **Notes**',
    '> Built for [Tuff](https://tuff.tagzxia.com) with `zero` deps.',
    '- [x] Support ![Logo](logo.svg) and ~~old~~ *new* syntax',
  ].join('\n')

  await harness.module.onFeatureTriggered('markdown-craft', { text: `strip ${md}` })
  const stripItem = findItemByDefaultAction(harness.state.items, 'copy-plain')
  assert.ok(stripItem)
  await harness.module.onItemAction(stripItem)
  assert.equal(
    harness.state.clipboardWrites[0],
    'Release Notes\nBuilt for Tuff with zero deps.\nSupport Logo and old new syntax',
  )
})

test('enforces fail-closed clipboard.write permission gates with canonical blocked reasons', async () => {
  const denied = createHarness({ permissions: [] })
  await denied.module.onFeatureTriggered('markdown-craft', { text: 'badge API v1 blue' })
  const r1 = await denied.module.onItemAction(findItemByDefaultAction(denied.state.items, 'copy-markdown'))
  assert.equal(r1.status, 'blocked')
  assert.equal(r1.reason, 'permission-denied')
  assert.equal(denied.state.clipboardWrites.length, 0)

  const noSdk = createHarness({ omitPermission: true })
  await noSdk.module.onFeatureTriggered('markdown-craft', { text: 'badge API v1 blue' })
  const r2 = await noSdk.module.onItemAction(findItemByDefaultAction(noSdk.state.items, 'copy-markdown'))
  assert.equal(r2.status, 'blocked')
  assert.equal(r2.reason, 'permission-sdk-unavailable')

  const checkFail = createHarness({ failPermissionCheck: true })
  await checkFail.module.onFeatureTriggered('markdown-craft', { text: 'badge API v1 blue' })
  const r3 = await checkFail.module.onItemAction(findItemByDefaultAction(checkFail.state.items, 'copy-markdown'))
  assert.equal(r3.status, 'blocked')
  assert.equal(r3.reason, 'permission-check-failed')

  const noClip = createHarness({ omitClipboard: true })
  await noClip.module.onFeatureTriggered('markdown-craft', { text: 'badge API v1 blue' })
  const r4 = await noClip.module.onItemAction(findItemByDefaultAction(noClip.state.items, 'copy-markdown'))
  assert.equal(r4.status, 'blocked')
  assert.equal(r4.reason, 'clipboard-unavailable')
})

test('enforces trigger generation guard, invalidates state on onDestroy(), and ignores foreign items', async () => {
  let releaseFirst
  let calls = 0
  const harness = createHarness({
    onClear: async () => {
      calls += 1
      if (calls === 1) {
        await new Promise((resolve) => {
          releaseFirst = resolve
        })
      }
    },
  })

  const slow = harness.module.onFeatureTriggered('markdown-craft', { text: 'badge Slow 1 red' })
  await new Promise(resolve => setTimeout(resolve, 5))
  await harness.module.onFeatureTriggered('markdown-craft', { text: 'badge Fast 2 green' })
  releaseFirst()
  await slow

  const item = findItemByDefaultAction(harness.state.items, 'copy-markdown')
  assert.ok(item)
  assert.match(item.render.basic.title, /Fast: 2/)

  harness.module.onDestroy()
  const staleRes = await harness.module.onItemAction(item)
  assert.equal(staleRes.status, 'blocked')
  assert.equal(staleRes.reason, 'stale-request')

  const foreign = await harness.module.onItemAction({
    source: { type: 'plugin', id: 'other' },
    meta: { pluginName: 'other', featureId: 'other', defaultAction: 'copy-markdown' },
    actions: [{ id: 'copy-markdown', type: 'plugin', payload: { token: 'x' } }],
  })
  assert.equal(foreign, undefined)
})
