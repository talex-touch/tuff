const assert = require('node:assert/strict')
const test = require('node:test')

const published = []
const opened = []
let projects = [
  {
    token: 'vsp_11111111111111111111111111111111',
    label: 'Alpha',
    kind: 'folder',
    lastOpenedAt: '2026-09-01T10:00:00Z',
    path: '/Users/private/alpha',
  },
  {
    token: 'vsp_22222222222222222222222222222222',
    label: 'Beta Workspace',
    kind: 'workspace',
    path: '/Users/private/beta.code-workspace',
  },
  { token: 'vsp_33333333333333333333333333333333', label: 'Notes', kind: 'file', path: '/Users/private/notes.txt' },
]
const clone = value => JSON.parse(JSON.stringify(value))

globalThis.plugin = {
  vscodeProjects: {
    async list() {
      return { status: 'ready', projects }
    },
    async open(token) {
      opened.push(token)
      return { status: 'started' }
    },
  },
  feature: {
    async clearItems() {
      published.push({ type: 'clear' })
    },
    async pushItems(items) {
      published.push({ type: 'push', items })
    },
  },
}
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, actions: [], meta: {} }
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
    Object.assign(this.item.meta, value)
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
const plugin = require('./index.js')

const lastItems = () => published.at(-1).items

test('lists projects without paths and filters by label and kind', async () => {
  published.length = 0
  await plugin.onFeatureTriggered('vscode-projects', 'kind:workspace beta')
  assert.equal(lastItems().length, 1)
  assert.equal(lastItems()[0].title, 'Beta Workspace')
  assert.equal(JSON.stringify(lastItems()).includes('/Users/private'), false)
  assert.deepEqual(lastItems()[0].source, { type: 'plugin', id: 'touch-vscode-projects', name: 'VS Code Projects' })
  assert.deepEqual(lastItems()[0].actions[0].payload, { token: 'vsp_22222222222222222222222222222222' })
})

test('renders degraded reason stably', async () => {
  const list = globalThis.plugin.vscodeProjects.list
  globalThis.plugin.vscodeProjects.list = async () => ({
    status: 'degraded',
    reason: 'permission-denied',
    path: '/secret',
  })
  await plugin.onFeatureTriggered()
  assert.equal(lastItems()[0].subtitle, 'permission-denied')
  assert.equal(JSON.stringify(lastItems()).includes('/secret'), false)
  globalThis.plugin.vscodeProjects.list = list
})

test('opens only host-issued token from generated item', async () => {
  published.length = 0
  opened.length = 0
  await plugin.onFeatureTriggered('vscode-projects', '')
  const item = clone(lastItems()[0])
  assert.deepEqual(await plugin.onItemAction(item), { externalAction: true, status: 'started' })
  assert.deepEqual(opened, ['vsp_11111111111111111111111111111111'])
  const forged = { ...item, actions: [{ id: 'open', type: 'plugin', payload: { token: 'forged' } }] }
  assert.deepEqual(await plugin.onItemAction(forged, { actionId: 'open' }), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })
  const altered = clone(item)
  altered.actions[0].payload.token = 'vsp_99999999999999999999999999999999'
  assert.deepEqual(await plugin.onItemAction(altered), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })

  projects = [{ token: 'vsp_44444444444444444444444444444444', label: 'Gamma', kind: 'folder' }]
  await plugin.onFeatureTriggered('vscode-projects')
  assert.deepEqual(await plugin.onItemAction(item), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })
  projects = [
    {
      token: 'vsp_11111111111111111111111111111111',
      label: 'Alpha',
      kind: 'folder',
      lastOpenedAt: '2026-09-01T10:00:00Z',
      path: '/Users/private/alpha',
    },
    {
      token: 'vsp_22222222222222222222222222222222',
      label: 'Beta Workspace',
      kind: 'workspace',
      path: '/Users/private/beta.code-workspace',
    },
    { token: 'vsp_33333333333333333333333333333333', label: 'Notes', kind: 'file', path: '/Users/private/notes.txt' },
  ]
  const foreignSource = clone(item)
  foreignSource.source.id = 'foreign-source'
  assert.equal(await plugin.onItemAction(foreignSource), undefined)
  const foreignMeta = clone(item)
  foreignMeta.meta.featureId = 'foreign-feature'
  assert.equal(await plugin.onItemAction(foreignMeta), undefined)
  assert.deepEqual(opened, ['vsp_11111111111111111111111111111111'])
})

test('maps capability failure without leaking native details', async () => {
  globalThis.plugin.vscodeProjects.open = async () => {
    const error = new Error('/Users/private/secret')
    error.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    throw error
  }
  await plugin.onFeatureTriggered()
  const item = lastItems()[0]
  assert.deepEqual(await plugin.onItemAction(item, { actionId: 'open' }), {
    externalAction: true,
    status: 'blocked',
    reason: 'permission-denied',
  })
  assert.equal(JSON.stringify(item).includes('/Users/private/secret'), false)
})

test('preserves token-expired from the host open result', async () => {
  globalThis.plugin.vscodeProjects.open = async () => ({ status: 'blocked', reason: 'token-expired' })
  await plugin.onFeatureTriggered('vscode-projects', '')
  assert.deepEqual(await plugin.onItemAction(lastItems()[0], { actionId: 'open' }), {
    externalAction: true,
    status: 'blocked',
    reason: 'token-expired',
  })
})

test('destroy invalidates every issued project token', async () => {
  opened.length = 0
  globalThis.plugin.vscodeProjects.open = async (token) => {
    opened.push(token)
    return { status: 'started' }
  }
  await plugin.onFeatureTriggered('vscode-projects', '')
  const item = clone(lastItems()[0])
  plugin.onDestroy()
  assert.deepEqual(await plugin.onItemAction(item, { actionId: 'open' }), {
    externalAction: true,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.deepEqual(opened, [])
})
