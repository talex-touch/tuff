const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const state = {
  items: [],
  reads: 0,
  applies: [],
  snapshot: { status: 'ready', entries: [], revision: 'r1' },
  applyResult: { status: 'started' },
}

class FakeBuilder {
  constructor(id) {
    this.item = { id }
    this.basic = {}
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(value) {
    this.basic.title = value
    return this
  }

  setSubtitle(value) {
    this.basic.subtitle = value
    return this
  }

  setIcon(value) {
    this.basic.icon = value
    return this
  }

  setMeta(value) {
    this.item.meta = value
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions = [...(this.item.actions || []), { id, type, label, payload }]
    return this
  }

  build() {
    return { ...this.item, render: { mode: 'default', basic: this.basic } }
  }
}

globalThis.plugin = {
  feature: {
    async clearItems() {
      state.items = []
    },
    async pushItems(items) {
      state.items = items
    },
  },
}
globalThis.logger = { error() {}, info() {} }
globalThis.TuffItemBuilder = FakeBuilder
globalThis.plugin.hosts = {
  async read() {
    state.reads += 1
    return state.snapshot
  },
  async apply(request) {
    state.applies.push(request)
    return state.applyResult
  },
}

const filename = path.join(__dirname, 'index.js')
const source = fs.readFileSync(filename, 'utf8')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(__dirname)
loaded._compile(source, filename)
const pluginModule = loaded.exports

function reset() {
  state.items = []
  state.reads = 0
  state.applies = []
  state.snapshot = { status: 'ready', entries: [], revision: 'r1' }
  state.applyResult = { status: 'started' }
  globalThis.plugin.feature.clearItems = async () => {
    state.items = []
  }
  globalThis.plugin.feature.pushItems = async (items) => {
    state.items = items
  }
  globalThis.plugin.hosts = {
    async read() {
      state.reads += 1
      return state.snapshot
    },
    async apply(request) {
      state.applies.push(request)
      return state.applyResult
    },
  }
}

test.beforeEach(() => {
  reset()
  pluginModule.onInit()
})

test('manifest has a file icon, push provider, and matching commands', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  assert.equal(manifest.icon.type, 'file')
  assert.equal(manifest.features[0].push, true)
  assert.equal(manifest.searchProviders[0].featureId, manifest.features[0].id)
  assert.ok(manifest.features[0].commands.length > 0)
  assert.equal(manifest.permissions.required.includes('fs.read'), true)
})

test('Prelude exposes no raw privileged runtime surface', () => {
  assert.doesNotMatch(source, /globalThis\.hosts/)
  for (const pattern of [
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /\bnode:(?:fs|child_process|net|http|https)\b/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /(?:^|[^.\w])(?:command|executable|args|cwd|env|url|script)\s*:/m,
  ])
    assert.doesNotMatch(source, pattern)
})

test('empty and keyword queries read and project only matching safe entries', async () => {
  state.snapshot = {
    status: 'ready',
    revision: 'rev-2',
    entries: [
      { hostname: 'api.example.com', addresses: ['127.0.0.1'], comment: 'local API' },
      { hostname: 'cdn.example.com', addresses: ['2001:db8::1'] },
      { hostname: 'localhost', addresses: ['127.0.0.1'] },
      { hostname: 'bad.example.com', addresses: ['not-an-ip'] },
      { hostname: 'broadcast.example.com', addresses: ['255.255.255.255'] },
      { hostname: 'malformed.example.com', addresses: ['1::2::3'] },
    ],
  }
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  assert.equal(state.reads, 1)
  assert.equal(state.items.length, 2)
  assert.deepEqual(
    state.items.map(item => item.render.basic.title),
    ['api.example.com', 'cdn.example.com'],
  )

  await pluginModule.onFeatureTriggered('hosts', { text: 'cdn' })
  assert.equal(state.reads, 2)
  assert.deepEqual(
    state.items.map(item => item.render.basic.title),
    ['cdn.example.com'],
  )
})

test('unavailable and degraded facades remain visibly degraded', async () => {
  globalThis.plugin.hosts = undefined
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  assert.match(state.items[0].render.basic.title, /不可用/)
  assert.match(state.items[0].render.basic.subtitle, /Hosts/)

  globalThis.plugin.hosts = {
    async read() {
      return { status: 'degraded', reason: 'permission-denied' }
    },
  }
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  assert.match(state.items[0].render.basic.title, /degraded/)
  assert.match(state.items[0].render.basic.subtitle, /权限/)
})

test('explicit upsert and remove actions map to stable host results', async () => {
  state.snapshot = {
    status: 'ready',
    revision: 'r5',
    entries: [{ hostname: 'api.example.com', addresses: ['192.0.2.10'] }],
  }
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  const item = JSON.parse(JSON.stringify(state.items[0]))
  assert.deepEqual(item.source, { type: 'plugin', id: 'plugin-features', name: 'touch-hosts' })
  assert.deepEqual(item.meta, { pluginName: 'touch-hosts', featureId: 'hosts', defaultAction: 'hosts.upsert' })
  assert.deepEqual(
    item.actions.map(action => [action.id, action.type]),
    [
      ['hosts.upsert', 'plugin'],
      ['hosts.remove', 'plugin'],
    ],
  )

  const accepted = await pluginModule.onItemAction(item)
  assert.deepEqual(accepted, { externalAction: true, success: true, status: 'started' })
  assert.deepEqual(state.applies[0], {
    operation: 'upsert',
    hostname: 'api.example.com',
    addresses: ['192.0.2.10'],
    expectedRevision: 'r5',
  })

  state.applyResult = { status: 'blocked', reason: 'confirmation-denied' }
  const denied = await pluginModule.onItemAction(item, { actionId: 'hosts.remove' })
  assert.equal(denied.success, false)
  assert.equal(denied.reason, 'confirmation-denied')
  assert.equal(state.applies.length, 2)

  await pluginModule.onFeatureTriggered('hosts')
  assert.deepEqual(await pluginModule.onItemAction(item), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
})

test('host mutations admit the 16-address Prelude boundary and reject 17 before facade apply', async () => {
  const legalAddresses = Array.from({ length: 16 }, (_, index) => `198.51.100.${index + 1}`)
  state.snapshot = { status: 'ready', entries: [], revision: 'r16' }

  await pluginModule.onFeatureTriggered('hosts', {
    text: `set ${legalAddresses.join(',')} boundary.example.com`,
  })
  const boundaryItem = JSON.parse(JSON.stringify(state.items[0]))
  assert.deepEqual(boundaryItem.actions[0].payload.addresses, legalAddresses)
  assert.deepEqual(await pluginModule.onItemAction(boundaryItem), {
    externalAction: true,
    success: true,
    status: 'started',
  })
  assert.deepEqual(state.applies, [
    {
      operation: 'upsert',
      hostname: 'boundary.example.com',
      addresses: legalAddresses,
      expectedRevision: 'r16',
    },
  ])

  await pluginModule.onFeatureTriggered('hosts', {
    text: `set ${[...legalAddresses, '198.51.100.17'].join(',')} rejected.example.com`,
  })
  assert.deepEqual(await pluginModule.onItemAction(state.items[0]), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(state.applies.length, 1)
})

test('forged identity, action, payload, and mutable items cannot invoke apply', async () => {
  state.snapshot = {
    status: 'ready',
    revision: 'r5',
    entries: [{ hostname: 'api.example.com', addresses: ['192.0.2.10'] }],
  }
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  const item = JSON.parse(JSON.stringify(state.items[0]))

  const foreign = { ...item, meta: { ...item.meta, featureId: 'other' } }
  assert.deepEqual(await pluginModule.onItemAction(foreign, { actionId: 'hosts.upsert' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-feature',
  })
  const missingMeta = { ...item }
  delete missingMeta.meta
  assert.deepEqual(await pluginModule.onItemAction(missingMeta, { actionId: 'hosts.upsert' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-feature',
  })
  const foreignSource = { ...item, source: { ...item.source, id: 'foreign-source' } }
  assert.deepEqual(await pluginModule.onItemAction(foreignSource, { actionId: 'hosts.upsert' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-item',
  })
  assert.deepEqual(await pluginModule.onItemAction(item, { actionId: 'hosts.execute' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  const mutated = {
    ...item,
    actions: item.actions.map(action =>
      action.id === 'hosts.upsert'
        ? { ...action, payload: { ...action.payload, hostname: 'evil.example.com', secret: 'do-not-send' } }
        : action,
    ),
  }
  assert.deepEqual(await pluginModule.onItemAction(mutated, { actionId: 'hosts.upsert' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  item.actions[0].payload.hostname = 'evil.example.com'
  assert.deepEqual(await pluginModule.onItemAction(item, { actionId: 'hosts.upsert' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.deepEqual(state.applies, [])
})

test('sensitive comments and host errors are not leaked', async () => {
  state.snapshot = {
    status: 'ready',
    entries: [
      {
        hostname: 'safe.example.com',
        addresses: ['203.0.113.7'],
        comment: 'secret=super-secret /Users/alice/private.env',
      },
    ],
  }
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  const rendered = JSON.stringify(state.items)
  assert.doesNotMatch(rendered, /super-secret|\/Users\/alice|private\.env/)

  state.applyResult = { status: 'failed', reason: 'backup-failed /Users/alice/private.env' }
  const result = await pluginModule.onItemAction(state.items[0], { actionId: 'hosts.upsert' })
  assert.equal(result.reason, 'backup-failed')
  assert.doesNotMatch(JSON.stringify(result), /Users|private\.env/)
})

test('publication failures return false without escaping or retaining actions', async () => {
  state.snapshot = {
    status: 'ready',
    revision: 'r5',
    entries: [{ hostname: 'api.example.com', addresses: ['192.0.2.10'] }],
  }
  globalThis.plugin.feature.pushItems = async () => {
    throw new Error('renderer unavailable')
  }
  assert.equal(await pluginModule.onFeatureTriggered('hosts', { text: '' }), false)
  assert.deepEqual(state.items, [])
})

test('destroy invalidates every issued Hosts mutation token', async () => {
  state.snapshot = {
    status: 'ready',
    revision: 'r5',
    entries: [{ hostname: 'api.example.com', addresses: ['192.0.2.10'] }],
  }
  await pluginModule.onFeatureTriggered('hosts', { text: '' })
  const item = JSON.parse(JSON.stringify(state.items[0]))
  pluginModule.onDestroy()
  assert.deepEqual(await pluginModule.onItemAction(item, { actionId: 'hosts.upsert' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.deepEqual(state.applies, [])
})
test('foreign feature never reads facade', async () => {
  const result = await pluginModule.onFeatureTriggered('other', { text: 'hosts' })
  assert.equal(result, false)
  assert.equal(state.reads, 0)
})
