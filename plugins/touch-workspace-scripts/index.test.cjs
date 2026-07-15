const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

// Shared mock globals
globalThis.plugin = { storage: {} }
globalThis.dialog = {}
globalThis.logger = {}
const permissionRef = {
  async check() { return true },
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
  readPackageScripts,
  resolveCommandCwd,
  resolveShellCapabilityState,
  resolveSpawnRequest,
  runCommand,
  setSpawnShellCommandForTest,
  validateCommandRequest,
  SHELL_VALIDATION_PATTERN,
  executeCommand,
} = require('./index.js').__test

test.afterEach(() => {
  permissionRef.check = async () => true
  setSpawnShellCommandForTest(null)
})

// ---------------------------------------------------------------------------
// #1 Shell injection detection
// ---------------------------------------------------------------------------
test('SHELL_VALIDATION_PATTERN blocks shell injection characters', () => {
  // Should block
  assert.equal(SHELL_VALIDATION_PATTERN.test('echo ok; rm -rf /'), true, '; should be blocked')
  assert.equal(SHELL_VALIDATION_PATTERN.test('cat /etc/passwd | grep root'), true, '| should be blocked')
  assert.equal(SHELL_VALIDATION_PATTERN.test('echo $(whoami)'), true, '$() should be blocked')
  assert.equal(SHELL_VALIDATION_PATTERN.test('echo `whoami`'), true, 'backticks should be blocked')
  assert.equal(SHELL_VALIDATION_PATTERN.test('echo ok\nrm -rf /'), true, 'newline should be blocked')
  assert.equal(SHELL_VALIDATION_PATTERN.test('echo\x00ok'), true, 'null byte should be blocked')

  // Should pass (normal structured dev commands)
  assert.equal(SHELL_VALIDATION_PATTERN.test('pnpm test'), false)
  assert.equal(SHELL_VALIDATION_PATTERN.test('pnpm lint --fix'), false)
  assert.equal(SHELL_VALIDATION_PATTERN.test('vite build --mode production'), false)
  // Shell chaining is intentionally blocked because commands run without a shell
  assert.equal(SHELL_VALIDATION_PATTERN.test('pnpm lint && pnpm test'), true)
  // Single backtick should also be blocked (command substitution)
  const hasBacktick = SHELL_VALIDATION_PATTERN.test('echo `whoami`')
  assert.equal(hasBacktick, true, 'Single backtick should be blocked')
})

test('validateCommandRequest blocks unsafe payloads', () => {
  assert.deepEqual(validateCommandRequest('echo ok | sh', process.cwd()), {
    ok: false,
    reason: 'unsupported-shell-syntax',
  })
  assert.deepEqual(validateCommandRequest('echo $(id)', process.cwd()), {
    ok: false,
    reason: 'unsupported-shell-syntax',
  })
})

test('validateCommandRequest blocks unavailable cwd', () => {
  const missing = validateCommandRequest('echo ok', path.join(os.tmpdir(), 'tuff-missing-cwd'))
  assert.equal(missing.ok, false)
  assert.equal(missing.reason, 'cwd-unavailable')
})

// ---------------------------------------------------------------------------
// buildShellCapability
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// resolveShellCapabilityState
// ---------------------------------------------------------------------------
test('resolveShellCapabilityState reports missing permission without requesting it', async () => {
  setSpawnShellCommandForTest(() => ({ unref() {} }))
  permissionRef.check = async (permissionId) => {
    assert.equal(permissionId, 'system.shell')
    return false
  }
  const state = await resolveShellCapabilityState()
  assert.equal(state.status, 'permission-missing')
  assert.equal(state.reason, 'system-shell-permission-required')
})

test('resolveShellCapabilityState returns cached result on second call', async () => {
  setSpawnShellCommandForTest(() => ({ unref() {} }))
  let callCount = 0
  permissionRef.check = async () => {
    callCount++
    return true
  }

  // Clear any stale cache
  const { cacheInvalidate } = require('./index.js').__test
  cacheInvalidate()

  await resolveShellCapabilityState()
  assert.equal(callCount, 1)
  await resolveShellCapabilityState()
  // Should be cached — no additional permission check call
  assert.equal(callCount, 1)
})

// ---------------------------------------------------------------------------
// formatShellStatusSubtitle
// ---------------------------------------------------------------------------
test('formatShellStatusSubtitle keeps unsupported reason visible', () => {
  const subtitle = formatShellStatusSubtitle({ status: 'unsupported', reason: 'safe-command-unavailable' })
  // Label depends on locale, but reason text is always appended
  assert.ok(subtitle.includes('safe-command-unavailable'))
})

// ---------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------
test('runCommand fails closed when safe command runner is unavailable', () => {
  setSpawnShellCommandForTest(null)
  const result = runCommand('echo ok', process.cwd())
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'safe-command-unavailable')
})

test('runCommand blocks command with pipe character', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-scripts-'))
  let called = false
  setSpawnShellCommandForTest(() => {
    called = true
    return { pid: 1, unref() {} }
  })
  const result = runCommand('echo ok | sh', tempDir)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'unsupported-shell-syntax')
  assert.equal(called, false)
})

test('resolveSpawnRequest keeps structured args on non-Windows', () => {
  if (process.platform === 'win32')
    return
  assert.deepEqual(resolveSpawnRequest({ executable: 'pnpm', args: ['test'] }), {
    executable: 'pnpm',
    args: ['test'],
  })
})

test('runCommand uses safe command runner with normalized cwd and command', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-scripts-'))
  const calls = []
  setSpawnShellCommandForTest((command, args, options) => {
    calls.push({ command, args, options })
    return { pid: 123, unref() {} }
  })
  const result = runCommand('  pnpm test  ', tempDir)
  assert.equal(result.ok, true)
  assert.equal(result.pid, 123)
  assert.equal(calls[0].command, 'pnpm')
  assert.deepEqual(calls[0].args, ['test'])
  assert.equal(calls[0].options.cwd, tempDir)
  assert.equal(calls[0].options.detached, true)
})

// ---------------------------------------------------------------------------
// parsePackageScriptsMap
// ---------------------------------------------------------------------------
test('parsePackageScriptsMap exposes package scripts as pnpm commands', () => {
  const scripts = parsePackageScriptsMap({
    dev: 'vite',
    empty: '',
    lint: 'eslint .',
  })
  assert.deepEqual(scripts.map(s => s.command), ['pnpm dev', 'pnpm lint'])
})

test('readPackageScripts caches per workspace path', async () => {
  const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-scripts-a-'))
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-workspace-scripts-b-'))
  fs.writeFileSync(path.join(firstDir, 'package.json'), JSON.stringify({ scripts: { first: 'vite' } }))
  fs.writeFileSync(path.join(secondDir, 'package.json'), JSON.stringify({ scripts: { second: 'vite' } }))

  const { cacheInvalidate } = require('./index.js').__test
  cacheInvalidate()
  permissionRef.check = async () => true
  permissionRef.request = async () => true

  assert.deepEqual((await readPackageScripts(firstDir)).map(s => s.command), ['pnpm first'])
  assert.deepEqual((await readPackageScripts(secondDir)).map(s => s.command), ['pnpm second'])
})

// ---------------------------------------------------------------------------
// resolveCommandCwd
// ---------------------------------------------------------------------------
test('resolveCommandCwd keeps relative commands inside workspace', () => {
  assert.equal(resolveCommandCwd('apps/core-app', '/workspace'), path.join('/workspace', 'apps/core-app'))
})

// ---------------------------------------------------------------------------
// executeCommand (integration-level)
// ---------------------------------------------------------------------------
test('executeCommand blocks when permission is denied', async () => {
  setSpawnShellCommandForTest(() => ({ pid: 1, unref() {} }))
  permissionRef.check = async () => false
  permissionRef.request = async () => false

  const result = await executeCommand({ command: 'echo hi', cwd: process.cwd() })
  assert.equal(result.externalAction, true)
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
})
