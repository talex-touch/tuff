const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

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

  setIcon(icon) {
    this.basic.icon = icon
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
    this.item.render = { mode: 'default', basic: { ...this.basic } }
    return this.item
  }
}

function createHarness(options = {}) {
  const storageFiles = new Map(options.files || [])
  const secretStore = new Map(options.secrets || [])
  const grantedPermissions = new Set(
    options.permissions ?? ['network.internet', 'storage.plugin', 'clipboard.write'],
  )
  const state = {
    items: [],
    httpCalls: [],
    clipboardWrites: [],
    storageWrites: [],
    secretSets: [],
    secretDeletes: [],
    logs: [],
  }

  const plugin = {
    storage: options.omitStorage
      ? undefined
      : {
          async getFile(name) {
            if (options.onGetFile)
              await options.onGetFile(name)
            return storageFiles.has(name) ? structuredClone(storageFiles.get(name)) : null
          },
          async setFile(name, value) {
            if (typeof options.onSetFile === 'function')
              await options.onSetFile(name, value)
            state.storageWrites.push({ name, value: structuredClone(value) })
            storageFiles.set(name, structuredClone(value))
          },
          async deleteFile(name) {
            return storageFiles.delete(name)
          },
        },
    feature: {
      async clearItems() {
        if (options.beforeClear)
          await options.beforeClear()
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }

  const http = options.omitHttp
    ? undefined
    : {
        async request(config) {
          state.httpCalls.push(structuredClone(config))
          if (typeof options.onHttp === 'function')
            return options.onHttp(config)
          return {
            status: 200,
            statusText: 'OK',
            ok: true,
            url: config.url,
            headers: { 'content-type': 'application/json', 'x-request-id': 'req-42' },
            data: '{"hello":"tuff","count":3}',
          }
        },
      }

  const secret = options.omitSecret
    ? undefined
    : {
        async get(key) {
          if (options.failSecretGet)
            throw new Error('secure store locked')
          return secretStore.has(key) ? secretStore.get(key) : null
        },
        async set(key, value) {
          state.secretSets.push({ key, value })
          if (options.failSecretSet)
            throw new Error('keychain unavailable')
          secretStore.set(key, value)
        },
        async delete(key) {
          state.secretDeletes.push(key)
          if (options.failSecretDelete)
            throw new Error('keychain delete failed')
          secretStore.delete(key)
        },
      }

  const clipboard = options.omitClipboard
    ? undefined
    : {
        async writeText(text) {
          state.clipboardWrites.push(text)
          if (options.failClipboard)
            throw new Error('clipboard write failed')
        },
      }

  const permission = options.omitPermission
    ? undefined
    : {
        async check(permissionId) {
          if (options.failPermissionCheck)
            throw new Error('permission ipc down')
          return grantedPermissions.has(permissionId)
        },
      }

  const sandbox = {
    plugin,
    http,
    secret,
    clipboard,
    permission,
    logger: {
      info: msg => state.logs.push(msg),
      warn: msg => state.logs.push(msg),
      error: msg => state.logs.push(msg),
    },
    TuffItemBuilder: FakeBuilder,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox

  vm.runInNewContext(readFileSync(require.resolve('./index.js'), 'utf8'), sandbox, {
    filename: 'touch-api-lens/index.js',
  })

  return {
    module: sandbox.module.exports,
    state,
    storageFiles,
    secretStore,
    grantedPermissions,
  }
}

function findItemByAction(items, actionId) {
  return items.find(item => item.actions?.some(action => action.id === actionId))
}

test('exports only canonical lifecycle hooks and uses zero forbidden runtime globals', () => {
  const source = readFileSync(require.resolve('./index.js'), 'utf8')
  assert.doesNotMatch(source, /\brequire\s*\(/)
  assert.doesNotMatch(source, /\bprocess\b/)
  assert.doesNotMatch(source, /\bBuffer\b/)
  assert.doesNotMatch(source, /\beval\s*\(/)
  assert.doesNotMatch(source, /\bnew\s+Function\b/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)

  const harness = createHarness()
  assert.deepEqual(Object.keys(harness.module).sort(), [
    'onDestroy',
    'onFeatureTriggered',
    'onItemAction',
  ])
})

test('parses cURL commands, redacts auth headers in previews, and keeps secrets out of item payloads', async () => {
  const harness = createHarness()
  const rawToken = 'example-bearer-secret-9988'
  const rawApiKey = 'dummy-x-api-key-7766'
  const curlCmd = [
    'curl -X POST https://api.example.com/v1/projects \\',
    `-H "Authorization: Bearer ${rawToken}" \\`,
    `-H "X-API-Key: ${rawApiKey}" \\`,
    '-H "Accept: application/json" \\',
    '-d \'{"name":"tuff"}\'',
  ].join('\n')

  await harness.module.onFeatureTriggered('api-lens', { text: curlCmd })

  const serializedItems = JSON.stringify(harness.state.items)
  assert.doesNotMatch(serializedItems, new RegExp(rawToken))
  assert.doesNotMatch(serializedItems, new RegExp(rawApiKey))

  const sendItem = findItemByAction(harness.state.items, 'send-request')
  assert.ok(sendItem)
  assert.match(sendItem.render.basic.title, /Send POST https:\/\/api\.example\.com\/v1\/projects/)
  assert.match(sendItem.render.basic.subtitle, /2 secret header\(s\) redacted/)

  const headersItem = harness.state.items.find(item => item.id === 'api-lens-preview-headers')
  assert.ok(headersItem)
  assert.match(headersItem.render.basic.subtitle, /Authorization: Bearer ••••/)
  assert.match(headersItem.render.basic.subtitle, /X-API-Key: ••••/)
  assert.match(headersItem.render.basic.subtitle, /Accept: application\/json/)
})

test('parses shorthand HTTP syntax and curl -G / -u flags accurately', async () => {
  const harness = createHarness()

  await harness.module.onFeatureTriggered('api-lens', {
    text: 'api POST https://httpbin.org/post {"hello":"world"}',
  })
  const postItem = findItemByAction(harness.state.items, 'send-request')
  await harness.module.onItemAction(postItem)
  assert.equal(harness.state.httpCalls.length, 1)
  assert.equal(harness.state.httpCalls[0].method, 'POST')
  assert.equal(harness.state.httpCalls[0].headers['Content-Type'], 'application/json')
  assert.equal(harness.state.httpCalls[0].body, '{"hello":"world"}')

  await harness.module.onFeatureTriggered('api-lens', {
    text: 'curl -G -u "alice:example-pass" -d "page=2" https://api.example.com/items',
  })
  const getItem = findItemByAction(harness.state.items, 'send-request')
  await harness.module.onItemAction(getItem)
  assert.equal(harness.state.httpCalls.length, 2)
  assert.equal(harness.state.httpCalls[1].method, 'GET')
  assert.equal(harness.state.httpCalls[1].url, 'https://api.example.com/items?page=2')
  assert.match(harness.state.httpCalls[1].headers.Authorization, /^Basic /)
})

test('executes HTTP request via http facade, formats JSON response + status + latency', async () => {
  const harness = createHarness({
    onHttp: async () => ({
      status: 201,
      statusText: 'Created',
      ok: true,
      url: 'https://api.example.com/items',
      headers: { 'content-type': 'application/json' },
      data: '{"id":42,"created":true}',
    }),
  })

  await harness.module.onFeatureTriggered('api-lens', {
    text: 'GET https://api.example.com/items',
  })
  const sendItem = findItemByAction(harness.state.items, 'send-request')
  const result = await harness.module.onItemAction(sendItem)

  assert.equal(result.success, true)
  assert.equal(result.status, 'completed')
  assert.match(result.message, /201 Created \(\d+ms/)

  const copyRespItem = findItemByAction(harness.state.items, 'copy-response')
  assert.ok(copyRespItem)
  const copyRes = await harness.module.onItemAction(copyRespItem)
  assert.equal(copyRes.status, 'copied')
  assert.equal(harness.state.clipboardWrites[0], '{\n  "id": 42,\n  "created": true\n}')
})

test('exports redacted cURL and fetch() snippets honoring context.actionId', async () => {
  const harness = createHarness()
  const rawSecret = 'example-super-secret-token'
  await harness.module.onFeatureTriggered('api-lens', {
    text: `curl -X PUT https://api.example.com/v1/profile -H "Authorization: Bearer ${rawSecret}" -H "X-Env: staging" --json '{"role":"admin"}'`,
  })

  const sendItem = findItemByAction(harness.state.items, 'send-request')
  assert.ok(sendItem)

  const curlCopy = await harness.module.onItemAction(sendItem, { actionId: 'copy-curl' })
  assert.equal(curlCopy.status, 'copied')
  assert.match(harness.state.clipboardWrites[0], /curl -X PUT/)
  assert.match(harness.state.clipboardWrites[0], /Bearer <API_TOKEN>/)
  assert.doesNotMatch(harness.state.clipboardWrites[0], new RegExp(rawSecret))

  const fetchCopy = await harness.module.onItemAction(sendItem, { actionId: 'copy-fetch' })
  assert.equal(fetchCopy.status, 'copied')
  assert.match(harness.state.clipboardWrites[1], /await fetch\("https:\/\/api\.example\.com\/v1\/profile"/)
  assert.match(harness.state.clipboardWrites[1], /Bearer <API_TOKEN>/)
  assert.match(harness.state.clipboardWrites[1], /JSON\.stringify\(/)
  assert.doesNotMatch(harness.state.clipboardWrites[1], new RegExp(rawSecret))
})

test('fails closed when network.internet permission is denied, SDK missing, or http unavailable', async () => {
  const denied = createHarness({ permissions: ['storage.plugin', 'clipboard.write'] })
  await denied.module.onFeatureTriggered('api-lens', { text: 'GET https://api.example.com/ping' })
  const deniedRes = await denied.module.onItemAction(findItemByAction(denied.state.items, 'send-request'))
  assert.equal(deniedRes.status, 'blocked')
  assert.equal(deniedRes.reason, 'network-internet-permission-required')
  assert.equal(denied.state.httpCalls.length, 0)

  const noPermSdk = createHarness({ omitPermission: true })
  await noPermSdk.module.onFeatureTriggered('api-lens', { text: 'GET https://api.example.com/ping' })
  const sdkRes = await noPermSdk.module.onItemAction(findItemByAction(noPermSdk.state.items, 'send-request'))
  assert.equal(sdkRes.status, 'blocked')
  assert.equal(sdkRes.reason, 'permission-sdk-unavailable')
  assert.equal(noPermSdk.state.httpCalls.length, 0)

  const noHttp = createHarness({ omitHttp: true })
  await noHttp.module.onFeatureTriggered('api-lens', { text: 'GET https://api.example.com/ping' })
  const capRes = await noHttp.module.onItemAction(findItemByAction(noHttp.state.items, 'send-request'))
  assert.equal(capRes.status, 'blocked')
  assert.equal(capRes.reason, 'capability-unavailable')
})

test('isolates Bearer tokens exclusively in secret store when saving and rehydrates on run-preset', async () => {
  const harness = createHarness()
  const rawToken = 'example-saved-bearer-4455'
  await harness.module.onFeatureTriggered('api-lens', {
    text: `save github-me curl https://api.github.com/user -H "Authorization: Bearer ${rawToken}" -H "Accept: application/vnd.github+json"`,
  })

  const saveItem = findItemByAction(harness.state.items, 'save-preset')
  assert.ok(saveItem)
  const saveRes = await harness.module.onItemAction(saveItem)
  assert.equal(saveRes.success, true)
  assert.equal(saveRes.status, 'saved')

  // Verify plugin.storage contains ZERO secrets
  const persisted = harness.storageFiles.get('collections.json')
  assert.ok(persisted)
  assert.equal(persisted.presets.length, 1)
  assert.doesNotMatch(JSON.stringify(persisted), new RegExp(rawToken))
  assert.deepEqual(persisted.presets[0].headers, { Accept: 'application/vnd.github+json' })
  assert.deepEqual(persisted.presets[0].secretHeaderNames, ['Authorization'])
  assert.match(persisted.presets[0].secretKey, /^[\w.-]{1,48}$/)

  // Verify secret store holds the exact auth header
  const storedSecret = JSON.parse(harness.secretStore.get(persisted.presets[0].secretKey))
  assert.equal(storedSecret.Authorization, `Bearer ${rawToken}`)

  // Run saved preset and confirm secret header is rehydrated for http.request
  await harness.module.onFeatureTriggered('api-lens', { text: 'run github-me' })
  const runItem = findItemByAction(harness.state.items, 'run-preset')
  assert.ok(runItem)
  const runRes = await harness.module.onItemAction(runItem)
  assert.equal(runRes.success, true)
  assert.equal(harness.state.httpCalls.length, 1)
  assert.equal(harness.state.httpCalls[0].headers.Authorization, `Bearer ${rawToken}`)
  assert.equal(harness.state.httpCalls[0].headers.Accept, 'application/vnd.github+json')
})

test('fails closed and writes zero metadata to plugin.storage if secret.set fails', async () => {
  const harness = createHarness({ failSecretSet: true })
  await harness.module.onFeatureTriggered('api-lens', {
    text: 'save billing curl https://api.stripe.com/v1/balance -H "Authorization: Bearer example-token-fail"',
  })

  const saveItem = findItemByAction(harness.state.items, 'save-preset')
  const saveRes = await harness.module.onItemAction(saveItem)
  assert.equal(saveRes.success, false)
  assert.equal(saveRes.status, 'blocked')
  assert.equal(saveRes.reason, 'secret-write-failed')
  assert.equal(harness.state.storageWrites.length, 0)
  assert.equal(harness.storageFiles.has('collections.json'), false)
})

test('fails closed on run-preset when expected auth secret is missing from secret store', async () => {
  const harness = createHarness({
    files: [
      ['collections.json', {
        presets: [{
          id: 'preset-auth1',
          name: 'secure-ep',
          method: 'GET',
          url: 'https://api.example.com/private',
          headers: {},
          secretHeaderNames: ['Authorization'],
          secretKey: 'apilens.secure-ep.12345678',
          body: null,
        }],
      }],
    ],
  })

  await harness.module.onFeatureTriggered('api-lens', { text: 'run secure-ep' })
  const runItem = findItemByAction(harness.state.items, 'run-preset')
  const res = await harness.module.onItemAction(runItem)
  assert.equal(res.success, false)
  assert.equal(res.status, 'blocked')
  assert.equal(res.reason, 'secret-unavailable')
  assert.equal(harness.state.httpCalls.length, 0)
})

test('deletes saved preset and purges secret from secret store', async () => {
  const harness = createHarness()
  await harness.module.onFeatureTriggered('api-lens', {
    text: 'save temp-api curl https://api.example.com/tmp -H "X-API-Key: dummy-temp-key"',
  })
  await harness.module.onItemAction(findItemByAction(harness.state.items, 'save-preset'))
  const secretKey = harness.storageFiles.get('collections.json').presets[0].secretKey
  assert.equal(harness.secretStore.has(secretKey), true)

  await harness.module.onFeatureTriggered('api-lens', { text: 'delete temp-api' })
  const delItem = findItemByAction(harness.state.items, 'delete-preset')
  const delRes = await harness.module.onItemAction(delItem)
  assert.equal(delRes.success, true)
  assert.equal(delRes.status, 'deleted')
  assert.equal(harness.secretStore.has(secretKey), false)
  assert.deepEqual(harness.storageFiles.get('collections.json').presets, [])
})

test('enforces trigger generation guard and clears state on onDestroy()', async () => {
  let releaseFirst
  let callCount = 0
  const harness = createHarness({
    onGetFile: async () => {
      callCount += 1
      if (callCount === 1) {
        await new Promise((resolve) => {
          releaseFirst = resolve
        })
      }
    },
  })

  const firstTrigger = harness.module.onFeatureTriggered('api-lens', {
    text: 'GET https://api.example.com/slow',
  })
  await new Promise(resolve => setTimeout(resolve, 5))
  await harness.module.onFeatureTriggered('api-lens', {
    text: 'GET https://api.example.com/fast',
  })
  releaseFirst()
  await firstTrigger

  const sendItem = harness.state.items.find(item => item.meta.defaultAction === 'send-request')
  assert.ok(sendItem)
  assert.match(sendItem.render.basic.title, /\/fast/)

  harness.module.onDestroy()
  const afterDestroy = await harness.module.onItemAction(sendItem)
  assert.equal(afterDestroy.status, 'blocked')
  assert.equal(afterDestroy.reason, 'stale-request')
})

test('blocks clipboard copy when clipboard.write is denied and ignores foreign items', async () => {
  const harness = createHarness({ permissions: ['network.internet', 'storage.plugin'] })
  await harness.module.onFeatureTriggered('api-lens', { text: 'GET https://api.example.com/data' })

  const copyCurlItem = harness.state.items.find(item => item.meta.defaultAction === 'copy-curl')
  assert.ok(copyCurlItem)
  const res = await harness.module.onItemAction(copyCurlItem)
  assert.equal(res.status, 'blocked')
  assert.equal(res.reason, 'permission-denied')
  assert.equal(harness.state.clipboardWrites.length, 0)

  const foreign = await harness.module.onItemAction({
    source: { type: 'plugin', id: 'other-plugin' },
    meta: { pluginName: 'other-plugin', featureId: 'other', defaultAction: 'copy-curl' },
    actions: [{ id: 'copy-curl', type: 'plugin', payload: { token: 'fake' } }],
  })
  assert.equal(foreign, undefined)
})

test('rolls back newly written secret if collections.json persistence fails', async () => {
  const harness = createHarness({
    onSetFile: async () => {
      throw new Error('disk full')
    },
  })
  await harness.module.onFeatureTriggered('api-lens', {
    text: 'save fail-api curl https://api.example.com/fail -H "Authorization: Bearer secret-token-123"',
  })
  const saveItem = findItemByAction(harness.state.items, 'save-preset')
  const res = await harness.module.onItemAction(saveItem)
  assert.equal(res.success, false)
  assert.equal(res.status, 'blocked')
  assert.equal(harness.secretStore.size, 0)
})

test('strips/vaults URL userinfo, sensitive query params, and sensitive JSON/form body fields, rehydrates on run, and preserves $ in fetch()', async () => {
  const harness = createHarness()
  const rawQuerySecret = 'query-api-key-secret-8899'
  const rawBodySecret = 'body-client-secret-7766'
  const rawPass = 'url-pass-5544'

  await harness.module.onFeatureTriggered('api-lens', {
    text: `save vault-all curl -X POST "https://alice:${rawPass}@api.example.com/v1/login?api_key=${rawQuerySecret}&page=1" --json '{"user":"alice","client_secret":"${rawBodySecret}","note":"cost $& $$"}'`,
  })

  // Previews and exported snippets must NEVER leak URL userinfo, query secrets, or body secrets
  const itemsJson = JSON.stringify(harness.state.items)
  assert.doesNotMatch(itemsJson, new RegExp(`${rawPass}|${rawQuerySecret}|${rawBodySecret}`))

  const sendItem = findItemByAction(harness.state.items, 'send-request')
  await harness.module.onItemAction(sendItem, { actionId: 'copy-fetch' })
  const fetchSnippet = harness.state.clipboardWrites.at(-1)
  assert.doesNotMatch(fetchSnippet, new RegExp(`${rawPass}|${rawQuerySecret}|${rawBodySecret}`))
  assert.match(fetchSnippet, /cost \$& \$\$/)

  // Save preset and verify collections.json has ZERO secrets
  const saveRes = await harness.module.onItemAction(findItemByAction(harness.state.items, 'save-preset'))
  assert.equal(saveRes.success, true)
  const storedCollections = harness.storageFiles.get('collections.json')
  const collectionsJson = JSON.stringify(storedCollections)
  assert.doesNotMatch(collectionsJson, new RegExp(`${rawPass}|${rawQuerySecret}|${rawBodySecret}`))
  assert.match(storedCollections.presets[0].secretKey, /^apilens\.[0-9a-f]{32}$/)

  // Run preset and verify headers, query params, and body fields are all rehydrated
  await harness.module.onFeatureTriggered('api-lens', { text: 'run vault-all' })
  const runRes = await harness.module.onItemAction(findItemByAction(harness.state.items, 'run-preset'))
  assert.equal(runRes.success, true)
  assert.equal(harness.state.httpCalls.length, 1)
  assert.equal(harness.state.httpCalls[0].url, `https://api.example.com/v1/login?api_key=${rawQuerySecret}&page=1`)
  assert.match(harness.state.httpCalls[0].headers.Authorization, /^Basic /)
  assert.deepEqual(JSON.parse(harness.state.httpCalls[0].body), {
    user: 'alice',
    client_secret: rawBodySecret,
    note: 'cost $& $$',
  })
})

test('purges vault secret keys when presets are evicted beyond MAX_PRESETS', async () => {
  const existingPresets = Array.from({ length: 64 }, (_, i) => ({
    id: `preset-old-${i}`,
    name: `old-${i}`,
    method: 'GET',
    url: `https://api.example.com/items/${i}`,
    headers: {},
    secretHeaderNames: ['Authorization'],
    secretKey: `apilens.${String(i).padStart(32, '0')}`,
    body: null,
  }))
  const existingSecrets = existingPresets.map(p => [p.secretKey, JSON.stringify({ Authorization: `Bearer tok-${p.name}` })])
  const evictedKey = existingPresets[63].secretKey

  const harness = createHarness({
    files: [['collections.json', { presets: existingPresets }]],
    secrets: existingSecrets,
  })
  assert.equal(harness.secretStore.has(evictedKey), true)

  await harness.module.onFeatureTriggered('api-lens', {
    text: 'save newest GET https://api.example.com/new',
  })
  const saveRes = await harness.module.onItemAction(findItemByAction(harness.state.items, 'save-preset'))
  assert.equal(saveRes.success, true)
  assert.equal(harness.storageFiles.get('collections.json').presets.length, 64)
  assert.equal(harness.secretStore.has(evictedKey), false)
  assert.ok(harness.state.secretDeletes.includes(evictedKey))
})
