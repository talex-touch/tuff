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

test('converts #3b82f6 accurately across HEX, RGB, HSL, OKLCH and nearest Tailwind v4 token', async () => {
  const { mod, state } = setupHarness()
  const ok = await mod.onFeatureTriggered('color-studio', { text: 'color #3b82f6' })
  assert.equal(ok, true)

  const byId = id => state.pushed.find(item => item.id === id)
  assert.equal(byId('color-studio-hex').actions[0].payload.text, '#3B82F6')
  assert.equal(byId('color-studio-rgb').actions[0].payload.text, 'rgb(59, 130, 246)')
  assert.equal(byId('color-studio-hsl').actions[0].payload.text, 'hsl(217.2, 91.2%, 59.8%)')

  const oklchText = byId('color-studio-oklch').actions[0].payload.text
  const oklchMatch = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(oklchText)
  assert.ok(oklchMatch, `unexpected oklch format: ${oklchText}`)
  assert.ok(Math.abs(Number(oklchMatch[1]) - 0.6231) < 0.002)
  assert.ok(Math.abs(Number(oklchMatch[2]) - 0.188) < 0.002)
  assert.ok(Math.abs(Number(oklchMatch[3]) - 259.81) < 0.2)

  const twItem = byId('color-studio-tailwind-match')
  assert.equal(twItem.actions[0].payload.text, 'blue-500')
  assert.equal(twItem.actions[1].payload.text, 'bg-blue-500')
})

test('parses rgba, hsla, and oklch inputs including alpha and gamut clamping', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('color-studio', 'rgba(59, 130, 246, 0.5)')
  assert.equal(state.pushed.find(i => i.id === 'color-studio-hex').actions[0].payload.text, '#3B82F680')
  assert.equal(state.pushed.find(i => i.id === 'color-studio-rgb').actions[0].payload.text, 'rgba(59, 130, 246, 0.5)')

  await mod.onFeatureTriggered('color-studio', 'hsl(120, 100%, 50%)')
  assert.equal(state.pushed.find(i => i.id === 'color-studio-hex').actions[0].payload.text, '#00FF00')

  await mod.onFeatureTriggered('color-studio', 'oklch(0.623 0.214 259.815)')
  assert.equal(state.pushed.find(i => i.id === 'color-studio-tailwind-match').actions[0].payload.text, 'blue-500')
  assert.match(state.pushed.find(i => i.id === 'color-studio-hex').actions[0].payload.text, /^#[0-9A-F]{6}$/)
})

test('calculates exact WCAG 2.1 contrast for #111 #fff and #000 #fff', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('color-studio', 'contrast #111 #fff')
  const summary = state.pushed.find(i => i.id === 'color-studio-contrast-summary')
  assert.ok(summary)
  assert.match(summary.title, /WCAG 18\.88:1 · AAA/)
  assert.match(summary.actions[0].payload.text, /AA PASS.*AAA PASS/)

  await mod.onFeatureTriggered('color-studio', 'wcag #000000 #ffffff')
  const maxSummary = state.pushed.find(i => i.id === 'color-studio-contrast-summary')
  assert.match(maxSummary.title, /WCAG 21:1 · AAA/)
})

test('suggests accessible AA and AAA colors when contrast fails WCAG thresholds', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('color-studio', 'contrast #60a5fa #ffffff')
  const summary = state.pushed.find(i => i.id === 'color-studio-contrast-summary')
  assert.match(summary.title, /Fail/)

  const aaSuggestion = state.pushed.find(i => i.id === 'color-studio-contrast-suggest-aa')
  const aaaSuggestion = state.pushed.find(i => i.id === 'color-studio-contrast-suggest-aaa')
  assert.ok(aaSuggestion, 'should provide AA suggestion')
  assert.ok(aaaSuggestion, 'should provide AAA suggestion')

  const aaRatio = Number(/\(([\d.]+):1\)/.exec(aaSuggestion.title)[1])
  const aaaRatio = Number(/\(([\d.]+):1\)/.exec(aaaSuggestion.title)[1])
  assert.ok(aaRatio >= 4.5, `AA suggestion ratio should be >= 4.5, got ${aaRatio}`)
  assert.ok(aaaRatio >= 7.0, `AAA suggestion ratio should be >= 7.0, got ${aaaRatio}`)
})

test('supports Tailwind v4 reverse token lookup and full family ramp browsing', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('color-studio', 'blue-500')
  const hexItem = state.pushed.find(i => i.id === 'color-studio-hex')
  assert.match(hexItem.subtitle, /Tailwind v4 blue-500/)
  assert.equal(state.pushed.find(i => i.id === 'color-studio-tailwind-match').actions[0].payload.text, 'blue-500')

  await mod.onFeatureTriggered('color-studio', 'bg-emerald-500/80')
  assert.match(state.pushed.find(i => i.id === 'color-studio-rgb').actions[0].payload.text, /0\.8\)$/)

  await mod.onFeatureTriggered('color-studio', 'tailwind emerald')
  assert.ok(state.pushed.some(i => i.id === 'color-studio-tw-emerald-50'))
  assert.ok(state.pushed.some(i => i.id === 'color-studio-tw-emerald-500'))
  assert.ok(state.pushed.some(i => i.id === 'color-studio-tw-emerald-950'))
  const varsItem = state.pushed.find(i => i.id === 'color-studio-tw-family-vars')
  assert.match(varsItem.actions[0].payload.text, /--color-emerald-500:/)
})

test('generates complementary, triadic, analogous harmonies, tint/shade ramp, and CSS gradients', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('color-studio', '#3b82f6')

  const comp = state.pushed.find(i => i.id === 'color-studio-harmony-comp')
  const triadic = state.pushed.find(i => i.id === 'color-studio-harmony-triadic')
  const analogous = state.pushed.find(i => i.id === 'color-studio-harmony-analogous')
  const ramp = state.pushed.find(i => i.id === 'color-studio-tint-shade')
  const grad = state.pushed.find(i => i.id === 'color-studio-gradient-css')

  assert.match(comp.actions[0].payload.text, /^#[0-9A-F]{6}$/)
  assert.equal(triadic.actions[0].payload.text.split(', ').length, 3)
  assert.equal(analogous.actions[0].payload.text.split(', ').length, 3)
  assert.match(ramp.actions[0].payload.text, /--color-100:.*--color-900:/s)
  assert.match(grad.actions[0].payload.text, /^background: linear-gradient\(135deg, /)
  assert.match(grad.actions[1].payload.text, /^background: linear-gradient\(135deg, /)
})

test('honors context.actionId to execute secondary actions on multi-action items', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('color-studio', '#3b82f6')
  const twItem = state.pushed.find(i => i.id === 'color-studio-tailwind-match')

  const resDefault = await mod.onItemAction(twItem)
  assert.equal(resDefault.status, 'completed')
  assert.equal(state.clipboardWrites[0], 'blue-500')

  const resSecondary = await mod.onItemAction(twItem, { actionId: 'copy-class' })
  assert.equal(resSecondary.status, 'completed')
  assert.equal(state.clipboardWrites[1], 'bg-blue-500')

  const resInvalid = await mod.onItemAction(twItem, { actionId: 'does-not-exist' })
  assert.equal(resInvalid.status, 'blocked')
  assert.equal(resInvalid.reason, 'invalid-action')
})

test('fails closed when clipboard.write permission is denied or permission SDK is missing/throws', async () => {
  // 1. Permission denied
  {
    const { mod, state } = setupHarness({
      permission: { async check() { return false } },
    })
    await mod.onFeatureTriggered('color-studio', '#3b82f6')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-denied')
    assert.equal(state.clipboardWrites.length, 0)
  }

  // 2. Permission SDK missing
  {
    const { mod, state } = setupHarness({ permission: undefined })
    await mod.onFeatureTriggered('color-studio', '#3b82f6')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-sdk-unavailable')
    assert.equal(state.clipboardWrites.length, 0)
  }

  // 3. Permission check throws permission-unavailable
  {
    const { mod, state } = setupHarness({
      permission: {
        async check() {
          const err = new Error('unavailable')
          err.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
          throw err
        },
      },
    })
    await mod.onFeatureTriggered('color-studio', '#3b82f6')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-unavailable')
  }

  // 4. Permission check throws generic error
  {
    const { mod, state } = setupHarness({
      permission: {
        async check() {
          throw new Error('boom')
        },
      },
    })
    await mod.onFeatureTriggered('color-studio', '#3b82f6')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-check-failed')
  }
})

test('blocks cleanly when clipboard bridge is unavailable or host write fails without leaking internals', async () => {
  {
    const { mod, state } = setupHarness({ clipboard: {} })
    await mod.onFeatureTriggered('color-studio', '#3b82f6')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'clipboard-unavailable')
  }

  {
    const { mod, state } = setupHarness({
      clipboard: {
        async writeText() {
          throw new Error('/internal/secret-path failed')
        },
      },
    })
    await mod.onFeatureTriggered('color-studio', '#3b82f6')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'failed')
    assert.equal(res.reason, 'clipboard-write-failed')
    assert.doesNotMatch(JSON.stringify(res), /secret-path/)
  }
})

test('guards against stale trigger generations and halts publishing on onDestroy()', async () => {
  let releaseFirstClear
  let clearCount = 0
  const pushedBatches = []

  const { mod } = setupHarness({
    feature: {
      async clearItems() {
        clearCount += 1
        if (clearCount === 1) {
          await new Promise((resolve) => {
            releaseFirstClear = resolve
          })
        }
      },
      async pushItems(items) {
        pushedBatches.push(items)
      },
    },
  })

  const firstRun = mod.onFeatureTriggered('color-studio', '#ff0000')
  const secondRun = mod.onFeatureTriggered('color-studio', '#00ff00')
  await secondRun
  releaseFirstClear()
  const firstResult = await firstRun

  assert.equal(firstResult, false)
  assert.equal(pushedBatches.length, 1)
  assert.equal(pushedBatches[0][0].actions[0].payload.text, '#00FF00')

  // Verify onDestroy prevents subsequent stale publish
  let releaseDestroyClear
  const { mod: mod2 } = setupHarness({
    feature: {
      async clearItems() {
        await new Promise((resolve) => {
          releaseDestroyClear = resolve
        })
      },
      async pushItems() {
        throw new Error('pushItems should not be called after onDestroy')
      },
    },
  })
  const pending = mod2.onFeatureTriggered('color-studio', '#111111')
  await mod2.onDestroy()
  releaseDestroyClear()
  assert.equal(await pending, false)
})

test('handles CSS named colors, empty starter showcase, and graceful invalid input', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('color-studio', 'rebeccapurple')
  assert.equal(state.pushed.find(i => i.id === 'color-studio-hex').actions[0].payload.text, '#663399')

  await mod.onFeatureTriggered('color-studio', '')
  assert.ok(state.pushed.some(i => i.id === 'color-studio-guide'))
  assert.ok(state.pushed.some(i => i.id === 'color-studio-starter-0'))

  await mod.onFeatureTriggered('color-studio', 'color not-a-valid-color-xyz')
  assert.equal(state.pushed.length, 1)
  assert.equal(state.pushed[0].id, 'color-studio-unparsed')
})

test('composites semi-transparent foreground over background for WCAG contrast', async () => {
  const { mod, state } = setupHarness()

  // 50% black over white composites to #808080, whose WCAG contrast on #FFFFFF is ~3.95:1 (AA Large, fails AA Normal)
  await mod.onFeatureTriggered('color-studio', 'contrast rgba(0,0,0,0.5) #ffffff')
  const summary = state.pushed.find(i => i.id === 'color-studio-contrast-summary')
  assert.ok(summary)
  const ratio = Number(/WCAG ([\d.]+):1/.exec(summary.title)[1])
  assert.ok(ratio > 3.8 && ratio < 4.1, `expected composited ratio near 3.95, got ${ratio}`)
  assert.match(summary.title, /AA Large/)
})
