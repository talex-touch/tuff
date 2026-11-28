const assert = require('node:assert/strict')
const test = require('node:test')

class MockItemBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.item.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, title, payload) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

function setupHarness(overrides = {}) {
  const state = {
    pushed: [],
    clears: 0,
    clipboardWrites: [],
    permissionChecks: [],
  }

  globalThis.TuffItemBuilder = MockItemBuilder
  globalThis.logger = { info() {}, warn() {}, error() {} }
  globalThis.plugin = {
    feature: {
      async clearItems() {
        state.clears += 1
        state.pushed = []
      },
      async pushItems(items) {
        state.pushed = items
      },
      ...overrides.feature,
    },
  }
  globalThis.clipboard = Object.prototype.hasOwnProperty.call(overrides, 'clipboard')
    ? overrides.clipboard
    : {
        async writeText(text) {
          state.clipboardWrites.push(text)
        },
      }
  globalThis.permission = Object.prototype.hasOwnProperty.call(overrides, 'permission')
    ? overrides.permission
    : {
        async check(id) {
          state.permissionChecks.push(id)
          return true
        },
      }

  delete require.cache[require.resolve('./index.js')]
  const mod = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { mod, state }
}

test('ships 80+ curated crisp vector icons across UI, Dev, Media, Nav, and Status categories', async () => {
  const { mod, state } = setupHarness()
  const seenNames = new Set()
  const categories = ['ui', 'dev', 'media', 'nav', 'status']

  for (const cat of categories) {
    await mod.onFeatureTriggered('svg-craft', `svg cat:${cat}`)
    assert.ok(state.pushed.length >= 16, `category ${cat} should have >= 16 icons, got ${state.pushed.length}`)
    for (const item of state.pushed) {
      const iconName = item.id.replace('svg-craft-icon-', '')
      assert.ok(!seenNames.has(iconName), `duplicate icon name: ${iconName}`)
      seenNames.add(iconName)
      const rawSvg = item.actions.find(a => a.id === 'copy-svg').payload.text
      assert.match(rawSvg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="24" height="24" viewBox="0 0 24 24"/)
      assert.match(rawSvg, /<\/svg>$/)
    }
  }

  assert.ok(seenNames.size >= 80, `expected >= 80 curated icons, got ${seenNames.size}`)

  await mod.onFeatureTriggered('svg-craft', '')
  const summary = state.pushed.find(i => i.id === 'svg-craft-summary')
  assert.ok(summary)
  assert.match(summary.title, /86 枚矢量图标/)
})

test('supports Chinese/English keyword search and custom size + stroke color flags', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('svg-craft', 'svg 终端')
  assert.ok(state.pushed.some(i => i.id === 'svg-craft-icon-terminal'))

  await mod.onFeatureTriggered('svg-craft', 'svg heart 32 #f43f5e')
  const rawItem = state.pushed.find(i => i.id === 'svg-craft-out-raw')
  assert.ok(rawItem, 'exact icon match should expand 5 format converter cards')
  const rawSvg = rawItem.actions[0].payload.text
  assert.match(rawSvg, /width="32" height="32"/)
  assert.match(rawSvg, /stroke="#F43F5E"/)
})

test('optimizes pasted SVG by stripping XML prolog, comments, metadata, editor bloat, empty containers, and derives viewBox', async () => {
  const { mod, state } = setupHarness()
  const bloatedSvg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<!-- Created with Inkscape -->',
    '<svg version="1.1" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:xlink="http://www.w3.org/1999/xlink" width="48.000" height="48.00" inkscape:version="1.3" data-name="Layer 1" xml:space="preserve">',
    '  <metadata><rdf:RDF>editor junk</rdf:RDF></metadata>',
    '  <sodipodi:namedview id="nv1" pagecolor="#ffffff" />',
    '  <defs></defs>',
    '  <g><g></g></g>',
    '  <circle cx="24.00" cy="24.50" r="10.000" stroke-width="2.0" fill="none" stroke="#3b82f6" />',
    '</svg>',
  ].join('\n')

  await mod.onFeatureTriggered('svg-craft', bloatedSvg)
  const rawItem = state.pushed.find(i => i.id === 'svg-craft-out-raw')
  assert.ok(rawItem)

  const optimized = rawItem.actions[0].payload.text
  assert.doesNotMatch(optimized, /\?xml|DOCTYPE|<!--|<metadata|sodipodi|inkscape|data-name|xml:space|xmlns:xlink|<defs|<g/)
  assert.match(optimized, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(optimized, /viewBox="0 0 48 48"/)
  assert.match(optimized, /cx="24" cy="24\.5" r="10"/)
  assert.match(rawItem.title, /-\d+(\.\d+)?%\)/)
  assert.ok(optimized.length < bloatedSvg.length * 0.5)
})

test('converts SVG to React JSX with camelCase attributes, className, xlinkHref, inline style object, and preserved aria/data attrs', async () => {
  const { mod, state } = setupHarness()
  const input = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" class="icon-lg" aria-label="Badge" data-testid="badge"><path fill-rule="evenodd" clip-rule="evenodd" stroke-width="2" stroke-linecap="round" style="fill: #fff; stroke-opacity: 0.8" d="M2 2h20v20H2z"/><use xlink:href="#sym"/></svg>'

  await mod.onFeatureTriggered('svg-craft', input)
  const jsxItem = state.pushed.find(i => i.id === 'svg-craft-out-jsx')
  assert.ok(jsxItem)

  const jsx = jsxItem.actions[0].payload.text
  assert.match(jsx, /export function OptimizedIcon\(props\)/)
  assert.match(jsx, /className="icon-lg"/)
  assert.match(jsx, /aria-label="Badge"/)
  assert.match(jsx, /data-testid="badge"/)
  assert.match(jsx, /fillRule="evenodd"/)
  assert.match(jsx, /clipRule="evenodd"/)
  assert.match(jsx, /strokeWidth="2"/)
  assert.match(jsx, /strokeLinecap="round"/)
  assert.match(jsx, /xlinkHref="#sym"/)
  assert.match(jsx, /style=\{\{ fill: "#fff", strokeOpacity: "0\.8" \}\}/)
  assert.match(jsx, /\{\.\.\.props\}>/)
})

test('converts SVG to Vue 3 SFC, CSS Data URI, and exact UTF-8 Base64 Data URL', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('svg-craft', 'svg search')

  const rawSvg = state.pushed.find(i => i.id === 'svg-craft-out-raw').actions[0].payload.text
  const vueSfc = state.pushed.find(i => i.id === 'svg-craft-out-vue').actions[0].payload.text
  const cssUri = state.pushed.find(i => i.id === 'svg-craft-out-data-uri').actions[0].payload.text
  const base64Url = state.pushed.find(i => i.id === 'svg-craft-out-base64').actions[0].payload.text

  assert.match(vueSfc, /<script setup lang="ts">/)
  assert.match(vueSfc, /defineOptions\(\{ name: 'SearchIcon' \}\)/)
  assert.match(vueSfc, /<template>[\s\S]*<svg[\s\S]*:class="props\.class"[\s\S]*<\/template>/)

  assert.match(cssUri, /^url\("data:image\/svg\+xml,%3Csvg/)
  assert.doesNotMatch(cssUri, /#/)

  assert.match(base64Url, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/)
  const decoded = Buffer.from(base64Url.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
  assert.equal(decoded, rawSvg)
})

test('honors context.actionId across all 5 converter actions on browser icon items', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('svg-craft', 'svg cat:dev')
  const gitBranchItem = state.pushed.find(i => i.id === 'svg-craft-icon-git-branch')
  assert.ok(gitBranchItem)

  const resSvg = await mod.onItemAction(gitBranchItem, { actionId: 'copy-svg' })
  assert.equal(resSvg.status, 'completed')
  assert.match(state.clipboardWrites[0], /^<svg xmlns=/)

  const resVue = await mod.onItemAction(gitBranchItem, { actionId: 'copy-vue' })
  assert.equal(resVue.status, 'completed')
  assert.match(state.clipboardWrites[1], /<script setup lang="ts">/)

  const resJsx = await mod.onItemAction(gitBranchItem, { actionId: 'copy-jsx' })
  assert.equal(resJsx.status, 'completed')
  assert.match(state.clipboardWrites[2], /export function GitBranchIcon\(props\)/)

  const resDataUri = await mod.onItemAction(gitBranchItem, { actionId: 'copy-data-uri' })
  assert.equal(resDataUri.status, 'completed')
  assert.match(state.clipboardWrites[3], /^url\("data:image\/svg\+xml,/)

  const resBase64 = await mod.onItemAction(gitBranchItem, { actionId: 'copy-base64' })
  assert.equal(resBase64.status, 'completed')
  assert.match(state.clipboardWrites[4], /^data:image\/svg\+xml;base64,/)

  const resInvalid = await mod.onItemAction(gitBranchItem, { actionId: 'unknown-action' })
  assert.equal(resInvalid.status, 'blocked')
  assert.equal(resInvalid.reason, 'invalid-action')
})

test('fails closed when clipboard.write permission is denied, SDK missing, unavailable, or check throws', async () => {
  // 1. Denied
  {
    const { mod, state } = setupHarness({
      permission: { async check() { return false } },
    })
    await mod.onFeatureTriggered('svg-craft', 'svg search')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-denied')
    assert.equal(state.clipboardWrites.length, 0)
  }

  // 2. SDK missing
  {
    const { mod, state } = setupHarness({ permission: undefined })
    await mod.onFeatureTriggered('svg-craft', 'svg search')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-sdk-unavailable')
  }

  // 3. Permission service unavailable
  {
    const { mod, state } = setupHarness({
      permission: {
        async check() {
          const err = new Error('service down')
          err.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
          throw err
        },
      },
    })
    await mod.onFeatureTriggered('svg-craft', 'svg search')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-unavailable')
  }

  // 4. Permission check throws
  {
    const { mod, state } = setupHarness({
      permission: {
        async check() {
          throw new Error('unexpected')
        },
      },
    })
    await mod.onFeatureTriggered('svg-craft', 'svg search')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-check-failed')
  }
})

test('handles unavailable clipboard bridge and redacted host write errors', async () => {
  {
    const { mod, state } = setupHarness({ clipboard: {} })
    await mod.onFeatureTriggered('svg-craft', 'svg search')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'clipboard-unavailable')
  }

  {
    const { mod, state } = setupHarness({
      clipboard: {
        async writeText() {
          throw new Error('/private/internal-clipboard-crash')
        },
      },
    })
    await mod.onFeatureTriggered('svg-craft', 'svg search')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'failed')
    assert.equal(res.reason, 'clipboard-write-failed')
    assert.doesNotMatch(JSON.stringify(res), /internal-clipboard-crash/)
  }
})

test('handles empty/unmatched search gracefully', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('svg-craft', 'svg nonexistent-icon-zzz-999')
  assert.equal(state.pushed.length, 1)
  assert.equal(state.pushed[0].id, 'svg-craft-empty')
})

test('guards against stale trigger generations and halts publishing on onDestroy()', async () => {
  let releaseFirstClear
  let firstEnteredResolve
  const firstEntered = new Promise((resolve) => {
    firstEnteredResolve = resolve
  })
  let clearCount = 0
  const batches = []

  const { mod } = setupHarness({
    feature: {
      async clearItems() {
        clearCount += 1
        if (clearCount === 1) {
          firstEnteredResolve()
          await new Promise((resolve) => {
            releaseFirstClear = resolve
          })
        }
      },
      async pushItems(items) {
        batches.push(items)
      },
    },
  })

  const first = mod.onFeatureTriggered('svg-craft', 'svg search')
  await firstEntered
  const second = mod.onFeatureTriggered('svg-craft', 'svg terminal')
  await second
  releaseFirstClear()
  assert.equal(await first, false)
  assert.equal(batches.length, 1)
  assert.match(batches[0][1].title, /TerminalIcon/)

  let releaseDestroy
  let destroyEnteredResolve
  const destroyEntered = new Promise((resolve) => {
    destroyEnteredResolve = resolve
  })
  const { mod: mod2 } = setupHarness({
    feature: {
      async clearItems() {
        destroyEnteredResolve()
        await new Promise((resolve) => {
          releaseDestroy = resolve
        })
      },
      async pushItems() {
        throw new Error('pushItems must not run after onDestroy')
      },
    },
  })
  const pending = mod2.onFeatureTriggered('svg-craft', 'svg search')
  await destroyEntered
  await mod2.onDestroy()
  releaseDestroy()
  assert.equal(await pending, false)
})

test('strips active SVG elements/handlers/javascript schemes, extracts single SVG non-greedily, and prevents Vue/JSX breakout', async () => {
  const { mod, state } = setupHarness()
  const malicious = [
    '<svg viewBox="0 0 24 24" onload="alert(1)">',
    '  <script>alert("xss")</script>',
    '  <foreignObject><div>html</div></foreignObject>',
    '  <a href="javascript:alert(2)" xlink:href="  JAVASCRIPT:alert(3)"><path d="M0 0" onclick="evil()" style="font-family: \\\' } , alert(4) //"/></a>',
    '  <text></template><script>alert(5)</script></text>',
    '</svg>',
    '<script>between()</script>',
    '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
  ].join('\n')

  await mod.onFeatureTriggered('svg-craft', malicious)
  const rawSvg = state.pushed.find(i => i.id === 'svg-craft-out-raw').actions[0].payload.text
  const vueSfc = state.pushed.find(i => i.id === 'svg-craft-out-vue').actions[0].payload.text
  const jsx = state.pushed.find(i => i.id === 'svg-craft-out-jsx').actions[0].payload.text

  assert.doesNotMatch(rawSvg, /<script|foreignObject|onload=|onclick=|javascript:|between\(|<rect/i)
  assert.equal((rawSvg.match(/<svg\b/gi) || []).length, 1)

  // Vue SFC must contain exactly one closing </template> and no injected <script> inside template
  const templateSection = vueSfc.slice(vueSfc.indexOf('<template>'))
  assert.equal((templateSection.match(/<\/template>/gi) || []).length, 1)
  assert.doesNotMatch(templateSection, /<script/i)

  // JSX style uses JSON.stringify so backslash+quote cannot break out of string literal
  assert.match(jsx, /style=\{\{ fontFamily: "\\\\' \} , alert\(4\) \/\/" \}\}/)
})
