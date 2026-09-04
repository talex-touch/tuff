const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

class Builder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(value) {
    this.item.title = value
    return this
  }

  setSubtitle(value) {
    this.item.subtitle = value
    return this
  }

  setIcon(value) {
    this.item.icon = value
    return this
  }

  setMeta(value) {
    this.item.meta = { ...this.item.meta, ...value }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

const state = { items: [], calls: [], snapshot: null, openResult: { status: 'started' } }
const clone = value => JSON.parse(JSON.stringify(value))
globalThis.TuffItemBuilder = Builder
globalThis.plugin = {
  feature: {
    async clearItems() {
      state.calls.push('clear')
      state.items = []
    },
    async pushItems(items) {
      state.calls.push('push')
      state.items = items
    },
  },
  orca: {
    async snapshot() {
      state.calls.push('snapshot')
      return state.snapshot
    },
    async open() {
      state.calls.push('open')
      return state.openResult
    },
  },
}

function loadPlugin() {
  const filename = path.join(__dirname, 'index.js')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(__dirname)
  mod._compile(fs.readFileSync(filename, 'utf8'), filename)
  return mod.exports
}
const lifecycle = loadPlugin()

test.beforeEach(() => {
  state.items = []
  state.calls = []
  state.snapshot = {
    status: 'ready',
    workspaces: 2,
    terminals: 1,
    tasks: 3,
    tasksAvailable: true,
    title: 'healthy',
  }
  state.openResult = { status: 'started' }
  globalThis.plugin.orca = {
    async snapshot() {
      state.calls.push('snapshot')
      return state.snapshot
    },
    async open() {
      state.calls.push('open')
      return state.openResult
    },
  }
})

test('publishes a bounded snapshot with an explicit plugin open action', async () => {
  assert.equal(await lifecycle.onFeatureTriggered('orca'), true)
  assert.deepEqual(state.calls, ['snapshot', 'clear', 'push'])
  const item = state.items[0]
  assert.deepEqual(item.source, { type: 'plugin', id: 'touch-orca', name: 'Orca' })
  assert.equal(item.icon.type, 'file')
  assert.deepEqual(item.meta, { defaultAction: 'open', featureId: 'orca' })
  assert.equal(item.actions[0].id, 'open')
  assert.equal(item.actions[0].type, 'plugin')
  assert.match(item.actions[0].payload.actionToken, /^[0-9a-f-]{36}$/i)
  assert.equal(item.subtitle, 'workspaces 2 · terminals 1 · tasks 3 · healthy')
})

test('renders unavailable tasks and rejects ready snapshots missing availability', async () => {
  state.snapshot = {
    status: 'ready',
    workspaces: 2,
    terminals: 1,
    tasks: 0,
    tasksAvailable: false,
  }
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'workspaces 2 · terminals 1 · tasks unavailable')

  state.snapshot = { status: 'ready', workspaces: 2, terminals: 1, tasks: 0 }
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'invalid-response')
})

test('opens serialized canonical item and rejects stale or foreign action context', async () => {
  await lifecycle.onFeatureTriggered('orca')
  const item = clone(state.items[0])
  assert.deepEqual(await lifecycle.onItemAction(item), { externalAction: true, status: 'started' })
  assert.equal(state.calls.at(-1), 'open')

  const altered = clone(item)
  altered.actions[0].payload.actionToken = '00000000-0000-0000-0000-000000000000'
  assert.deepEqual(await lifecycle.onItemAction(altered), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })
  const foreignSource = clone(item)
  foreignSource.source.id = 'foreign-source'
  assert.equal(await lifecycle.onItemAction(foreignSource), undefined)
  const foreignMeta = clone(item)
  foreignMeta.meta.featureId = 'foreign-feature'
  assert.equal(await lifecycle.onItemAction(foreignMeta), undefined)

  await lifecycle.onFeatureTriggered('orca')

  assert.deepEqual(await lifecycle.onItemAction(item), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(state.calls.filter(call => call === 'open').length, 1)
})
test('preserves the host open-failed result', async () => {
  state.openResult = { status: 'failed', reason: 'open-failed' }
  await lifecycle.onFeatureTriggered('orca')
  assert.deepEqual(await lifecycle.onItemAction(state.items[0], { actionId: 'open' }), {
    externalAction: true,
    status: 'failed',
    reason: 'open-failed',
  })
})

test('rejects a forged payload and never calls open', async () => {
  await lifecycle.onFeatureTriggered('orca')
  const item = state.items[0]
  item.actions[0].payload = {
    actionToken: '00000000-0000-0000-0000-000000000000',
    command: 'launch',
    path: '/private/secret',
  }
  const result = await lifecycle.onItemAction(item)
  assert.deepEqual(result, { externalAction: true, status: 'blocked', reason: 'invalid-action' })
  assert.equal(state.calls.includes('open'), false)
})

test('degrades safely for missing, unsupported, and sensitive host data', async () => {
  globalThis.plugin.orca = undefined
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'capability-unavailable')
  globalThis.plugin.orca = {
    async snapshot() {
      return { status: 'degraded', reason: 'permission-denied' }
    },
  }
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'permission-denied')
  globalThis.plugin.orca = {
    async snapshot() {
      return { status: 'unsupported', reason: 'platform-unsupported' }
    },
  }
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'platform-unsupported')
  globalThis.plugin.orca = {
    async snapshot() {
      return {
        status: 'ready',
        workspaces: 1,
        terminals: 0,
        tasks: 1,
        tasksAvailable: true,
        title: 'token: hidden',
      }
    },
  }
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'workspaces 1 · terminals 0 · tasks 1')
  assert.doesNotMatch(`${state.items[0].title} ${state.items[0].subtitle}`, /token|hidden/i)
})

test('maps unavailable permission infrastructure to a stable reason', async () => {
  globalThis.plugin.orca = {
    async snapshot() {
      throw Object.assign(new Error('permission unavailable'), {
        code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
      })
    },
  }
  await lifecycle.onFeatureTriggered('orca')
  assert.equal(state.items[0].subtitle, 'permission-unavailable')
})

test('rejects foreign features', async () => {
  assert.equal(await lifecycle.onFeatureTriggered('other'), false)
  assert.deepEqual(state.calls, [])
})

test('destroy invalidates every issued Orca action token', async () => {
  await lifecycle.onFeatureTriggered('orca')
  const item = clone(state.items[0])
  lifecycle.onDestroy()
  assert.deepEqual(await lifecycle.onItemAction(item, { actionId: 'open' }), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(state.calls.includes('open'), false)
})
test('production Prelude has no privileged runtime surface', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  for (const pattern of [
    /\brequire\s*\(/,
    /\bchild_process\b/,
    /\bfetch\s*\(/,
    /\bprocess\s*[.[]/,
    /\b(?:ipcMain|ipcRenderer|channel\.raw)\b/,
  ])
    assert.doesNotMatch(source, pattern)
})
