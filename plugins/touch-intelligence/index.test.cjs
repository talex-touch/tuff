const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

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

  setDescription(description) {
    this.basic.description = description
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

  setCustomRender(type, content, data) {
    this.item.render = {
      mode: 'custom',
      custom: { type, content, data },
      basic: this.basic,
    }
    return this
  }

  setActions(actions) {
    this.item.actions = actions
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  build() {
    if (!this.item.render) {
      this.item.render = {
        mode: 'default',
        basic: this.basic,
      }
    }
    return this.item
  }
}

function loadPlugin(options = {}) {
  const state = {
    checks: [],
    requests: [],
    clipboardWrites: [],
    replaceCalls: [],
    pushedItems: [],
    contextInvokes: [],
    storage: new Map(),
    logs: [],
  }

  globalThis.TuffItemBuilder = FakeBuilder
  globalThis.logger = {
    info(...args) {
      state.logs.push(['info', ...args])
    },
    warn(...args) {
      state.logs.push(['warn', ...args])
    },
    error(...args) {
      state.logs.push(['error', ...args])
    },
  }

  if (Object.prototype.hasOwnProperty.call(options, 'permission')) {
    globalThis.permission = options.permission
  }
  else {
    globalThis.permission = {
      async check(id) {
        state.checks.push(id)
        return options.checkResult ? options.checkResult(id) : true
      },
      async request(id, reason) {
        state.requests.push({ id, reason })
        return options.requestResult ? options.requestResult(id, reason) : true
      },
    }
  }

  if (Object.prototype.hasOwnProperty.call(options, 'clipboard')) {
    globalThis.clipboard = options.clipboard
  }
  else {
    globalThis.clipboard = {
      async writeText(text) {
        state.clipboardWrites.push(text)
      },
      async copyAndPaste(payload) {
        state.replaceCalls.push(payload)
        return true
      },
    }
  }

  const pushItems = async (items) => {
    state.pushedItems.push(items)
  }

  globalThis.plugin = {
    feature: {
      async clearItems() {},
      pushItems,
      async getItems() {
        return state.pushedItems.at(-1) || []
      },
      async updateItem() {},
    },
    widget: {
      pushItems,
    },
    storage: {
      async getFile(name) {
        return state.storage.has(name) ? state.storage.get(name) : null
      },
      async setFile(name, value) {
        state.storage.set(name, value)
      },
      async listFiles() {
        return [...state.storage.keys()]
      },
    },
    box: {
      hide() {},
    },
  }

  globalThis.intelligence = options.intelligence || {
    async contextInvoke(request) {
      state.contextInvokes.push(request)
      return {
        invocation: {
          result: 'mock-answer',
          providerId: 'mock-provider',
          modelId: 'mock-model',
          traceId: 'trace-1',
          latency: 10,
        },
      }
    },
    async invoke() {
      return { result: 'mock-invoke' }
    },
  }

  globalThis.features = {
    async addFeature() {
      return true
    },
    async removeFeature() {
      return true
    },
    async getFeatures() {
      return []
    },
  }

  delete require.cache[require.resolve('./index.js')]
  const loaded = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { pluginModule: loaded, state }
}

test('manifest dev block is clean and every push feature has an explicit searchProvider', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))

  assert.deepEqual(manifest.dev, { enable: false, source: false, address: '' })
  const pushFeatureIds = manifest.features.filter(feature => feature.push === true).map(feature => feature.id)
  const providerFeatureIds = manifest.searchProviders.map(provider => provider.featureId)
  assert.deepEqual(providerFeatureIds.sort(), pushFeatureIds.sort())
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.packageManager, 'pnpm@11.24.0')
  assert.equal(pkg.keywords.includes('tuff-plugin'), true)
  assert.equal(pkg.tuff.id, manifest.id)
  assert.equal(pkg.tuff.name, manifest.name)
  assert.equal(pkg.tuff.sdkapi, manifest.sdkapi)
})

test('display-time trigger uses non-mutating checkPermission and fails closed with canonical reasons', async () => {
  const denied = loadPlugin({
    checkResult: () => false,
    requestResult: () => true,
  })
  const deniedResult = await denied.pluginModule.onFeatureTriggered('intelligence-ask', 'ai hello')
  assert.equal(denied.state.checks.includes('intelligence.basic'), true)
  assert.deepEqual(denied.state.requests, [])
  assert.equal(denied.state.contextInvokes.length, 0)
  assert.equal(deniedResult.status, 'blocked')
  assert.equal(deniedResult.reason, 'permission-denied')

  const missingSdk = loadPlugin({ permission: undefined })
  const missingResult = await missingSdk.pluginModule.onFeatureTriggered('intelligence-ask', 'ai hello')
  assert.equal(missingSdk.state.contextInvokes.length, 0)
  assert.equal(missingResult.status, 'blocked')
  assert.equal(missingResult.reason, 'permission-sdk-unavailable')

  const failingCheck = loadPlugin({
    permission: {
      async check() {
        throw new Error('check boom')
      },
      async request() {
        return true
      },
    },
  })
  const failedResult = await failingCheck.pluginModule.onFeatureTriggered('intelligence-ask', 'ai hello')
  assert.equal(failedResult.status, 'blocked')
  assert.equal(failedResult.reason, 'permission-check-failed')
})

test('execute-time copy-answer checks clipboard.write and copies on grant', async () => {
  const { pluginModule, state } = loadPlugin({
    checkResult: () => true,
  })

  const result = await pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'copied answer' },
      },
    },
    { actionId: 'copy-answer' },
  )

  assert.deepEqual(state.checks, ['clipboard.write'])
  assert.deepEqual(state.requests, [])
  assert.deepEqual(state.clipboardWrites, ['copied answer'])
  assert.deepEqual(result, { externalAction: true, status: 'started' })
})

test('execute-time copy-answer preserves canonical blocked reasons on denial, missing SDK, or throw', async () => {
  const denied = loadPlugin({
    checkResult: () => false,
  })
  const deniedResult = await denied.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'hello' },
      },
    },
    { actionId: 'copy-answer' },
  )
  assert.deepEqual(denied.state.checks, ['clipboard.write'])
  assert.deepEqual(denied.state.requests, [])
  assert.equal(deniedResult.status, 'blocked')
  assert.equal(deniedResult.reason, 'permission-denied')
  assert.deepEqual(denied.state.clipboardWrites, [])

  const noSdk = loadPlugin({ permission: undefined })
  const noSdkResult = await noSdk.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'hello' },
      },
    },
    { actionId: 'copy-answer' },
  )
  assert.equal(noSdkResult.status, 'blocked')
  assert.equal(noSdkResult.reason, 'permission-sdk-unavailable')

  const throwingCheck = loadPlugin({
    permission: {
      async check() {
        throw new Error('check exploded')
      },
    },
  })
  const threwResult = await throwingCheck.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'hello' },
      },
    },
    { actionId: 'copy-answer' },
  )
  assert.equal(threwResult.status, 'blocked')
  assert.equal(threwResult.reason, 'permission-check-failed')

  const noClipboard = loadPlugin({ clipboard: {} })
  const noClipboardResult = await noClipboard.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'hello' },
      },
    },
    { actionId: 'copy-answer' },
  )
  assert.equal(noClipboardResult.status, 'blocked')
  assert.equal(noClipboardResult.reason, 'clipboard-unavailable')

  const unavailableWrite = loadPlugin({
    clipboard: {
      async writeText() {
        throw Object.assign(new Error('permission service unavailable'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
        })
      },
    },
  })
  const unavailableResult = await unavailableWrite.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'hello' },
      },
    },
    { actionId: 'copy-answer' },
  )
  assert.equal(unavailableResult.status, 'blocked')
  assert.equal(unavailableResult.reason, 'permission-unavailable')
})

test('execute-time replace-answer checks permission and maps missing capability cleanly', async () => {
  const granted = loadPlugin({
    checkResult: () => true,
  })
  const okResult = await granted.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'replacement text' },
      },
    },
    { actionId: 'replace-answer' },
  )
  assert.deepEqual(granted.state.checks, ['clipboard.write'])
  assert.deepEqual(granted.state.requests, [])
  assert.deepEqual(granted.state.replaceCalls, [{ text: 'replacement text', hideCoreBox: true }])
  assert.equal(okResult.status, 'started')

  const missingCap = loadPlugin({ clipboard: {} })
  const capResult = await missingCap.pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-ask',
        payload: { prompt: 'hi', answer: 'replacement text' },
      },
    },
    { actionId: 'replace-answer' },
  )
  assert.equal(capResult.status, 'blocked')
  assert.equal(capResult.reason, 'capability-unavailable')
})

test('execute-time send checks intelligence permissions and ignores unrelated items', async () => {
  const { pluginModule, state } = loadPlugin({
    checkResult: () => true,
  })

  const unrelated = await pluginModule.onItemAction(
    {
      meta: { defaultAction: 'copy', featureId: 'other-plugin' },
    },
    { actionId: 'copy' },
  )
  assert.equal(unrelated, undefined)

  const sent = await pluginModule.onItemAction(
    {
      meta: {
        defaultAction: 'intelligence-action',
        featureId: 'intelligence-rewrite',
        payload: { prompt: 'rewrite: make this clearer' },
      },
    },
    { actionId: 'send' },
  )
  assert.equal(sent.externalAction, true)
  assert.deepEqual(
    state.checks,
    ['intelligence.basic', 'intelligence.context'],
  )
  assert.deepEqual(state.requests, [])
  assert.equal(state.contextInvokes.length, 1)
  assert.equal(state.contextInvokes[0].context.mode, 'stateless')

  await pluginModule.onDestroy()
})
