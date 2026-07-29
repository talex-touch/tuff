const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const WORKSPACE_TOKEN = 'ws_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const SCRIPT_TOKEN = 'wss_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

class TestTuffItemBuilder {
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

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

const state = {
  items: [],
  calls: [],
  runResult: null,
}

globalThis.logger = { error() {} }
globalThis.TuffItemBuilder = TestTuffItemBuilder
globalThis.plugin = {
  getLocale() {
    return 'en-US'
  },
  feature: {
    async clearItems() {
      state.calls.push({ operation: 'clear' })
      state.items = []
    },
    async pushItems(items) {
      state.calls.push({ operation: 'push' })
      state.items = items
    },
  },
  workspaceScripts: {
    async select() {
      state.calls.push({ operation: 'select' })
      return {
        operation: 'select-workspace',
        status: 'selected',
        workspace: { token: WORKSPACE_TOKEN, name: 'fixture' },
      }
    },
    async list(workspaceToken) {
      state.calls.push({ operation: 'list', workspaceToken })
      return {
        operation: 'list-scripts',
        status: 'available',
        workspace: { token: WORKSPACE_TOKEN, name: 'fixture' },
        scripts: [{ token: SCRIPT_TOKEN, name: 'lint' }],
      }
    },
    async run(scriptToken) {
      state.calls.push({ operation: 'run', scriptToken })
      return state.runResult || {
        operation: 'run-script',
        status: 'started',
        scriptName: 'lint',
      }
    },
  },
}

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const pluginModule = loadPluginModule(path.join(__dirname, 'index.js'))

test.beforeEach(async () => {
  state.items = []
  state.calls = []
  state.runResult = null
  await pluginModule.onDestroy()
})

test('selects a workspace, lists scripts and publishes only opaque token actions in awaited order', async () => {
  await pluginModule.onFeatureTriggered('workspace-scripts', '')
  const selectItem = state.items.find(item => item.meta.defaultAction === 'select-workspace')
  assert.ok(selectItem)

  const result = await pluginModule.onItemAction(selectItem, { actionId: 'select-workspace' })
  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'completed',
  })
  assert.deepEqual(
    state.calls.map(call => call.operation),
    ['clear', 'push', 'select', 'list', 'clear', 'push'],
  )
  const scriptItem = state.items.find(item => item.title === 'lint')
  assert.ok(scriptItem)
  assert.deepEqual(scriptItem.actions, [
    {
      id: 'run-script',
      type: 'plugin',
      label: 'Run',
      payload: { scriptToken: SCRIPT_TOKEN },
    },
  ])
  const serialized = JSON.stringify(state.items)
  assert.doesNotMatch(serialized, /eslint|vitest|command|cwd|packagePath|executable|args|env/i)
  assert.equal(state.items.every(item => item.icon.type === 'class'), true)
})

test('runs only the selected opaque script token', async () => {
  await pluginModule.onFeatureTriggered('workspace-scripts', '')
  const selectItem = state.items.find(item => item.meta.defaultAction === 'select-workspace')
  await pluginModule.onItemAction(selectItem, { actionId: 'select-workspace' })
  const scriptItem = state.items.find(item => item.title === 'lint')
  const result = await pluginModule.onItemAction(scriptItem, { actionId: 'run-script' })

  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'started',
  })
  assert.deepEqual(state.calls.at(-1), { operation: 'run', scriptToken: SCRIPT_TOKEN })
})

test('rejects malformed action payloads before capability dispatch', async () => {
  const result = await pluginModule.onItemAction(
    {
      meta: { defaultAction: 'run-script' },
      actions: [
        {
          id: 'run-script',
          payload: { scriptToken: SCRIPT_TOKEN, command: 'rm -rf /', cwd: '/private' },
        },
      ],
    },
    { actionId: 'run-script' },
  )
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'invalid-action')
  assert.equal(state.calls.some(call => call.operation === 'run'), false)
})

test('keeps permission, cancellation and token failures stable and redacted', async () => {
  await pluginModule.onFeatureTriggered('workspace-scripts', '')
  const selectItem = state.items.find(item => item.meta.defaultAction === 'select-workspace')
  await pluginModule.onItemAction(selectItem, { actionId: 'select-workspace' })
  const scriptItem = state.items.find(item => item.title === 'lint')
  state.runResult = {
    operation: 'run-script',
    status: 'blocked',
    reason: 'token-expired',
  }
  const expired = await pluginModule.onItemAction(scriptItem, { actionId: 'run-script' })
  assert.deepEqual(expired, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'token-expired',
  })
  assert.doesNotMatch(JSON.stringify(expired), /path|command|stack|key/i)
})

test('production Prelude contains no privileged, reflective or test-only surface', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bchild_process\b/,
    /\bsafe-shell\b/,
    /\bspawn\s*\(/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bnode:(?:fs|path|process)\b/,
    /\bfetch\s*\(/,
    /\bworkspacePath\b/,
    /\bcommands\b/,
    /\bcwd\b/,
    /\bexecutable\b/,
    /\bopenFolder\b/,
    /\bshowOpenDialog\b/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
})
