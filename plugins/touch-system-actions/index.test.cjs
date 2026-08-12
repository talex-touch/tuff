/**
 * The only tests this plugin has.
 *
 * `911fe1c6f` rewrote the fixed-action preludes and cut the integration suite's coverage of this
 * one from 17 cases to 7, adding per-plugin `index.test.cjs` files for the plugins it touched —
 * but not for this one. So the query matching, group ordering, platform filtering and action
 * dispatch below have had no test anywhere since that commit (#330).
 *
 * What remains in `packages/test/src/plugins/system-actions.test.ts` covers the isolation
 * boundary: no privileged surface, ordered publication, the forged-item path. The cases here are
 * the behaviour that boundary does not touch.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const state = {
  items: [],
  systemCalls: [],
  systemResult: { status: 'started' },
  systemError: null,
  loggedErrors: [],
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

  setTitle(title) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions = [{ id, type, label, payload }]
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
globalThis.system = {
  async runAction(actionId) {
    state.systemCalls.push(actionId)
    if (state.systemError)
      throw state.systemError
    return state.systemResult
  },
}
// Read through this object on every call, so a test can change the platform between cases.
globalThis.platform = { platform: 'darwin', arch: 'arm64' }
globalThis.logger = {
  error(message) {
    state.loggedErrors.push(message)
  },
  info() {},
}
globalThis.TuffItemBuilder = FakeBuilder

const filename = path.join(__dirname, 'index.js')
const source = fs.readFileSync(filename, 'utf8')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(__dirname)
loaded._compile(source, filename)
const pluginModule = loaded.exports

test.beforeEach(() => {
  state.items = []
  state.systemCalls = []
  state.systemResult = { status: 'started' }
  state.systemError = null
  state.loggedErrors = []
  globalThis.platform.platform = 'darwin'
})

/** Titles of the published items, which is how a section header and an action are told apart. */
function titles() {
  return state.items.map(item => item.render.basic.title)
}

function actionIds() {
  return state.items.flatMap(item => item.actions?.map(action => action.payload.actionId) ?? [])
}

async function trigger(text) {
  await pluginModule.onFeatureTriggered('system-actions', { text })
}

test('production Prelude has no privileged or test-only child surface', () => {
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bnode:(?:fs|child_process|sqlite|worker_threads)\b/,
    /\b(?:command|executable|args|cwd|env|script)\s*:/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
  assert.deepEqual(
    Object.keys(pluginModule).sort(),
    ['onDestroy', 'onFeatureTriggered', 'onInit', 'onItemAction'],
  )
})

test('a foreign feature id is declined without publishing anything', async () => {
  const handled = await pluginModule.onFeatureTriggered('not-system-actions', { text: '' })

  assert.equal(handled, false)
  assert.deepEqual(state.items, [])
})

test('an empty query publishes every platform action under its group header', async () => {
  await trigger('')

  // Group headers first in GROUP_ORDER, each followed by its own actions. Nine darwin actions
  // plus four headers; an ordering bug shows up as a header landing after its members.
  assert.deepEqual(titles(), [
    '电源操作',
    '关机',
    '重启',
    '锁定屏幕',
    '音量操作',
    '增加音量',
    '降低音量',
    '静音切换',
    '显示操作',
    '增加亮度',
    '降低亮度',
    '窗口操作',
    '打开主窗口',
  ])
})

test('windows drops the display group entirely rather than showing an empty header', async () => {
  globalThis.platform.platform = 'win32'

  await trigger('')

  assert.equal(titles().includes('显示操作'), false)
  assert.equal(titles().includes('增加亮度'), false)
  assert.deepEqual(actionIds(), [
    'shutdown',
    'restart',
    'lock-screen',
    'volume-up',
    'volume-down',
    'mute-toggle',
    'open-main-window',
  ])
})

test('an unsupported platform publishes one explanatory item and no actions', async () => {
  globalThis.platform.platform = 'linux'

  await trigger('')

  assert.deepEqual(titles(), ['当前平台暂不支持系统操作'])
  assert.deepEqual(actionIds(), [])
  assert.equal(state.items[0].render.basic.subtitle, 'platform:linux')
})

test('matching reaches ids, names, descriptions and keywords alike', async () => {
  for (const [query, expected] of [
    ['关机', ['shutdown']],
    ['shutdown', ['shutdown']],
    ['关闭计算机', ['shutdown']],
    // Not mute-toggle: its keywords are 静音 / mute / 无声 / 关闭声音, none of which contain 音量,
    // so searching for the group's own name does not reach one of its three members. Recorded as
    // observed behaviour rather than corrected here.
    ['音量', ['volume-up', 'volume-down']],
    ['brightness', ['brightness-up', 'brightness-down']],
  ]) {
    await trigger(query)
    assert.deepEqual(actionIds(), expected, `query ${query}`)
  }
})

test('matching ignores case and the spaces inside a keyword', async () => {
  await trigger('LOCK SCREEN')
  assert.deepEqual(actionIds(), ['lock-screen'])

  // `lock screen` is one keyword; the compact form has to match it with the space removed.
  await trigger('lockscreen')
  assert.deepEqual(actionIds(), ['lock-screen'])

  await trigger('  Volume Up  ')
  assert.deepEqual(actionIds(), ['volume-up'])

  // Irregular internal spacing is the only case the compact comparison actually decides:
  // `buildSearchTokens` already emits both the spaced and the stripped form of every token, so a
  // single-space query matches the spaced token directly. Two spaces matches neither.
  await trigger('volume  up')
  assert.deepEqual(actionIds(), ['volume-up'])
})

test('a query matching nothing publishes the hint instead of an empty list', async () => {
  await trigger('这个词不匹配任何操作')

  assert.deepEqual(titles(), ['没有匹配的系统操作'])
  assert.deepEqual(actionIds(), [])
})

test('a partial match keeps only the groups that still have members', async () => {
  await trigger('亮度')

  assert.deepEqual(titles(), ['显示操作', '增加亮度', '降低亮度'])
})

test('every published action carries a fixed id and no command payload', async () => {
  await trigger('')

  for (const item of state.items) {
    for (const action of item.actions ?? []) {
      assert.equal(action.id, 'run-action')
      assert.deepEqual(Object.keys(action.payload), ['actionId'])
      assert.equal(typeof action.payload.actionId, 'string')
    }
  }
})

/**
 * Two guards refuse this independently — `selectedActionId` checks `ACTION_IDS`, and `runAction`
 * looks the id up in the platform's action list — so this asserts the observable contract rather
 * than either line. Removing one of them alone leaves the case passing, which is what defence in
 * depth is supposed to look like.
 */
test('a forged item cannot smuggle an action id the plugin does not own', async () => {
  const forged = {
    meta: { defaultAction: 'system-actions' },
    actions: [{ id: 'run-action', payload: { actionId: 'rm -rf /', command: 'rm -rf /' } }],
  }

  const result = await pluginModule.onItemAction(forged, { actionId: 'run-action' })

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
    message: '无效系统操作',
  })
  assert.deepEqual(state.systemCalls, [])
})

test('an item that is not this plugin\'s, or names another action, executes nothing', async () => {
  const cases = [
    [{ meta: { defaultAction: 'something-else' }, actions: [{ id: 'run-action', payload: { actionId: 'shutdown' } }] }, {}],
    [{ actions: [{ id: 'run-action', payload: { actionId: 'shutdown' } }] }, {}],
    // A real action id, but reached through an action id the plugin never registered.
    [{ meta: { defaultAction: 'system-actions' }, actions: [{ id: 'other-action', payload: { actionId: 'shutdown' } }] }, { actionId: 'other-action' }],
  ]

  for (const [item, context] of cases) {
    const result = await pluginModule.onItemAction(item, context)
    assert.equal(result.reason, 'invalid-action')
  }
  assert.deepEqual(state.systemCalls, [])
})

test('an action the current platform does not offer is refused', async () => {
  globalThis.platform.platform = 'win32'
  const item = {
    meta: { defaultAction: 'system-actions' },
    actions: [{ id: 'run-action', payload: { actionId: 'brightness-up' } }],
  }

  const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })

  assert.equal(result.reason, 'invalid-action')
  assert.deepEqual(state.systemCalls, [])
})

test('a valid selection reaches the host with only the action id', async () => {
  await trigger('锁屏')
  const item = state.items.find(candidate => candidate.actions)

  const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })

  assert.deepEqual(state.systemCalls, ['lock-screen'])
  assert.deepEqual(result, { externalAction: true, success: true, status: 'started' })
})

test('a blocked host result is reported with the reason it gave', async () => {
  const item = {
    meta: { defaultAction: 'system-actions' },
    actions: [{ id: 'run-action', payload: { actionId: 'shutdown' } }],
  }

  for (const [reason, expected] of [
    ['confirmation-denied', { status: 'cancelled', message: '操作已取消' }],
    ['permission-denied', { status: 'blocked', message: '缺少 system.shell 权限' }],
    ['permission-unavailable', { status: 'blocked', message: '权限系统不可用' }],
    ['platform-unsupported', { status: 'blocked', message: '当前平台暂不支持该系统操作' }],
    ['something-new', { status: 'blocked', message: '系统操作不可用' }],
  ]) {
    state.systemResult = { status: 'blocked', reason }
    const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })
    assert.equal(result.status, expected.status, reason)
    assert.equal(result.message, expected.message, reason)
    assert.equal(result.reason, reason)
    assert.equal(result.success, false)
  }
})

test('a thrown host capability error maps to a stable reason rather than propagating', async () => {
  const item = {
    meta: { defaultAction: 'system-actions' },
    actions: [{ id: 'run-action', payload: { actionId: 'shutdown' } }],
  }

  for (const [code, expected] of [
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED', { reason: 'permission-denied', status: 'blocked' }],
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE', { reason: 'permission-unavailable', status: 'blocked' }],
    ['PLUGIN_HOST_CAPABILITY_CANCELLED', { reason: 'cancelled', status: 'cancelled' }],
    ['PLUGIN_HOST_CAPABILITY_TIMEOUT', { reason: 'timeout', status: 'failed' }],
    ['SOMETHING_ELSE', { reason: 'system-action-failed', status: 'failed' }],
  ]) {
    state.systemError = Object.assign(new Error('boom'), { code })
    const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })
    assert.equal(result.reason, expected.reason, code)
    assert.equal(result.status, expected.status, code)
  }

  // The message is the reason, never the thrown error — `boom` reaching a log line would mean
  // host internals are surfacing through a plugin.
  assert.equal(state.loggedErrors.length, 5)
  assert.equal(state.loggedErrors.some(message => String(message).includes('boom')), false)
})

test('an absent system capability is refused before anything is dispatched', async () => {
  // The Prelude destructures `system` from globalThis at load, so it holds the object rather than
  // the binding — reassigning `globalThis.system` would not reach it. Mutating the object does.
  const restore = globalThis.system.runAction
  delete globalThis.system.runAction
  try {
    const item = {
      meta: { defaultAction: 'system-actions' },
      actions: [{ id: 'run-action', payload: { actionId: 'shutdown' } }],
    }

    const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })

    assert.equal(result.reason, 'system-capability-unavailable')
    assert.equal(result.status, 'blocked')
  }
  finally {
    globalThis.system.runAction = restore
  }
})
