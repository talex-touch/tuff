const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

class FakeTuffItemBuilder {
  constructor(id) {
    this.item = { id, actions: [], meta: {}, render: { basic: {} } }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.render.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.render.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.item.render.basic.icon = icon
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

function loadPlugin(overrides = {}) {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  const pushedItems = []
  let clearedCount = 0
  const permissionCalls = { check: [], request: [] }

  const sandbox = {
    module: { exports: {} },
    exports: {},
    TuffItemBuilder: FakeTuffItemBuilder,
    logger: { error() {}, info() {}, warn() {} },
    plugin: {
      feature: {
        clearItems: async () => {
          clearedCount += 1
          pushedItems.length = 0
        },
        pushItems: async (items) => {
          pushedItems.push(...items)
        },
      },
    },
    permission: 'permission' in overrides
      ? overrides.permission
      : {
          check: async (id) => {
            permissionCalls.check.push(id)
            return overrides.checkResult ?? true
          },
          request: async (id, reason) => {
            permissionCalls.request.push({ id, reason })
            if (overrides.requestError) throw overrides.requestError
            return overrides.requestResult ?? true
          },
        },
  }
  sandbox.globalThis = sandbox

  vm.runInNewContext(source, sandbox, { filename: 'plugins/touch-music/index.js' })
  return {
    lifecycle: sandbox.module.exports,
    pushedItems,
    permissionCalls,
    getClearedCount: () => clearedCount,
  }
}

test('onFeatureTriggered performs non-mutating permission check and pushes search entry', async () => {
  const runtime = loadPlugin({ checkResult: true })

  const handled = await runtime.lifecycle.onFeatureTriggered('touch-music', { text: 'Jay Chou' })
  assert.equal(handled, true)
  assert.deepEqual(runtime.permissionCalls.check, ['network.internet'])
  assert.deepEqual(runtime.permissionCalls.request, [])
  assert.equal(runtime.pushedItems.length, 1)
  assert.equal(runtime.pushedItems[0].render.basic.title, '搜索音乐：Jay Chou')
  assert.equal(runtime.pushedItems[0].meta.permissionStatus, 'granted')
})

test('onFeatureTriggered fails closed and reports missing permission or missing SDK', async () => {
  const deniedRuntime = loadPlugin({ checkResult: false })
  await deniedRuntime.lifecycle.onFeatureTriggered('touch-music', '')
  assert.equal(deniedRuntime.pushedItems[0].meta.permissionStatus, 'network-internet-permission-required')
  assert.match(deniedRuntime.pushedItems[0].render.basic.subtitle, /network\.internet/)

  const noSdkRuntime = loadPlugin({ permission: undefined })
  await noSdkRuntime.lifecycle.onFeatureTriggered('touch-music', '')
  assert.equal(noSdkRuntime.pushedItems[0].meta.permissionStatus, 'permission-sdk-unavailable')
  assert.match(noSdkRuntime.pushedItems[0].render.basic.subtitle, /权限 SDK 不可用/)
})

test('onItemAction enforces execution-time permission.request fail-closed', async () => {
  const grantedRuntime = loadPlugin({ requestResult: true })
  await grantedRuntime.lifecycle.onFeatureTriggered('touch-music', 'piano')
  const grantedResult = await grantedRuntime.lifecycle.onItemAction(grantedRuntime.pushedItems[0])
  assert.equal(grantedResult.status, 'started')
  assert.equal(grantedResult.shouldActivate, true)

  const deniedRuntime = loadPlugin({ requestResult: false })
  await deniedRuntime.lifecycle.onFeatureTriggered('touch-music', 'piano')
  const deniedResult = await deniedRuntime.lifecycle.onItemAction(deniedRuntime.pushedItems[0])
  assert.equal(deniedResult.status, 'blocked')
  assert.equal(deniedResult.reason, 'permission-denied')

  const unavailableError = Object.assign(new Error('unavailable'), {
    code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
  })
  const unavailableRuntime = loadPlugin({ requestError: unavailableError })
  await unavailableRuntime.lifecycle.onFeatureTriggered('touch-music', 'piano')
  const unavailableResult = await unavailableRuntime.lifecycle.onItemAction(unavailableRuntime.pushedItems[0])
  assert.equal(unavailableResult.status, 'blocked')
  assert.equal(unavailableResult.reason, 'permission-unavailable')

  const noSdkRuntime = loadPlugin({ permission: undefined })
  await noSdkRuntime.lifecycle.onFeatureTriggered('touch-music', 'piano')
  const noSdkResult = await noSdkRuntime.lifecycle.onItemAction(noSdkRuntime.pushedItems[0])
  assert.equal(noSdkResult.status, 'blocked')
  assert.equal(noSdkResult.reason, 'permission-sdk-unavailable')
})

test('onItemAction ignores unrelated items and onDestroy invalidates in-flight triggers', async () => {
  const runtime = loadPlugin({ checkResult: true })
  const ignored = await runtime.lifecycle.onItemAction({ meta: { featureId: 'other-feature' } })
  assert.equal(ignored, undefined)

  const unsupported = await runtime.lifecycle.onFeatureTriggered('unknown-feature', 'test')
  assert.equal(unsupported, false)

  const destroyed = await runtime.lifecycle.onDestroy()
  assert.equal(destroyed, true)
})
