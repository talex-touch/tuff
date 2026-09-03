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
    this.item.render = { basic: { title } }
    return this
  }

  setSubtitle(subtitle) {
    this.item.render.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.item.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = meta
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

function loadPlugin({ sessions, clipboard: clipboardFacade } = {}) {
  const state = { items: [], copied: [], clearCount: 0 }
  const aiSessions
    = sessions && typeof sessions.list === 'function'
      ? sessions
      : sessions
        ? {
            async list() {
              return sessions
            },
          }
        : undefined
  globalThis.TuffItemBuilder = FakeBuilder
  delete globalThis.clipboard
  if (clipboardFacade !== undefined)
    globalThis.clipboard = clipboardFacade
  globalThis.plugin = {
    feature: {
      async clearItems() {
        state.clearCount++
        state.items = []
      },
      async pushItems(items) {
        state.items.push(...items)
      },
    },
    aiSessions,
  }
  const path = require.resolve('./index.js')
  delete require.cache[path]
  const plugin = require(path)
  return { plugin, state }
}

const fixture = {
  status: 'ready',
  sessions: [
    {
      id: 'abc123def4567890',
      platform: 'codex',
      project: 'touch-app',
      updatedAt: '2026-09-01T10:00:00.000Z',
      state: 'completed',
      turnCount: 12,
      transcript: 'secret-token',
      token: 'sk-private',
    },
    {
      id: 'deadbeefdeadbeef',
      platform: 'claude',
      project: '/private/work',
      updatedAt: '2026-09-01T09:00:00.000Z',
      state: 'active',
      turnCount: 4,
    },
    {
      id: '1234abcd5678ef90',
      platform: 'claude',
      project: 'docs',
      updatedAt: '2026-08-31T09:00:00.000Z',
      state: 'active',
      turnCount: 3,
    },
  ],
}
const clone = value => JSON.parse(JSON.stringify(value))

test('lists bounded metadata and filters by keyword without leaking secret-like fields', async () => {
  const { plugin, state } = loadPlugin({ sessions: fixture })
  await plugin.onFeatureTriggered('ai-sessions', { text: 'claude' })
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].render.basic.title, 'docs · claude')
  assert.doesNotMatch(JSON.stringify(state.items), /secret-token|private|work/)
  assert.doesNotMatch(JSON.stringify(state), /transcript|api[_ -]?key|cookie/)
})

test('shows a scan-limited warning for incomplete ready snapshots', async () => {
  const { plugin, state } = loadPlugin({
    sessions: { status: 'ready', sessions: [fixture.sessions[0]], total: 2, incomplete: true },
  })

  await plugin.onFeatureTriggered('ai-sessions', { text: '' })
  assert.equal(state.items[0].render.basic.title, 'AI 会话结果不完整')
  assert.match(state.items[0].render.basic.subtitle, /scan-limited/)
  assert.equal(state.items[1].render.basic.title, 'touch-app · codex')
})
test('renders unknown local turn counts without claiming zero turns', async () => {
  const session = { ...fixture.sessions[0], turnCount: null }
  const { plugin, state } = loadPlugin({
    sessions: { status: 'ready', sessions: [session], total: 1, incomplete: false },
  })
  await plugin.onFeatureTriggered('ai-sessions', { text: '' })
  assert.match(state.items[0].render.basic.subtitle, /轮数未知/)
  assert.doesNotMatch(state.items[0].render.basic.subtitle, /0 轮/)
})

test('publishes visible degraded state when facade is absent', async () => {
  const { plugin, state } = loadPlugin()
  await plugin.onFeatureTriggered('ai-sessions', { text: 'anything' })
  assert.equal(state.items[0].render.basic.subtitle, 'capability-unavailable')
})

test('publishes the host degraded reason without exposing session data', async () => {
  const { plugin, state } = loadPlugin({
    sessions: { status: 'degraded', reason: 'permission-denied', sessions: fixture.sessions },
  })
  await plugin.onFeatureTriggered('ai-sessions', { text: 'claude' })
  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].render.basic.subtitle, 'permission-denied')
  assert.doesNotMatch(JSON.stringify(state.items), /deadbeef|private|work|transcript/i)
})

test('maps unavailable permission infrastructure to a stable reason', async () => {
  const { plugin, state } = loadPlugin({
    sessions: {
      async list() {
        throw Object.assign(new Error('permission unavailable'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
        })
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions', { text: '' })
  assert.equal(state.items[0].render.basic.subtitle, 'permission-unavailable')
})

test('copies only the issued redacted reference through clipboard facade', async () => {
  const calls = []
  const listRequests = []
  let listCalls = 0
  const { plugin, state } = loadPlugin({
    sessions: {
      async list(request) {
        listCalls++
        listRequests.push(request)
        return { status: 'ready', sessions: [fixture.sessions[0]] }
      },
    },
    clipboard: {
      async writeText(value) {
        calls.push(value)
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')
  const item = clone(state.items[0])
  assert.deepEqual(item.source, { type: 'plugin', id: 'touch-ai-sessions', name: 'AI Sessions' })
  assert.deepEqual(item.meta, { defaultAction: 'copy-reference', featureId: 'ai-sessions' })
  assert.deepEqual(item.actions[0].payload, { id: 'abc123def4567890' })
  assert.equal(listCalls, 1)

  assert.deepEqual(await plugin.onItemAction(item), { externalAction: true, success: true, status: 'copied' })
  assert.equal(listCalls, 2)
  assert.deepEqual(listRequests[1], { query: 'abc123def4567890', limit: 1 })
  assert.deepEqual(calls, ['AI session abc123def456 · codex · 2026-09-01T10:00:00.000Z'])
})

test('blocks copying when fresh session permissions are revoked', async () => {
  let listCalls = 0
  let clipboardCalls = 0
  const { plugin, state } = loadPlugin({
    sessions: {
      async list() {
        listCalls++
        if (listCalls === 1)
          return { status: 'ready', sessions: [fixture.sessions[0]] }
        throw Object.assign(new Error('permission revoked'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      },
    },
    clipboard: {
      async writeText() {
        clipboardCalls++
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')

  assert.deepEqual(await plugin.onItemAction(clone(state.items[0])), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
  })
  assert.equal(listCalls, 2)
  assert.equal(clipboardCalls, 0)
})

test('blocks copying stale references when fresh session metadata changes', async () => {
  let listCalls = 0
  let clipboardCalls = 0
  const { plugin, state } = loadPlugin({
    sessions: {
      async list() {
        listCalls++
        return {
          status: 'ready',
          sessions: [
            listCalls === 1 ? fixture.sessions[0] : { ...fixture.sessions[0], updatedAt: '2026-09-01T10:01:00.000Z' },
          ],
        }
      },
    },
    clipboard: {
      async writeText() {
        clipboardCalls++
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')

  assert.deepEqual(await plugin.onItemAction(clone(state.items[0])), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'stale-reference',
  })
  assert.equal(listCalls, 2)
  assert.equal(clipboardCalls, 0)
})

test('blocks a deferred copy when a newer feature query invalidates its action', async () => {
  let listCalls = 0
  let clipboardCalls = 0
  let beginRevalidation
  let releaseRevalidation
  const revalidationStarted = new Promise((resolve) => {
    beginRevalidation = resolve
  })
  const { plugin, state } = loadPlugin({
    sessions: {
      async list() {
        listCalls++
        if (listCalls === 1)
          return { status: 'ready', sessions: [fixture.sessions[0]] }
        if (listCalls === 2) {
          beginRevalidation()
          return new Promise((resolve) => {
            releaseRevalidation = resolve
          })
        }
        return { status: 'ready', sessions: [] }
      },
    },
    clipboard: {
      async writeText() {
        clipboardCalls++
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')
  const pendingAction = plugin.onItemAction(clone(state.items[0]))
  await revalidationStarted
  await plugin.onFeatureTriggered('ai-sessions', { text: 'next' })
  releaseRevalidation({ status: 'ready', sessions: [fixture.sessions[0]] })

  assert.deepEqual(await pendingAction, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'stale-action',
  })
  assert.equal(clipboardCalls, 0)
})

test('returns a fresh degraded snapshot reason without writing the clipboard', async () => {
  let listCalls = 0
  let clipboardCalls = 0
  const { plugin, state } = loadPlugin({
    sessions: {
      async list() {
        listCalls++
        return listCalls === 1
          ? { status: 'ready', sessions: [fixture.sessions[0]] }
          : { status: 'degraded', reason: 'index-unavailable' }
      },
    },
    clipboard: {
      async writeText() {
        clipboardCalls++
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')

  assert.deepEqual(await plugin.onItemAction(clone(state.items[0])), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'index-unavailable',
  })
  assert.equal(clipboardCalls, 0)
})

test('rejects forged, altered, and foreign actions before clipboard', async () => {
  let calls = 0
  const { plugin, state } = loadPlugin({
    sessions: { status: 'ready', sessions: [fixture.sessions[0]] },
    clipboard: {
      async writeText() {
        calls++
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')
  const item = clone(state.items[0])
  const altered = clone(item)
  altered.actions[0].payload = { id: 'attacker-id', secret: 'must-not-forward' }
  assert.deepEqual(await plugin.onItemAction(altered), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(calls, 0)

  const foreignSource = clone(item)
  foreignSource.source.id = 'foreign-source'
  assert.equal(await plugin.onItemAction(foreignSource), undefined)
  const foreignMeta = clone(item)
  foreignMeta.meta.featureId = 'foreign-feature'
  assert.equal(await plugin.onItemAction(foreignMeta), undefined)
  assert.equal(calls, 0)

  await plugin.onFeatureTriggered('ai-sessions', { text: 'next' })
  assert.deepEqual(await plugin.onItemAction(item), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(calls, 0)
})

test('destroy invalidates every issued redacted reference', async () => {
  let calls = 0
  const { plugin, state } = loadPlugin({
    sessions: { status: 'ready', sessions: [fixture.sessions[0]] },
    clipboard: {
      async writeText() {
        calls++
      },
    },
  })
  await plugin.onFeatureTriggered('ai-sessions')
  const item = clone(state.items[0])
  plugin.onDestroy()
  assert.deepEqual(await plugin.onItemAction(item, { actionId: 'copy-reference' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(calls, 0)
})
test('degrades when clipboard facade is unavailable', async () => {
  const { plugin, state } = loadPlugin({ sessions: { status: 'ready', sessions: [fixture.sessions[0]] } })
  await plugin.onFeatureTriggered('ai-sessions')
  assert.deepEqual(await plugin.onItemAction(state.items[0], { actionId: 'copy-reference' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'clipboard-sdk-unavailable',
  })
})
