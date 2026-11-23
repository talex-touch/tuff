const assert = require('node:assert/strict')
const nodeCrypto = require('node:crypto')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

// Helper for test vectors only: encode ASCII string into RFC 4648 Base32
function encodeBase32Ascii(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes = Buffer.from(str, 'ascii')
  let bits = 0
  let bitCount = 0
  let out = ''
  for (const byte of bytes) {
    bits = (bits << 8) | byte
    bitCount += 8
    while (bitCount >= 5) {
      bitCount -= 5
      out += alphabet[(bits >>> bitCount) & 31]
      bits &= (1 << bitCount) - 1
    }
  }
  if (bitCount > 0)
    out += alphabet[(bits << (5 - bitCount)) & 31]
  return out
}

// Official RFC 6238 Appendix B seeds
const RFC_SHA1_SEED = encodeBase32Ascii('12345678901234567890') // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SHA256_SEED = encodeBase32Ascii('12345678901234567890123456789012')
const RFC_SHA512_SEED = encodeBase32Ascii('1234567890123456789012345678901234567890123456789012345678901234')

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

  setAccessory(accessory) {
    this.basic.accessory = accessory
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

function createDigestOnlyCrypto() {
  const algoMap = {
    'SHA-1': 'sha1',
    'SHA-256': 'sha256',
    'SHA-384': 'sha384',
    'SHA-512': 'sha512',
  }
  const digest = async (alg, bytes) => {
    const resolved = algoMap[String(alg).toUpperCase()]
    if (!resolved)
      throw new Error(`unsupported algorithm: ${alg}`)
    const buf = nodeCrypto.createHash(resolved).update(Buffer.from(bytes)).digest()
    return Uint8Array.from(buf).buffer
  }
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    digest,
    subtle: { digest },
  }
}

function createHarness(options = {}) {
  const files = new Map(options.files || [])
  const secrets = new Map(options.secrets || [])
  const state = {
    items: [],
    clipboardWrites: [],
    logs: [],
    storageWrites: 0,
    secretSets: [],
    secretDeletes: [],
  }
  let nowMs = options.nowMs ?? 59_000

  class MockDate extends Date {
    constructor(...args) {
      if (args.length === 0)
        super(nowMs)
      else
        super(...args)
    }

    static now() {
      return nowMs
    }
  }

  const plugin = {
    storage: options.storage || {
      async getFile(name) {
        return files.get(name) ?? null
      },
      async setFile(name, value) {
        if (options.storageWriteError)
          throw options.storageWriteError
        state.storageWrites += 1
        files.set(name, value)
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

  const secretFacade = 'secret' in options
    ? options.secret
    : {
        async get(key) {
          if (options.secretGetError)
            throw options.secretGetError
          return secrets.has(key) ? secrets.get(key) : null
        },
        async set(key, value) {
          state.secretSets.push({ key, value })
          if (options.secretSetError)
            throw options.secretSetError
          secrets.set(key, value)
        },
        async delete(key) {
          state.secretDeletes.push(key)
          if (options.secretDeleteError)
            throw options.secretDeleteError
          secrets.delete(key)
        },
      }

  const sandbox = {
    plugin,
    secret: secretFacade,
    clipboard: 'clipboard' in options
      ? options.clipboard
      : {
          async writeText(text) {
            state.clipboardWrites.push(text)
          },
        },
    permission: 'permission' in options
      ? options.permission
      : {
          async check(id) {
            if (options.permissionError)
              throw options.permissionError
            return options.permissionGranted !== false && id === 'clipboard.write'
          },
        },
    logger: {
      warn(...args) { state.logs.push(['warn', ...args]) },
      error(...args) { state.logs.push(['error', ...args]) },
      info(...args) { state.logs.push(['info', ...args]) },
    },
    TuffItemBuilder: FakeBuilder,
    URLSearchParams,
    crypto: 'crypto' in options ? options.crypto : globalThis.crypto,
    Date: MockDate,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox

  const source = readFileSync(require.resolve('./index.js'), 'utf8')
  vm.runInNewContext(source, sandbox, { filename: 'touch-totp-vault/index.js' })
  return {
    module: sandbox.module.exports,
    state,
    files,
    secrets,
    setNow(ms) { nowMs = ms },
  }
}

test('RFC 6238 official SHA1 test vectors (T=59 -> 94287082, T=1111111109, T=1234567890, T=20000000000)', async () => {
  const h = createHarness({ nowMs: 59 * 1000 })
  await h.module.onInit()

  const uri = `otpauth://totp/RFC6238:sha1@test?secret=${RFC_SHA1_SEED}&issuer=RFC6238&algorithm=SHA1&digits=8&period=30`
  await h.module.onFeatureTriggered('totp-vault', { text: uri })
  assert.match(h.state.items[0].render.basic.subtitle, /9428 7082/)

  const saveRes = await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })
  assert.equal(saveRes.success, true)

  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [20000000000, '65353130'],
  ]
  for (const [epochSec, expectedCode] of vectors) {
    h.setNow(epochSec * 1000)
    await h.module.onFeatureTriggered('totp-vault', { text: '' })
    const item = h.state.items[0]
    assert.match(item.render.basic.title, new RegExp(`${expectedCode.slice(0, 4)} ${expectedCode.slice(4)}`))

    const copyRes = await h.module.onItemAction(item, { actionId: 'copy-code' })
    assert.equal(copyRes.success, true)
    assert.equal(h.state.clipboardWrites.at(-1), expectedCode)
  }
})

test('RFC 6238 official SHA256 (46119246) and SHA512 (90693936) test vectors at T=59', async () => {
  const h = createHarness({ nowMs: 59 * 1000 })
  await h.module.onInit()

  // SHA-256
  await h.module.onFeatureTriggered('totp-vault', {
    text: `add RFC256 sha256@test ${RFC_SHA256_SEED} digits=8 period=30 algo=SHA256`,
  })
  assert.match(h.state.items[0].render.basic.subtitle, /4611 9246/)
  await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })

  // SHA-512
  await h.module.onFeatureTriggered('totp-vault', {
    text: `otpauth://totp/RFC512:sha512@test?secret=${RFC_SHA512_SEED}&algorithm=SHA512&digits=8&period=30`,
  })
  assert.match(h.state.items[0].render.basic.subtitle, /9069 3936/)
  await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })

  await h.module.onFeatureTriggered('totp-vault', { text: '' })
  assert.equal(h.state.items.length, 2)
  assert.match(h.state.items[0].render.basic.title, /4611 9246/)
  assert.match(h.state.items[1].render.basic.title, /9069 3936/)
})

test('Tuff Prelude digest-only crypto.subtle (no importKey/sign) matches RFC 6238 SHA1/SHA256/SHA512 vectors', async () => {
  const h = createHarness({
    nowMs: 59 * 1000,
    crypto: createDigestOnlyCrypto(),
  })

  await h.module.onFeatureTriggered('totp-vault', {
    text: `otpauth://totp/Prelude:sha1?secret=${RFC_SHA1_SEED}&algorithm=SHA1&digits=8&period=30`,
  })
  assert.match(h.state.items[0].render.basic.subtitle, /9428 7082/)

  await h.module.onFeatureTriggered('totp-vault', {
    text: `otpauth://totp/Prelude:sha256?secret=${RFC_SHA256_SEED}&algorithm=SHA256&digits=8&period=30`,
  })
  assert.match(h.state.items[0].render.basic.subtitle, /4611 9246/)

  await h.module.onFeatureTriggered('totp-vault', {
    text: `otpauth://totp/Prelude:sha512?secret=${RFC_SHA512_SEED}&algorithm=SHA512&digits=8&period=30`,
  })
  assert.match(h.state.items[0].render.basic.subtitle, /9069 3936/)
})

test('secrets are stored EXCLUSIVELY in secret capability and NEVER leak to plugin.storage, items, or logs', async () => {
  const h = createHarness({ nowMs: 59 * 1000 })
  await h.module.onInit()

  const uri = `otpauth://totp/GitHub:alice@example.com?secret=${RFC_SHA1_SEED}&issuer=GitHub&digits=6&period=30`
  await h.module.onFeatureTriggered('totp-vault', { text: uri })

  // Rendered enrollment confirmation item must NEVER contain raw Base32 seed
  assert.equal(JSON.stringify(h.state.items).includes(RFC_SHA1_SEED), false)

  const saveRes = await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })
  assert.equal(saveRes.success, true)

  // Secret capability received exact seed under compliant key (/^[\w.-]{1,48}$/)
  assert.equal(h.secrets.size, 1)
  const [[storedKey, storedSecret]] = [...h.secrets.entries()]
  assert.match(storedKey, /^[\w.-]{1,48}$/)
  assert.equal(storedSecret, RFC_SHA1_SEED)

  // plugin.storage contains sanitized metadata ONLY — zero plaintext secret or otpauth URI
  const storedJson = JSON.stringify(h.files.get('totp-accounts.json'))
  assert.equal(storedJson.includes(RFC_SHA1_SEED), false)
  assert.equal(storedJson.includes('otpauth'), false)
  const account = h.files.get('totp-accounts.json').accounts[0]
  assert.equal(account.issuer, 'GitHub')
  assert.equal(account.label, 'alice@example.com')
  assert.equal(account.secretKey, storedKey)
  assert.equal('secret' in account, false)

  // Rendered live list and logs contain zero plaintext secret
  assert.equal(JSON.stringify(h.state.items).includes(RFC_SHA1_SEED), false)
  assert.equal(JSON.stringify(h.state.logs).includes(RFC_SHA1_SEED), false)
})

test('fail-closed: when secret.set fails, metadata is NEVER written to plugin.storage', async () => {
  const h = createHarness({
    nowMs: 59 * 1000,
    secretSetError: Object.assign(new Error('keychain locked'), {
      code: 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE',
    }),
  })
  await h.module.onInit()
  const writesBefore = h.state.storageWrites

  await h.module.onFeatureTriggered('totp-vault', {
    text: `add GitHub alice@example.com ${RFC_SHA1_SEED}`,
  })
  const saveRes = await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })

  assert.equal(saveRes.success, false)
  assert.equal(saveRes.status, 'blocked')
  assert.equal(saveRes.reason, 'capability-unavailable')
  assert.equal(h.state.storageWrites, writesBefore)
  assert.equal(h.files.get('totp-accounts.json').accounts.length, 0)
  assert.equal(h.secrets.size, 0)
  assert.equal(JSON.stringify(h.state.logs).includes(RFC_SHA1_SEED), false)
})

test('fail-closed: missing secret capability blocks enrollment and writes nothing to plugin.storage', async () => {
  const h = createHarness({ nowMs: 59 * 1000, secret: undefined })
  await h.module.onInit()
  const writesBefore = h.state.storageWrites

  await h.module.onFeatureTriggered('totp-vault', {
    text: `add AWS root@aws.local ${RFC_SHA1_SEED}`,
  })
  const saveRes = await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })
  assert.equal(saveRes.status, 'blocked')
  assert.equal(saveRes.reason, 'capability-unavailable')
  assert.equal(h.state.storageWrites, writesBefore)
  assert.equal(h.files.get('totp-accounts.json').accounts.length, 0)
})

test('rolls back secret via secret.delete if plugin.storage metadata write fails', async () => {
  const h = createHarness({
    nowMs: 59 * 1000,
    storageWriteError: new Error('disk full'),
  })

  await h.module.onFeatureTriggered('totp-vault', {
    text: `add GitLab dev@gitlab.com ${RFC_SHA1_SEED}`,
  })
  const saveRes = await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })

  assert.equal(saveRes.status, 'blocked')
  assert.equal(h.state.secretSets.length, 1)
  assert.deepEqual(h.state.secretDeletes, [h.state.secretSets[0].key])
  assert.equal(h.secrets.size, 0)
})

test('delete-account via context.actionId fails closed on secret.delete error and cleans both stores on success', async () => {
  const failingDelete = createHarness({
    nowMs: 59 * 1000,
    secretDeleteError: new Error('secure store error'),
  })
  await failingDelete.module.onInit()
  await failingDelete.module.onFeatureTriggered('totp-vault', {
    text: `add Stripe admin@stripe.com ${RFC_SHA1_SEED}`,
  })
  await failingDelete.module.onItemAction(failingDelete.state.items[0], { actionId: 'save-account' })
  const acctItem = failingDelete.state.items[0]

  const blockedDel = await failingDelete.module.onItemAction(acctItem, { actionId: 'delete-account' })
  assert.equal(blockedDel.status, 'blocked')
  assert.equal(failingDelete.files.get('totp-accounts.json').accounts.length, 1)

  // Happy path delete
  const h = createHarness({ nowMs: 59 * 1000 })
  await h.module.onInit()
  await h.module.onFeatureTriggered('totp-vault', {
    text: `add Stripe admin@stripe.com ${RFC_SHA1_SEED}`,
  })
  await h.module.onItemAction(h.state.items[0], { actionId: 'save-account' })
  const delRes = await h.module.onItemAction(h.state.items[0], { actionId: 'delete-account' })
  assert.equal(delRes.success, true)
  assert.equal(h.secrets.size, 0)
  assert.equal(h.files.get('totp-accounts.json').accounts.length, 0)
})

test('clipboard copy is strictly permission-gated and never bypasses clipboard.write', async () => {
  const denied = createHarness({ nowMs: 59 * 1000, permissionGranted: false })
  await denied.module.onInit()
  await denied.module.onFeatureTriggered('totp-vault', {
    text: `add GitHub alice ${RFC_SHA1_SEED}`,
  })
  await denied.module.onItemAction(denied.state.items[0], { actionId: 'save-account' })
  const item = denied.state.items[0]
  // All actions must use type 'plugin', never host 'copy'
  assert.equal(item.actions.every(a => a.type === 'plugin'), true)

  const res = await denied.module.onItemAction(item, { actionId: 'copy-code' })
  assert.equal(res.status, 'blocked')
  assert.equal(res.reason, 'permission-denied')
  assert.equal(denied.state.clipboardWrites.length, 0)

  // Missing permission SDK -> permission-sdk-unavailable
  const noSdk = createHarness({ nowMs: 59 * 1000, permission: undefined })
  await noSdk.module.onInit()
  await noSdk.module.onFeatureTriggered('totp-vault', {
    text: `add GitHub alice ${RFC_SHA1_SEED}`,
  })
  await noSdk.module.onItemAction(noSdk.state.items[0], { actionId: 'save-account' })
  const res2 = await noSdk.module.onItemAction(noSdk.state.items[0], { actionId: 'copy-code' })
  assert.equal(res2.status, 'blocked')
  assert.equal(res2.reason, 'permission-sdk-unavailable')
})

test('rejects invalid otpauth URIs, HOTP, invalid Base32, and unsupported algorithms cleanly', async () => {
  const h = createHarness({ nowMs: 59 * 1000 })

  const badInputs = [
    `otpauth://hotp/Test:a?secret=${RFC_SHA1_SEED}`,
    'otpauth://totp/Test:a?secret=INVALID0189',
    `otpauth://totp/Test:a?secret=${RFC_SHA1_SEED}&algorithm=MD5`,
    `otpauth://totp/Test:a?secret=${RFC_SHA1_SEED}&digits=7`,
    `otpauth://totp/Test:a?secret=${RFC_SHA1_SEED}&period=5`,
  ]
  for (const input of badInputs) {
    await h.module.onFeatureTriggered('totp-vault', { text: input })
    assert.equal(h.state.items[0].id, 'totp-vault-input-error', `expected rejection for ${input}`)
  }
})

test('countdown bar reflects remaining seconds and onDestroy clears pending drafts and blocks calls', async () => {
  const h = createHarness({ nowMs: 59 * 1000 }) // 59 % 30 = 29 -> 1s remaining!
  await h.module.onFeatureTriggered('totp-vault', {
    text: `add GitHub alice ${RFC_SHA1_SEED}`,
  })
  const enrollItem = h.state.items[0]
  assert.match(enrollItem.render.basic.subtitle, /1s/)

  h.module.onDestroy()
  assert.equal(await h.module.onFeatureTriggered('totp-vault', { text: '' }), false)
  const actRes = await h.module.onItemAction(enrollItem, { actionId: 'save-account' })
  assert.equal(actRes.status, 'blocked')
  assert.equal(actRes.reason, 'cancelled')
  assert.equal(h.secrets.size, 0)
})

test('trigger generation guard prevents stale async secret lookup from overwriting newer results', async () => {
  let releaseFirst
  const firstSecret = new Promise((resolve) => { releaseFirst = resolve })
  let reads = 0
  const h = createHarness({
    nowMs: 59 * 1000,
    files: [['totp-accounts.json', {
      version: 1,
      accounts: [{
        id: 'acct_slow',
        secretKey: 'totp.acct_slow',
        issuer: 'SlowCorp',
        label: 'slow@test',
        algorithm: 'SHA-1',
        digits: 8,
        period: 30,
        createdAt: 1,
      }],
    }]],
    secret: {
      async get() {
        reads += 1
        if (reads === 1)
          return firstSecret
        return RFC_SHA1_SEED
      },
      async set() {},
      async delete() {},
    },
  })

  const slowTrigger = h.module.onFeatureTriggered('totp-vault', { text: '' })
  await Promise.resolve()
  await h.module.onFeatureTriggered('totp-vault', { text: 'nomatch' })
  assert.equal(h.state.items[0].id, 'totp-vault-empty')

  releaseFirst(RFC_SHA1_SEED)
  await slowTrigger
  assert.equal(h.state.items[0].id, 'totp-vault-empty')
})
