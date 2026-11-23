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

  setAccessory(accessory) {
    this.basic.accessory = accessory
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
  const files = new Map(options.files || [])
  const state = { items: [], clipboardWrites: [], logs: [] }
  const plugin = {
    storage: options.storage || {
      async getFile(name) {
        return files.get(name) ?? null
      },
      async setFile(name, value) {
        files.set(name, value)
      },
    },
    feature: options.feature || {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }

  const sandbox = {
    plugin,
    clipboard: 'clipboard' in options
      ? options.clipboard
      : {
          async writeText(text) {
            if (options.clipboardError)
              throw options.clipboardError
            state.clipboardWrites.push(text)
          },
        },
    permission: 'permission' in options
      ? options.permission
      : {
          async check(id) {
            if (options.permissionError)
              throw options.permissionError
            return options.permissionGranted !== false && id === 'clipboard.write'
          },
        },
    logger: {
      warn(...args) { state.logs.push(['warn', ...args]) },
      error(...args) { state.logs.push(['error', ...args]) },
      info(...args) { state.logs.push(['info', ...args]) },
    },
    TuffItemBuilder: FakeBuilder,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox

  const source = readFileSync(require.resolve('./index.js'), 'utf8')
  vm.runInNewContext(source, sandbox, { filename: 'touch-calc-pad/index.js' })
  return { module: sandbox.module.exports, state, files }
}

test('natural percentages: 15% off 249, 249 + 13%, as % of, and % change', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: '15% off 249' })
  assert.equal(h.state.items[0].render.basic.title, '211.65')
  assert.equal(h.state.items[1].render.basic.title, '37.35')

  await h.module.onFeatureTriggered('calc-pad', { text: '249 + 13%' })
  assert.equal(h.state.items[0].render.basic.title, '281.37')

  await h.module.onFeatureTriggered('calc-pad', { text: '249 - 15%' })
  assert.equal(h.state.items[0].render.basic.title, '211.65')

  await h.module.onFeatureTriggered('calc-pad', { text: '45 as % of 180' })
  assert.equal(h.state.items[0].render.basic.title, '25%')

  await h.module.onFeatureTriggered('calc-pad', { text: '% change from 80 to 100' })
  assert.equal(h.state.items[0].render.basic.title, '+25%')
})

test('recursive-descent parser handles precedence, functions, right-assoc power, factorial, and modulo', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: 'sqrt(144) + 2^3^2 - 4!' })
  // 12 + 512 - 24 = 500
  assert.equal(h.state.items[0].actions[0].payload.text, '500')

  await h.module.onFeatureTriggered('calc-pad', { text: '2(3 + 4) + 17 % 5' })
  // 14 + 2 = 16
  assert.equal(h.state.items[0].actions[0].payload.text, '16')

  await h.module.onFeatureTriggered('calc-pad', { text: '0.1 + 0.2' })
  assert.equal(h.state.items[0].render.basic.title, '0.3')

  await h.module.onFeatureTriggered('calc-pad', { text: 'sin(rad(30)) + log10(1000)' })
  assert.equal(h.state.items[0].render.basic.title, '3.5')
})

test('programmer bitwise operations and explicit base conversions', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: '0xff & 0x0f' })
  assert.equal(h.state.items[0].actions[0].payload.text, '15')
  const hexItem = h.state.items.find(i => i.id.endsWith('-hex'))
  const binItem = h.state.items.find(i => i.id.endsWith('-bin'))
  const octItem = h.state.items.find(i => i.id.endsWith('-oct'))
  assert.equal(hexItem.actions[0].payload.text, '0xF')
  assert.equal(binItem.actions[0].payload.text, '0b1111')
  assert.equal(octItem.actions[0].payload.text, '0o17')

  await h.module.onFeatureTriggered('calc-pad', { text: '0xff ^ 0x0f' })
  assert.equal(h.state.items[0].actions[0].payload.text, '240')

  await h.module.onFeatureTriggered('calc-pad', { text: '(1 << 16) - 1' })
  assert.equal(h.state.items[0].actions[0].payload.text, '65535')

  await h.module.onFeatureTriggered('calc-pad', { text: '255 to hex' })
  assert.equal(h.state.items[0].render.basic.title, '0xFF')
  assert.equal(h.state.items.find(i => i.id.endsWith('-bin')).actions[0].payload.text, '0b11111111')
})

test('unit conversions across length, mass, temperature, and SI/IEC data sizes', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: '100 c to f' })
  assert.equal(h.state.items[0].render.basic.title, '212 °F')

  await h.module.onFeatureTriggered('calc-pad', { text: '-40 f to c' })
  assert.equal(h.state.items[0].render.basic.title, '-40 °C')

  await h.module.onFeatureTriggered('calc-pad', { text: '10 km to mi' })
  assert.match(h.state.items[0].render.basic.title, /^6\.21371\d* mi$/)

  await h.module.onFeatureTriggered('calc-pad', { text: '100 kg to lb' })
  assert.match(h.state.items[0].render.basic.title, /^220\.462\d* lb$/)

  await h.module.onFeatureTriggered('calc-pad', { text: '1024 KiB to MiB' })
  assert.equal(h.state.items[0].render.basic.title, '1 MiB')

  await h.module.onFeatureTriggered('calc-pad', { text: '1 GB to MB' })
  assert.equal(h.state.items[0].render.basic.title, '1000 MB')
})

test('transfer time calculator: 2.5 GB at 80 Mbps', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: '2.5 GB at 80 Mbps' })
  assert.equal(h.state.items[0].render.basic.title, '4m 10s')
  assert.equal(h.state.items[1].actions[0].payload.text, '250')
})

test('aspect ratio inspection and proportional scaling', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: '1920x1080' })
  assert.equal(h.state.items[0].render.basic.title, '16:9')
  assert.match(h.state.items[0].render.basic.subtitle, /Full HD 1080p/)
  assert.match(h.state.items[0].render.basic.subtitle, /2\.07 MP/)

  await h.module.onFeatureTriggered('calc-pad', { text: '16:9 at 720h' })
  assert.equal(h.state.items[0].render.basic.title, '1280×720')
  assert.equal(h.state.items[0].actions[0].payload.text, '1280x720')
})

test('date arithmetic: today + 45 days, month clamping, workdays, and date diff', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: 'today + 45 days' })
  assert.match(h.state.items[0].render.basic.title, /^\d{4}-\d{2}-\d{2}$/)

  await h.module.onFeatureTriggered('calc-pad', { text: '2026-01-31 + 1 month' })
  assert.equal(h.state.items[0].render.basic.title, '2026-02-28')

  await h.module.onFeatureTriggered('calc-pad', { text: '2026-01-01 + 10 workdays' })
  // 2026-01-01 is Thu -> +10 workdays = Thu 2026-01-15
  assert.equal(h.state.items[0].render.basic.title, '2026-01-15')

  await h.module.onFeatureTriggered('calc-pad', { text: 'days between 2026-01-01 and 2026-12-31' })
  assert.equal(h.state.items[0].render.basic.title, '364 days')
})

test('history persists in plugin.storage via copy & explicit actionId and clears cleanly', async () => {
  const h = createHarness()
  await h.module.onInit()

  await h.module.onFeatureTriggered('calc-pad', { text: '249 + 13%' })
  const mainItem = h.state.items[0]

  // Honor explicit secondary context.actionId = 'save-history'
  const saveRes = await h.module.onItemAction(mainItem, { actionId: 'save-history' })
  assert.equal(saveRes.success, true)
  assert.equal(h.files.get('calc-history.json').history.length, 1)
  assert.equal(h.files.get('calc-history.json').history[0].result, '281.37')

  // Copy another calculation -> auto-saves to history
  await h.module.onFeatureTriggered('calc-pad', { text: '15% off 249' })
  const copyRes = await h.module.onItemAction(h.state.items[0], { actionId: 'copy-result' })
  assert.equal(copyRes.success, true)
  assert.deepEqual(h.state.clipboardWrites, ['211.65'])
  assert.equal(h.files.get('calc-history.json').history.length, 2)

  // Empty query surfaces history + clear-history button
  await h.module.onFeatureTriggered('calc-pad', { text: '' })
  const clearItem = h.state.items.find(i => i.actions.some(a => a.id === 'clear-history'))
  assert.ok(clearItem)
  const clearRes = await h.module.onItemAction(clearItem, { actionId: 'clear-history' })
  assert.equal(clearRes.success, true)
  assert.equal(h.files.get('calc-history.json').history.length, 0)
})

test('clipboard copy fails closed on permission-denied, permission-sdk-unavailable, permission-check-failed, and missing clipboard', async () => {
  // 1. permission denied
  const denied = createHarness({ permissionGranted: false })
  await denied.module.onFeatureTriggered('calc-pad', { text: '2 + 2' })
  const res1 = await denied.module.onItemAction(denied.state.items[0], { actionId: 'copy-result' })
  assert.equal(res1.status, 'blocked')
  assert.equal(res1.reason, 'permission-denied')
  assert.equal(denied.state.clipboardWrites.length, 0)

  // 2. permission SDK missing
  const noSdk = createHarness({ permission: undefined })
  await noSdk.module.onFeatureTriggered('calc-pad', { text: '2 + 2' })
  const res2 = await noSdk.module.onItemAction(noSdk.state.items[0], { actionId: 'copy-result' })
  assert.equal(res2.status, 'blocked')
  assert.equal(res2.reason, 'permission-sdk-unavailable')
  assert.equal(noSdk.state.clipboardWrites.length, 0)

  // 3. permission check throws
  const checkErr = createHarness({ permissionError: new Error('ipc down') })
  await checkErr.module.onFeatureTriggered('calc-pad', { text: '2 + 2' })
  const res3 = await checkErr.module.onItemAction(checkErr.state.items[0], { actionId: 'copy-result' })
  assert.equal(res3.status, 'blocked')
  assert.equal(res3.reason, 'permission-check-failed')

  // 4. clipboard facade missing
  const noClip = createHarness({ clipboard: undefined })
  await noClip.module.onFeatureTriggered('calc-pad', { text: '2 + 2' })
  const res4 = await noClip.module.onItemAction(noClip.state.items[0], { actionId: 'copy-result' })
  assert.equal(res4.status, 'blocked')
  assert.equal(res4.reason, 'clipboard-unavailable')

  // 5. invalid actionId
  const res5 = await denied.module.onItemAction(denied.state.items[0], { actionId: 'non-existent' })
  assert.equal(res5.status, 'blocked')
  assert.equal(res5.reason, 'invalid-action')
})

test('trigger generation guard prevents stale async load from overwriting newer results', async () => {
  let releaseFirst
  const firstRead = new Promise((resolve) => { releaseFirst = resolve })
  let calls = 0
  const h = createHarness({
    storage: {
      async getFile() {
        calls += 1
        if (calls === 1)
          return firstRead
        return { version: 1, history: [] }
      },
      async setFile() {},
    },
  })

  const slowTrigger = h.module.onFeatureTriggered('calc-pad', { text: '' })
  await Promise.resolve()
  await h.module.onFeatureTriggered('calc-pad', { text: '6 * 7' })
  assert.equal(h.state.items[0].render.basic.title, '42')

  releaseFirst({ version: 1, history: [{ expression: 'old', result: '999', timestamp: 1 }] })
  await slowTrigger
  // Newer trigger result '42' must remain intact
  assert.equal(h.state.items[0].render.basic.title, '42')
})

test('onDestroy blocks subsequent triggers and actions cleanly', async () => {
  const h = createHarness()
  await h.module.onFeatureTriggered('calc-pad', { text: '1 + 1' })
  const item = h.state.items[0]

  h.module.onDestroy()
  assert.equal(await h.module.onFeatureTriggered('calc-pad', { text: '3 + 3' }), false)
  const actRes = await h.module.onItemAction(item, { actionId: 'copy-result' })
  assert.equal(actRes.status, 'blocked')
  assert.equal(actRes.reason, 'cancelled')
})

test('rejects division by zero and excessive nesting without crashing', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('calc-pad', { text: '10 / 0' })
  assert.equal(h.state.items[0].id, 'calc-pad-parse-hint')
  assert.match(h.state.items[0].render.basic.subtitle, /Division by zero/)

  const deep = `${'('.repeat(80)}1${')'.repeat(80)}`
  await h.module.onFeatureTriggered('calc-pad', { text: deep })
  assert.equal(h.state.items[0].id, 'calc-pad-parse-hint')
})
