const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

function loadFreshPluginModule() {
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

globalThis.plugin = { feature: { async clearItems() {}, async pushItems() {} } }
globalThis.clipboard = {}
globalThis.logger = {}
globalThis.TuffItemBuilder = class {
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

const pluginModule = loadFreshPluginModule()

function copyItem(payload = 'dev result') {
  return {
    meta: { defaultAction: 'copy' },
    actions: [{ id: 'copy', type: 'plugin', payload: { text: payload } }],
  }
}

async function triggerAndCollect(input) {
  const pushed = []
  const originalFeature = globalThis.plugin.feature
  globalThis.plugin.feature = {
    async clearItems() {},
    async pushItems(items) {
      pushed.push(...items)
    },
  }
  try {
    const freshPlugin = loadFreshPluginModule()
    await freshPlugin.onFeatureTriggered('dev-utils', { text: input })
    return pushed
  }
  finally {
    globalThis.plugin.feature = originalFeature
  }
}

test('onItemAction attempts the host clipboard capability without a child permission sdk', async () => {
  const writes = []
  const originalPermission = globalThis.permission
  const originalWriteText = globalThis.clipboard.writeText

  delete globalThis.permission
  globalThis.clipboard.writeText = async value => writes.push(value)

  try {
    const freshPlugin = loadFreshPluginModule()
    const result = await freshPlugin.onItemAction(copyItem())

    assert.deepEqual(writes, ['dev result'])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'started')
  }
  finally {
    globalThis.permission = originalPermission
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction blocks copy when clipboard sdk is unavailable', async () => {
  const originalWriteText = globalThis.clipboard.writeText

  delete globalThis.clipboard.writeText

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'clipboard-unavailable')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction returns a stable redacted failure when clipboard write fails', async () => {
  const originalWriteText = globalThis.clipboard.writeText

  globalThis.clipboard.writeText = async () => {
    throw new Error('/private/clipboard down')
  }

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'clipboard-write-failed')
    assert.equal(result.message, '复制失败')
    assert.doesNotMatch(JSON.stringify(result), /private|clipboard down/)
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction maps permission-unavailable, cancelled, timeout and honors context.actionId', async () => {
  const originalWriteText = globalThis.clipboard.writeText
  const cases = [
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED', 'blocked', 'permission-denied'],
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE', 'blocked', 'permission-unavailable'],
    ['PLUGIN_HOST_CAPABILITY_CANCELLED', 'cancelled', 'cancelled'],
    ['PLUGIN_HOST_CAPABILITY_TIMEOUT', 'failed', 'timeout'],
  ]

  try {
    for (const [code, expectedStatus, expectedReason] of cases) {
      globalThis.clipboard.writeText = async () => {
        throw Object.assign(new Error('/private/error'), { code })
      }
      const result = await pluginModule.onItemAction(copyItem('secret'), { actionId: 'copy' })
      assert.equal(result.status, expectedStatus)
      assert.equal(result.reason, expectedReason)
    }

    const writes = []
    globalThis.clipboard.writeText = async value => writes.push(value)
    const multiItem = {
      meta: { defaultAction: 'copy' },
      actions: [
        { id: 'copy', type: 'plugin', payload: { text: 'first' } },
        { id: 'copy-secondary', type: 'plugin', payload: { text: 'second' } },
      ],
    }
    const secondary = await pluginModule.onItemAction(multiItem, { actionId: 'copy-secondary' })
    assert.equal(secondary.status, 'started')
    assert.deepEqual(writes, ['second'])

    const invalid = await pluginModule.onItemAction(multiItem, { actionId: 'missing' })
    assert.equal(invalid.status, 'blocked')
    assert.equal(invalid.reason, 'invalid-action')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction copies when the host capability grants the call', async () => {
  const writes = []
  const originalWriteText = globalThis.clipboard.writeText

  globalThis.clipboard.writeText = async value => writes.push(value)

  try {
    const result = await pluginModule.onItemAction(copyItem('ok'))

    assert.deepEqual(writes, ['ok'])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'started')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('escape and unescape round-trip quotes, backslashes, and trailing slashes cleanly', async () => {
  const samples = [
    'say "hi"',
    'path\\to\\file\\',
    'quote after slash \\"',
    'line1\nline2\t"quoted"\\end',
    '"wrapped"',
  ]

  for (const sample of samples) {
    const escapedItems = await triggerAndCollect(sample)
    const escaped = escapedItems.find(item => item.id === 'dev-utils-escape')?.actions[0]?.payload?.text
    assert.ok(escaped, `expected escaped item for ${sample}`)

    const unescapedItems = await triggerAndCollect(escaped)
    const unescaped = unescapedItems.find(item => item.id === 'dev-utils-unescape')?.actions[0]?.payload?.text
    assert.equal(unescaped, sample)
  }
})

test('restricts timestamps to 10 or 13 digits and ranks parsed results above generic now items', async () => {
  const validSeconds = await triggerAndCollect('1735689600')
  assert.equal(validSeconds[0].id, 'dev-utils-timestamp-seconds')
  const nowIndex = validSeconds.findIndex(item => item.id === 'dev-utils-uuid')
  assert.ok(nowIndex > 0, 'generic now items should appear after parsed results')

  const validMillis = await triggerAndCollect('1735689600000')
  assert.equal(validMillis[0].id, 'dev-utils-timestamp-seconds')

  const elevenDigits = await triggerAndCollect('17000000000')
  assert.equal(elevenDigits.some(item => item.id === 'dev-utils-timestamp-seconds'), false)

  const twelveDigits = await triggerAndCollect('170000000000')
  assert.equal(twelveDigits.some(item => item.id === 'dev-utils-timestamp-seconds'), false)
})

test('onFeatureTriggered awaits clear before publishing results and onDestroy drops stale runs', async () => {
  let releaseClear
  let pushed = false
  const clearBarrier = new Promise((resolve) => {
    releaseClear = resolve
  })
  const originalFeature = globalThis.plugin.feature
  globalThis.plugin.feature = {
    clearItems: () => clearBarrier,
    async pushItems() {
      pushed = true
    },
  }

  try {
    const freshPlugin = loadFreshPluginModule()
    const trigger = freshPlugin.onFeatureTriggered('dev-utils', { text: 'camel case' })
    await Promise.resolve()
    assert.equal(pushed, false)
    releaseClear()
    await trigger
    assert.equal(pushed, true)

    pushed = false
    let releaseStale
    globalThis.plugin.feature.clearItems = () => new Promise((resolve) => {
      releaseStale = resolve
    })
    const staleTrigger = freshPlugin.onFeatureTriggered('dev-utils', { text: 'stale case' })
    await freshPlugin.onDestroy()
    releaseStale()
    await staleTrigger
    assert.equal(pushed, false)
  }
  finally {
    globalThis.plugin.feature = originalFeature
  }
})

test('package.json maintains lint script, sorted key order, and npm metadata parity', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
  const keys = Object.keys(pkg)

  assert.ok(keys.indexOf('version') < keys.indexOf('private'))
  assert.equal(pkg.scripts.lint, 'eslint .')
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.packageManager, 'pnpm@11.24.0')
  assert.ok(pkg.keywords.includes('tuff-plugin'))
  assert.equal(pkg.tuff.id, manifest.id)
  assert.equal(pkg.tuff.name, manifest.name)
})
