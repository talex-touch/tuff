const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const permissionChecks = []
const featureCalls = []
const storageCalls = []
const filesystemCalls = []
const logCalls = []
let storedUndo = null

globalThis.permission = {
  async check(permissionId) {
    permissionChecks.push(permissionId)
    return true
  },
}
globalThis.filesystem = {
  async renameBatch(entries) {
    filesystemCalls.push(entries)
    return entries.map((_, index) => ({ index, status: 'renamed' }))
  },
}
globalThis.logger = {
  error(message) {
    logCalls.push(message)
  },
  warn(message) {
    logCalls.push(message)
  },
}
globalThis.plugin = {
  feature: {
    async clearItems() {
      featureCalls.push({ type: 'clear' })
    },
    async pushItems(items) {
      featureCalls.push({ type: 'push', items })
    },
  },
  storage: {
    async getFile(name) {
      storageCalls.push({ type: 'get', name })
      return storedUndo
    },
    async setFile(name, value) {
      storageCalls.push({ type: 'set', name, value })
      storedUndo = value
    },
  },
}
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, meta: {} }
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
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions ??= []
    this.item.actions.push({ id, type, label, payload, primary: this.item.actions.length === 0 })
    return this
  }

  build() {
    return {
      ...this.item,
      render: { mode: 'default', basic: { ...this.basic } },
    }
  }
}

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const pluginPath = path.join(__dirname, 'index.js')
const source = fs.readFileSync(pluginPath, 'utf8')
const lifecycle = loadPluginModule(pluginPath)

function latestItems() {
  return featureCalls.findLast(call => call.type === 'push')?.items ?? []
}

function action(featureId, actionId) {
  return lifecycle.onItemAction({
    meta: {
      defaultAction: 'batch-rename',
      featureId,
    },
    actions: [{ id: actionId, type: 'plugin', label: actionId, primary: true }],
  })
}

async function preview(featureId, files = ['/approved/alpha.txt']) {
  await lifecycle.onFeatureTriggered(featureId, {
    text: 'prefix:renamed-',
    inputs: [{ type: 'files', content: JSON.stringify(files) }],
  })
}

test.afterEach(() => {
  permissionChecks.length = 0
  featureCalls.length = 0
  storageCalls.length = 0
  filesystemCalls.length = 0
  logCalls.length = 0
  storedUndo = null
  globalThis.permission = {
    async check(permissionId) {
      permissionChecks.push(permissionId)
      return true
    },
  }
  globalThis.filesystem = {
    async renameBatch(entries) {
      filesystemCalls.push(entries)
      return entries.map((_, index) => ({ index, status: 'renamed' }))
    },
  }
})

test('production Prelude has no privileged imports, raw host surface or test export', () => {
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bnode:(?:fs(?:\/promises)?|child_process|sqlite|worker_threads)\b/,
    /\belectron\b/,
    /showOpenDialog|showMessageBox/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
  assert.deepEqual(Object.keys(lifecycle).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
})

test('feature trigger awaits read permission and ordered item publication', async () => {
  await preview('batch-rename-preview', ['/approved/alpha.txt', '/approved/beta.md'])

  assert.deepEqual(permissionChecks, ['fs.read'])
  assert.deepEqual(
    featureCalls.map(call => call.type),
    ['clear', 'push'],
  )
  const items = latestItems()
  assert.equal(
    items.some(item => item.actions?.[0]?.id === 'apply'),
    true,
  )
  assert.equal(
    items.some(item => item.actions?.[0]?.id === 'undo'),
    true,
  )
  assert.equal(
    items.some(item => Object.hasOwn(item.meta, 'actionId')),
    false,
  )
  assert.equal(
    items.some(item => item.render.basic.subtitle === 'renamed-alpha.txt'),
    true,
  )
  assert.equal(
    items.some(item => item.render.basic.subtitle === 'renamed-beta.md'),
    true,
  )
  assert.equal(
    items.every(item => item.render.basic.icon.type === 'class'),
    true,
  )
})

test('apply sends one exact rename transaction before persisting bounded undo entries', async () => {
  await preview('batch-rename-apply', ['/approved/alpha.txt', '/approved/beta.md'])
  featureCalls.length = 0
  permissionChecks.length = 0

  const result = await action('batch-rename-apply', 'apply')

  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'completed',
  })
  assert.deepEqual(permissionChecks, ['fs.write'])
  assert.deepEqual(filesystemCalls, [
    [
      { source: '/approved/alpha.txt', targetName: 'renamed-alpha.txt' },
      { source: '/approved/beta.md', targetName: 'renamed-beta.md' },
    ],
  ])
  assert.equal(storageCalls.length, 1)
  assert.deepEqual(storageCalls[0].value.items, [
    { source: '/approved/renamed-beta.md', targetName: 'beta.md' },
    { source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' },
  ])
})

test('write denial blocks before filesystem and storage work', async () => {
  await preview('batch-rename-denied')
  filesystemCalls.length = 0
  storageCalls.length = 0
  globalThis.permission.check = async permissionId => permissionId !== 'fs.write'

  const result = await action('batch-rename-denied', 'apply')

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
  assert.equal(filesystemCalls.length, 0)
  assert.equal(storageCalls.length, 0)
})

test('filesystem failures expose only a stable code and never native detail', async () => {
  await preview('batch-rename-failure')
  filesystemCalls.length = 0
  globalThis.filesystem.renameBatch = async () => {
    throw Object.assign(new Error('/private/owner/secret.txt'), {
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED',
    })
  }

  const result = await action('batch-rename-failure', 'apply')

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
  assert.doesNotMatch(JSON.stringify(result), /private|secret\.txt/)
  assert.deepEqual(logCalls, ['[touch-batch-rename] PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'])
  assert.equal(storageCalls.length, 0)
})

test('undo reads the journal, runs the same fixed transaction and clears it after success', async () => {
  storedUndo = {
    items: [{ source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' }],
  }

  const result = await action('batch-rename-undo', 'undo')

  assert.equal(result.success, true)
  assert.deepEqual(filesystemCalls, [[{ source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' }]])
  assert.deepEqual(
    storageCalls.map(call => call.type),
    ['get', 'set'],
  )
  assert.deepEqual(storedUndo.items, [])
})

test('apply blocks no-op plans with no-changes and preserves existing undo history', async () => {
  const existingUndo = {
    items: [{ source: '/approved/old-renamed.txt', targetName: 'old.txt' }],
    createdAt: 12345,
  }
  storedUndo = existingUndo
  await lifecycle.onFeatureTriggered('batch-rename-noop', {
    text: '',
    inputs: [{ type: 'files', content: JSON.stringify(['/approved/alpha.txt']) }],
  })
  filesystemCalls.length = 0
  storageCalls.length = 0

  const result = await action('batch-rename-noop', 'apply')

  assert.equal(result.externalAction, true)
  assert.equal(result.success, false)
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'no-changes')
  assert.equal(filesystemCalls.length, 0)
  assert.equal(storageCalls.length, 0)
  assert.deepEqual(storedUndo, existingUndo)
})

test('rejects path separators and control characters in target filenames before apply', async () => {
  for (const rule of ['prefix:../escape/', 'suffix:\\nested', `prefix:bad${String.fromCharCode(7)}name`]) {
    await lifecycle.onFeatureTriggered('batch-rename-invalid', {
      text: rule,
      inputs: [{ type: 'files', content: JSON.stringify(['/approved/alpha.txt']) }],
    })
    filesystemCalls.length = 0
    storageCalls.length = 0

    const result = await action('batch-rename-invalid', 'apply')
    assert.equal(result.status, 'blocked', rule)
    assert.equal(result.reason, 'invalid-target-name', rule)
    assert.equal(filesystemCalls.length, 0, rule)
    assert.equal(storageCalls.length, 0, rule)
  }
})

test('detects duplicate targetPath collisions and blocks apply', async () => {
  await lifecycle.onFeatureTriggered('batch-rename-collision', {
    text: 'replace:/^(alpha|beta)$/->same',
    inputs: [{ type: 'files', content: JSON.stringify(['/approved/alpha.txt', '/approved/beta.txt']) }],
  })
  const items = latestItems()
  assert.equal(
    items.some(item => item.render.basic.subtitle.includes('冲突')),
    true,
  )
  filesystemCalls.length = 0
  storageCalls.length = 0

  const result = await action('batch-rename-collision', 'apply')

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'target-collision')
  assert.equal(filesystemCalls.length, 0)
  assert.equal(storageCalls.length, 0)
})

test('guards missing filesystem.renameBatch with capability-unavailable on apply and undo', async () => {
  await preview('batch-rename-cap')
  globalThis.filesystem = undefined

  const applyResult = await action('batch-rename-cap', 'apply')
  assert.equal(applyResult.status, 'blocked')
  assert.equal(applyResult.reason, 'capability-unavailable')
  assert.equal(storageCalls.length, 0)

  storedUndo = { items: [{ source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' }] }
  const undoResult = await action('batch-rename-cap', 'undo')
  assert.equal(undoResult.status, 'blocked')
  assert.equal(undoResult.reason, 'capability-unavailable')
})

test('drops stale async trigger results when superseded by a newer trigger', async () => {
  let releaseFirst
  let callIndex = 0
  globalThis.permission.check = async (permissionId) => {
    permissionChecks.push(permissionId)
    callIndex += 1
    if (callIndex === 1) {
      return new Promise((resolve) => {
        releaseFirst = resolve
      })
    }
    return true
  }

  const first = lifecycle.onFeatureTriggered('batch-rename-race', {
    text: 'prefix:stale-',
    inputs: [{ type: 'files', content: JSON.stringify(['/approved/alpha.txt']) }],
  })
  const second = lifecycle.onFeatureTriggered('batch-rename-race', {
    text: 'prefix:fresh-',
    inputs: [{ type: 'files', content: JSON.stringify(['/approved/beta.txt']) }],
  })
  await second
  releaseFirst(true)
  await first

  const items = latestItems()
  assert.equal(items.some(item => item.render.basic.subtitle === 'fresh-beta.txt'), true)
  assert.equal(items.some(item => item.render.basic.subtitle === 'stale-alpha.txt'), false)

  const result = await action('batch-rename-race', 'apply')
  assert.equal(result.status, 'completed')
  assert.deepEqual(filesystemCalls, [[{ source: '/approved/beta.txt', targetName: 'fresh-beta.txt' }]])
})

test('blocks case-insensitive collisions, Windows forbidden/reserved names, ReDoS regexes, double-apply, and separates undo-log write errors', async () => {
  // 1. Case-folded collision (Doc.txt vs doc.txt)
  await lifecycle.onFeatureTriggered('batch-rename-case', {
    text: 'replace:Alpha->doc replace:Beta->Doc',
    inputs: [{ type: 'files', content: JSON.stringify(['/approved/Alpha.txt', '/approved/Beta.txt']) }],
  })
  const caseRes = await action('batch-rename-case', 'apply')
  assert.equal(caseRes.status, 'blocked')
  assert.equal(caseRes.reason, 'target-collision')

  // 2. Windows forbidden characters, trailing dot, and reserved device names
  for (const rule of ['prefix:bad:name-', 'prefix:bad*name-', 'replace:alpha->CON', 'replace:alpha->NUL.txt', 'suffix:.']) {
    await lifecycle.onFeatureTriggered('batch-rename-win', {
      text: rule,
      inputs: [{ type: 'files', content: JSON.stringify(['/approved/alpha']) }],
    })
    const winRes = await action('batch-rename-win', 'apply')
    assert.equal(winRes.status, 'blocked', rule)
    assert.equal(winRes.reason, 'invalid-target-name', rule)
  }

  // 3. ReDoS regexes (nested, grouped overlapping, char-class overlapping alt, chained bounded, concatenated alt) are rejected without hanging
  const longName = `${'a'.repeat(35)}!`
  for (const dangerousPattern of [
    '/(a+)+$/',
    '/(a+)(a+)(a+)(a+)!/',
    '/([a-z]|[a-f])+$/',
    '/([a-z]a|[a-f]a)+$/',
    '/a{0,3}a{0,3}a{0,3}a{0,3}a{0,3}a{0,3}a{0,3}a{0,3}!/',
    `/${'(a|a)'.repeat(10)}b/`,
  ]) {
    const started = Date.now()
    await lifecycle.onFeatureTriggered('batch-rename-redos', {
      text: `replace:${dangerousPattern}->x`,
      inputs: [{ type: 'files', content: JSON.stringify([`/approved/${longName}.txt`]) }],
    })
    assert.ok(Date.now() - started < 250, `ReDoS rule must be skipped before regex execution: ${dangerousPattern}`)
    const redosApply = await action('batch-rename-redos', 'apply')
    assert.equal(redosApply.reason, 'no-changes', dangerousPattern)
  }

  // 4. Clearing preview cache prevents stale double-apply
  await preview('batch-rename-once', ['/approved/a.txt', '/approved/b.txt'])
  const firstApply = await action('batch-rename-once', 'apply')
  assert.equal(firstApply.status, 'completed')
  const secondApply = await action('batch-rename-once', 'apply')
  assert.equal(secondApply.status, 'blocked')
  assert.equal(secondApply.reason, 'preview-missing')

  // 5. Undo-log write failure after disk rename succeeds does not report rename failure
  const originalSetFile = globalThis.plugin.storage.setFile
  globalThis.plugin.storage.setFile = async () => {
    throw new Error('storage full')
  }
  try {
    await preview('batch-rename-log-err', ['/approved/c.txt'])
    const res = await action('batch-rename-log-err', 'apply')
    assert.equal(res.success, true)
    assert.equal(res.status, 'completed')
    assert.equal(res.undoLogSaved, false)
  }
  finally {
    globalThis.plugin.storage.setFile = originalSetFile
  }
})
