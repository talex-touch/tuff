const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

globalThis.plugin = { storage: {} }
globalThis.dialog = {}
globalThis.logger = {}
const permissionRef = {
  async check() {
    return true
  },
}
globalThis.permission = permissionRef
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, meta: {} }
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

  build() {
    return this.item
  }
}

const {
  buildShellCapability,
  formatShellStatusSubtitle,
  parsePackageScriptsMap,
  resolveCommandCwd,
  resolveShellCapabilityState,
  runCommand,
  setSpawnShellCommandForTest,
  validateCommandRequest,
} = require('./index.js').__test

test.afterEach(() => {
  permissionRef.check = async () => true
  setSpawnShellCommandForTest(null)
})

test('buildShellCapability includes audit source and explicit reason', () => {
  const capability = buildShellCapability({
    featureId: 'workspace-scripts',
    actionId: 'run-command',
    commandSource: 'package-script',
    requiresConfirmation: true,
    status: 'permission-missing',
    reason: 'system-shell-permission-required',
  })

  assert.equal(capability.status, 'permission-missing')
  assert.equal(capability.reason, 'system-shell-permission-required')
  assert.equal(capability.audit.commandSource, 'package-script')
  assert.equal(capability.audit.requiresConfirmation, true)
})

test('resolveShellCapabilityState reports missing permission without requesting it', async () => {
  setSpawnShellCommandForTest(() => ({
    unref() {},
  }))
  permissionRef.check = async (permissionId) => {
    assert.equal(permissionId, 'system.shell')
    return false
  }

  const state = await resolveShellCapabilityState()

  assert.equal(state.status, 'permission-missing')
  assert.equal(state.reason, 'system-shell-permission-required')
})

test('formatShellStatusSubtitle keeps unsupported reason visible', () => {
  assert.equal(
    formatShellStatusSubtitle({ status: 'unsupported', reason: 'safe-shell-unavailable' }),
    '不可用 · safe-shell-unavailable',
  )
})

test('validateCommandRequest blocks unsafe payloads and unavailable cwd', () => {
  assert.deepEqual(validateCommandRequest('echo ok\nrm -rf /', process.cwd()), {
    ok: false,
    reason: 'unsafe-command-payload',
  })

  const missing = validateCommandRequest('echo ok', path.join(os.tmpdir(), 'tuff-missing-cwd'))
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'cwd-unavailable')
})

test('runCommand fails closed when safe-shell is unavailable', () => {
  setSpawnShellCommandForTest(null)
  const result = runCommand('echo ok', process.cwd())

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'safe-shell-unavailable')
})

test('runCommand uses safe-shell with normalized cwd and command', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-scripts-'))
  const calls = []
  setSpawnShellCommandForTest((command, options) => {
    calls.push({ command, options })
    return {
      pid: 123,
      unref() {},
    }
  })

  const result = runCommand('  pnpm test  ', tempDir)

  assert.equal(result.ok, true)
  assert.equal(result.pid, 123)
  assert.equal(calls[0].command, 'pnpm test')
  assert.equal(calls[0].options.cwd, tempDir)
  assert.equal(calls[0].options.detached, true)
})

test('parsePackageScriptsMap exposes package scripts as pnpm commands', () => {
  const scripts = parsePackageScriptsMap({
    dev: 'vite',
    empty: '',
    lint: 'eslint .',
  })

  assert.deepEqual(scripts.map(script => script.command), ['pnpm dev', 'pnpm lint'])
})

test('resolveCommandCwd keeps relative commands inside workspace', () => {
  assert.equal(
    resolveCommandCwd('apps/core-app', '/workspace'),
    path.join('/workspace', 'apps/core-app'),
  )
})
