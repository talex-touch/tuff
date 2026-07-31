const assert = require('node:assert/strict')
const test = require('node:test')

class FakeBuilder {
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

function loadPlugin(options = {}) {
  const state = {
    channelCalls: [],
    clipboardWrites: [],
    files: options.files || new Map(),
    items: [],
    logs: [],
  }
  globalThis.plugin = {
    storage: {
      async getFile(name) {
        return state.files.get(name) ?? null
      },
      async setFile(name, value) {
        state.files.set(name, value)
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
  globalThis.clipboard = options.clipboard || {
    async readText() {
      return state.clipboardWrites.at(-1) || ''
    },
    async writeText(value) {
      state.clipboardWrites.push(value)
    },
  }
  globalThis.touchChannel = options.touchChannel || {
    async send(operation, payload) {
      state.channelCalls.push({ operation, payload })
      throw new Error(`unexpected operation: ${operation}`)
    },
  }
  globalThis.logger = {
    error(...values) {
      state.logs.push(values)
    },
  }
  globalThis.TuffItemBuilder = FakeBuilder
  delete require.cache[require.resolve('./index.js')]
  const plugin = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { plugin, state }
}

function actionItem(items, actionId) {
  const item = items.find(entry => entry.actions.some(action => action.id === actionId))
  if (!item)
    throw new Error(`missing action item: ${actionId}`)
  return item
}

test('onInit creates the bounded plugin store through the awaited storage facade', async () => {
  const { plugin, state } = loadPlugin()

  await plugin.onInit()

  assert.deepEqual(state.files.get('snippets.json'), {
    snippets: [
      {
        id: 'welcome',
        type: 'text',
        title: 'Welcome',
        language: '',
        content: 'Welcome to Touch Snippets.',
        tags: ['welcome'],
        createdAt: 0,
        updatedAt: 0,
        useCount: 0,
      },
    ],
  })
})

test('save, search and copy use only storage, feature-item and clipboard facades', async () => {
  const { plugin, state } = loadPlugin()
  await plugin.onInit()
  await plugin.onFeatureTriggered('snippets-save', { text: 'Reusable answer' })

  assert.deepEqual(await plugin.onItemAction(actionItem(state.items, 'save')), {
    externalAction: true,
    status: 'started',
  })
  assert.equal(state.files.get('snippets.json').snippets.length, 2)

  await plugin.onFeatureTriggered('snippets-search', { text: 'Reusable' })
  assert.deepEqual(await plugin.onItemAction(actionItem(state.items, 'copy')), {
    externalAction: true,
    status: 'started',
  })
  assert.deepEqual(state.clipboardWrites, ['Reusable answer'])
})

test('clipboard placeholders are resolved through the host read capability before write', async () => {
  const files = new Map([
    ['snippets.json', {
      snippets: [{ id: 'template', title: 'Template', content: 'before {{clipboard}} after', tags: [] }],
    }],
  ])
  const writes = []
  const { plugin, state } = loadPlugin({
    files,
    clipboard: {
      async readText() {
        return 'HOST VALUE'
      },
      async writeText(value) {
        writes.push(value)
      },
    },
  })
  await plugin.onFeatureTriggered('snippets-search', { text: 'Template' })

  assert.deepEqual(await plugin.onItemAction(actionItem(state.items, 'copy')), {
    externalAction: true,
    status: 'started',
  })
  assert.deepEqual(writes, ['before HOST VALUE after'])
})

test('clipboard permission denial is stable and redacted', async () => {
  const { plugin, state } = loadPlugin({
    clipboard: {
      async writeText() {
        throw Object.assign(new Error('/private/clipboard denied'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      },
    },
  })
  await plugin.onInit()
  await plugin.onFeatureTriggered('snippets-search', { text: 'Welcome' })

  const result = await plugin.onItemAction(actionItem(state.items, 'copy'))

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
    message: '缺少执行此操作所需的权限',
  })
  assert.deepEqual(state.logs, [['[touch-snippets] Action failed']])
  assert.doesNotMatch(JSON.stringify(result), /private|clipboard denied/)
})

test('CloudShare operations use fixed host-owned request/reply payloads without credentials', async () => {
  const files = new Map([
    ['snippets.json', {
      snippets: [
        { id: 'safe', title: 'Safe', content: 'hello', tags: [] },
        { id: 'secret', title: 'Secret', content: 'api_key = hidden', tags: [] },
      ],
    }],
  ])
  let state
  const touchChannel = {
    async send(operation, payload) {
      state.channelCalls.push({ operation, payload })
      if (operation === 'snippets.cloud.list') {
        return {
          packages: [{ id: 'pack-1', title: 'Shared pack', summary: 'fixture' }],
          total: 1,
          limit: 10,
          offset: 0,
        }
      }
      if (operation === 'snippets.cloud.publish')
        return { package: { id: 'published' } }
      if (operation === 'snippets.cloud.install') {
        return {
          installed: true,
          package: {
            id: 'pack-1',
            contentInline: {
              format: 'tuff.snippet-pack+json',
              snippets: [{ id: 'cloud', title: 'Cloud', content: 'cloud text', tags: [] }],
            },
          },
        }
      }
      throw new Error(`unexpected operation: ${operation}`)
    },
  }
  const harness = loadPlugin({ files, touchChannel })
  state = harness.state
  await harness.plugin.onInit()
  await harness.plugin.onFeatureTriggered('snippets-manage', { text: '' })

  await harness.plugin.onItemAction(actionItem(state.items, 'cloud-list'))
  await harness.plugin.onItemAction(actionItem(state.items, 'cloud-install'))
  await harness.plugin.onFeatureTriggered('snippets-manage', { text: '' })
  await harness.plugin.onItemAction(actionItem(state.items, 'cloud-publish'))

  assert.deepEqual(state.channelCalls.map(call => call.operation), [
    'snippets.cloud.list',
    'snippets.cloud.install',
    'snippets.cloud.publish',
  ])
  assert.deepEqual(state.channelCalls[0].payload, { limit: 10 })
  assert.deepEqual(state.channelCalls[1].payload, { packageId: 'pack-1' })
  const publish = state.channelCalls[2].payload
  assert.equal(publish.visibility, 'public')
  assert.equal(publish.pack.format, 'tuff.snippet-pack+json')
  assert.equal(publish.pack.pluginId, 'touch-snippets')
  assert.deepEqual(publish.pack.snippets.map(snippet => snippet.id), ['safe', 'cloud'])
  assert.equal(publish.pack.skippedSensitiveCount, 1)
  assert.doesNotMatch(JSON.stringify(state.channelCalls), /authorization|bearer|hidden/i)
})

test('network denial does not mutate storage and returns a stable result', async () => {
  const { plugin, state } = loadPlugin({
    touchChannel: {
      async send() {
        throw Object.assign(new Error('/private/network denied'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      },
    },
  })
  await plugin.onInit()
  await plugin.onFeatureTriggered('snippets-manage', { text: '' })
  const before = JSON.stringify(state.files.get('snippets.json'))

  const result = await plugin.onItemAction(actionItem(state.items, 'cloud-list'))

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
  assert.equal(JSON.stringify(state.files.get('snippets.json')), before)
  assert.doesNotMatch(JSON.stringify(result), /private|network denied/)
})

test('feature publication awaits clear before push', async () => {
  let releaseClear
  let pushed = false
  const clearBarrier = new Promise((resolve) => {
    releaseClear = resolve
  })
  const { plugin } = loadPlugin({
    feature: {
      clearItems: () => clearBarrier,
      async pushItems() {
        pushed = true
      },
    },
  })

  const pending = plugin.onFeatureTriggered('snippets-search', { text: 'Welcome' })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(pushed, false)
  releaseClear()
  assert.equal(await pending, true)
  assert.equal(pushed, true)
})
