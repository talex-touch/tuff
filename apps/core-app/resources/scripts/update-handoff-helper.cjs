'use strict'

const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fsSync = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')

const SCHEMA_VERSION = 1
const POLL_INTERVAL_MS = 250
const PARENT_EXIT_TIMEOUT_MS = 60_000
const WINDOWS_NSIS_INSTALLER_RE = /(^|[\s._-])(setup|installer)([\s._-]|$)/i

function normalizeComparable(targetPath, platform = process.platform) {
  const resolved = path.resolve(targetPath)
  return platform === 'darwin' || platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithinLexical(root, candidate, platform = process.platform) {
  const compRoot = normalizeComparable(root, platform)
  const compCandidate = normalizeComparable(candidate, platform)
  return compCandidate === compRoot || compCandidate.startsWith(`${compRoot}${path.sep}`)
}

function canonicalizeNearestExistingSync(targetPath) {
  const resolved = path.resolve(targetPath)
  const tail = []
  let cursor = resolved
  while (true) {
    try {
      const realCursor = fsSync.realpathSync(cursor)
      return tail.length > 0 ? path.join(realCursor, ...tail.reverse()) : realCursor
    } catch (error) {
      const code = error && error.code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw error
      }
      try {
        if (fsSync.lstatSync(cursor).isSymbolicLink()) {
          throw new Error('Update helper path cannot traverse a symbolic link')
        }
      } catch (lstatError) {
        if (lstatError && lstatError.code !== 'ENOENT' && lstatError.code !== 'ENOTDIR') {
          throw lstatError
        }
      }
      const parent = path.dirname(cursor)
      if (parent === cursor) {
        return resolved
      }
      tail.push(path.basename(cursor))
      cursor = parent
    }
  }
}

function assertNoSymlinkBetween(root, candidate, options = {}) {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const allowMissing = options.allowMissing === true

  let cursor = resolvedCandidate
  while (true) {
    try {
      if (fsSync.lstatSync(cursor).isSymbolicLink()) {
        throw new Error('Update helper path cannot be a symbolic link')
      }
    } catch (error) {
      const code = error && error.code
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        if (!allowMissing) {
          throw new Error('Update helper command target does not exist')
        }
      } else {
        throw error
      }
    }
    if (normalizeComparable(cursor) === normalizeComparable(resolvedRoot)) {
      break
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) {
      break
    }
    cursor = parent
  }
}

function isWithin(root, candidate, options = {}) {
  const platform = options.platform || process.platform
  if (typeof root !== 'string' || typeof candidate !== 'string') {
    return false
  }
  if (!isWithinLexical(root, candidate, platform)) {
    return false
  }
  try {
    const canonicalRoot = canonicalizeNearestExistingSync(root)
    const canonicalCandidate = canonicalizeNearestExistingSync(candidate)
    if (!isWithinLexical(canonicalRoot, canonicalCandidate, platform)) {
      return false
    }
    if (options.rejectSymlink) {
      assertNoSymlinkBetween(root, candidate, { allowMissing: options.allowMissing === true })
    }
    return true
  } catch {
    return false
  }
}

function assertInternalPath(root, candidate, options = {}) {
  if (
    typeof candidate !== 'string' ||
    !isWithin(root, candidate, {
      platform: options.platform || process.platform,
      rejectSymlink: options.rejectSymlink !== false,
      allowMissing: options.allowMissing !== false
    })
  ) {
    throw new Error('Update helper path escapes the storage root')
  }
  return path.resolve(candidate)
}

function getAllowedBundledScriptDirs(root, options = {}) {
  const dirs = []
  if (Array.isArray(options.bundledScriptDirs)) {
    for (const dir of options.bundledScriptDirs) {
      if (typeof dir === 'string' && path.isAbsolute(dir) && !isWithinLexical(root, dir)) {
        dirs.push(path.resolve(dir))
      }
    }
  }
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    dirs.push(
      path.resolve(process.resourcesPath, 'resources', 'scripts'),
      path.resolve(process.resourcesPath, 'scripts')
    )
  }
  const execDir = path.dirname(process.execPath)
  dirs.push(
    path.resolve(execDir, 'resources', 'scripts'),
    path.resolve(execDir, 'resources', 'resources', 'scripts')
  )
  // Allow __dirname only when running from the read-only bundled scripts directory, never when
  // copied into the writable storage root / attemptRoot.
  if (!isWithinLexical(root, __dirname)) {
    dirs.push(path.resolve(__dirname))
  }
  return dirs.filter((dir) => !isWithinLexical(root, dir))
}

function isAllowedBundledScriptPath(root, scriptPath, expectedFilename, options = {}) {
  const platform = options.platform || process.platform
  if (typeof scriptPath !== 'string' || !path.isAbsolute(scriptPath)) {
    return false
  }
  const resolved = path.resolve(scriptPath)
  if (path.basename(resolved) !== expectedFilename) {
    return false
  }
  if (isWithinLexical(root, resolved, platform)) {
    return false
  }
  return getAllowedBundledScriptDirs(root, options).some((dir) =>
    isWithin(dir, resolved, {
      platform,
      rejectSymlink: true,
      allowMissing: false
    })
  )
}

function getFlagValue(args, flagName) {
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === flagName && i + 1 < args.length) {
      return args[i + 1]
    }
  }
  return null
}

function assertCommand(root, plan, command, role, options = {}) {
  if (
    !command ||
    typeof command !== 'object' ||
    typeof command.command !== 'string' ||
    command.command.length === 0 ||
    !Array.isArray(command.args) ||
    !command.args.every((arg) => typeof arg === 'string') ||
    typeof command.waitForExit !== 'boolean'
  ) {
    throw new Error('Update helper command is invalid')
  }

  const hostPlatform = options.hostPlatform || process.platform
  const platform = plan.platform
  if (platform !== hostPlatform) {
    throw new Error(`Update plan platform ${String(platform)} does not match host ${hostPlatform}`)
  }

  const attemptRoot = path.dirname(
    assertInternalPath(root, plan.ackPath, { platform, rejectSymlink: true, allowMissing: true })
  )

  if (platform === 'darwin') {
    const expectedScript = role === 'handoff' ? 'macos-apply-update.sh' : 'macos-restore-update.sh'
    const scriptArg = command.args[0]
    if (
      command.command !== '/bin/bash' ||
      command.waitForExit !== true ||
      typeof scriptArg !== 'string' ||
      !path.isAbsolute(scriptArg) ||
      path.basename(path.resolve(scriptArg)) !== expectedScript ||
      !isWithin(attemptRoot, scriptArg, {
        platform,
        rejectSymlink: true,
        allowMissing: false
      })
    ) {
      throw new Error(`Disallowed macOS ${role} command`)
    }

    const swapHelperArg = getFlagValue(command.args, '--swap-helper')
    if (swapHelperArg !== null) {
      if (
        !path.isAbsolute(swapHelperArg) ||
        path.basename(path.resolve(swapHelperArg)) !== 'tuff-native-update' ||
        !isWithin(attemptRoot, swapHelperArg, {
          platform,
          rejectSymlink: true,
          allowMissing: false
        })
      ) {
        throw new Error(`Disallowed macOS ${role} swap-helper path`)
      }
    }

    const destArg = getFlagValue(command.args, '--dest')
    if (destArg !== null) {
      if (
        !plan.macosTransaction ||
        normalizeComparable(destArg, platform) !==
          normalizeComparable(plan.macosTransaction.appBundlePath, platform)
      ) {
        throw new Error(`Disallowed macOS ${role} destination path`)
      }
    }

    const logArg = getFlagValue(command.args, '--log')
    if (
      logArg !== null &&
      !isWithin(attemptRoot, logArg, { platform, rejectSymlink: true, allowMissing: true })
    ) {
      throw new Error(`Disallowed macOS ${role} log path`)
    }
    return
  }

  if (platform === 'linux') {
    if (role === 'handoff') {
      const scriptArg = command.args[0]
      if (
        command.command !== '/bin/bash' ||
        command.waitForExit !== true ||
        !isAllowedBundledScriptPath(root, scriptArg, 'linux-apply-update.sh', {
          ...options,
          platform
        })
      ) {
        throw new Error(`Disallowed Linux ${role} command`)
      }
      return
    }
    if (role === 'recovery') {
      const ext = path.extname(command.command).toLowerCase()
      if (
        ext === '.appimage' &&
        command.waitForExit === false &&
        command.args.length === 0 &&
        isWithin(root, command.command, { platform, rejectSymlink: true, allowMissing: false })
      ) {
        return
      }
      if (
        command.command === 'xdg-open' &&
        command.waitForExit === false &&
        command.args.length === 1 &&
        path.extname(command.args[0]).toLowerCase() === '.deb' &&
        isWithin(root, command.args[0], { platform, rejectSymlink: true, allowMissing: false })
      ) {
        return
      }
    }
    throw new Error(`Disallowed Linux ${role} command`)
  }

  if (platform === 'win32') {
    if (
      command.command.toLowerCase() === 'msiexec.exe' &&
      command.waitForExit === false &&
      command.args.length === 2 &&
      command.args[0] === '/i' &&
      path.extname(command.args[1]).toLowerCase() === '.msi' &&
      isWithin(root, command.args[1], { platform, rejectSymlink: true, allowMissing: false })
    ) {
      return
    }
    const ext = path.extname(command.command).toLowerCase()
    const baseName = path.basename(command.command, ext)
    if (
      ext === '.exe' &&
      WINDOWS_NSIS_INSTALLER_RE.test(baseName) &&
      command.waitForExit === false &&
      command.args.length === 0 &&
      isWithin(root, command.command, { platform, rejectSymlink: true, allowMissing: false })
    ) {
      return
    }
    throw new Error(`Disallowed Windows ${role} command`)
  }

  throw new Error(`Unsupported update platform: ${String(platform)}`)
}

function validatePlan(root, plan, options = {}) {
  const hostPlatform = options.hostPlatform || process.platform
  if (
    !plan ||
    typeof plan !== 'object' ||
    plan.schemaVersion !== SCHEMA_VERSION ||
    typeof plan.attemptId !== 'string' ||
    !/^[a-zA-Z0-9._-]+$/.test(plan.attemptId) ||
    typeof plan.token !== 'string' ||
    plan.token.length < 32 ||
    !['darwin', 'win32', 'linux'].includes(plan.platform) ||
    plan.platform !== hostPlatform ||
    typeof plan.currentVersion !== 'string' ||
    typeof plan.targetVersion !== 'string' ||
    typeof plan.taskId !== 'string' ||
    typeof plan.packagePath !== 'string' ||
    typeof plan.packageSha256 !== 'string' ||
    typeof plan.createdAt !== 'number' ||
    plan.createdAt > Date.now() + 5 * 60_000 ||
    Date.now() - plan.createdAt > 24 * 60 * 60_000 ||
    !Number.isSafeInteger(plan.parentPid) ||
    plan.parentPid <= 0 ||
    typeof plan.healthTimeoutMs !== 'number' ||
    plan.healthTimeoutMs < 1000 ||
    typeof plan.ackPath !== 'string' ||
    typeof plan.markerPath !== 'string' ||
    !Array.isArray(plan.cleanupPaths) ||
    typeof plan.recoveryAvailable !== 'boolean'
  ) {
    throw new Error('Update handoff plan has an invalid schema')
  }
  if (plan.macosTransaction !== undefined) {
    const transaction = plan.macosTransaction
    if (
      plan.platform !== 'darwin' ||
      !transaction ||
      typeof transaction.appBundlePath !== 'string' ||
      !path.isAbsolute(transaction.appBundlePath) ||
      !transaction.appBundlePath.endsWith('.app') ||
      transaction.stageRoot !==
        path.join(path.dirname(transaction.appBundlePath), `.tuff-update-${plan.attemptId}`)
    )
      throw new Error('Invalid macOS update transaction paths')
  }
  assertInternalPath(root, plan.packagePath)
  assertInternalPath(root, plan.ackPath)
  assertInternalPath(root, plan.markerPath)
  if (typeof plan.lockPath === 'string') {
    assertInternalPath(root, plan.lockPath)
  }
  for (const cleanupPath of plan.cleanupPaths) assertInternalPath(root, cleanupPath)
  assertCommand(root, plan, plan.handoff, 'handoff', options)
  if (plan.recovery !== null) assertCommand(root, plan, plan.recovery, 'recovery', options)
  return plan
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

async function writeJsonAtomic(root, filePath, value) {
  const safePath = assertInternalPath(root, filePath)
  await fs.mkdir(path.dirname(safePath), { recursive: true, mode: 0o700 })
  const tempPath = `${safePath}.${process.pid}.${randomUUID()}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(tempPath, safePath)
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error && error.code === 'EPERM'
  }
}

async function waitForParentExit(pid, timeoutMs = PARENT_EXIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (isProcessAlive(pid)) {
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return true
}

async function launchCommand(command) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  if (command.waitForExit) {
    await new Promise((resolve, reject) => {
      const child = spawn(command.command, command.args, { stdio: 'ignore', env })
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (code === 0) resolve()
        else
          reject(
            new Error(`Update command exited with code ${String(code)} signal ${String(signal)}`)
          )
      })
    })
    return
  }

  await new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: 'ignore',
      env
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

function isMatchingHealthAck(plan, ack) {
  if (
    !ack ||
    ack.schemaVersion !== SCHEMA_VERSION ||
    ack.attemptId !== plan.attemptId ||
    ack.token !== plan.token
  ) {
    return false
  }
  return (
    (ack.status === 'healthy' && ack.version === plan.targetVersion) ||
    (ack.status === 'recovered' && ack.version === plan.currentVersion)
  )
}

async function waitForHealthAck(plan) {
  const deadline = Date.now() + plan.healthTimeoutMs
  while (Date.now() < deadline) {
    const ack = await readJson(plan.ackPath)
    if (isMatchingHealthAck(plan, ack)) return true
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return false
}

async function cleanup(root, plan) {
  if (plan.macosTransaction) {
    const { stageRoot } = plan.macosTransaction
    const stage = await fs.lstat(stageRoot).catch((error) => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (stage) {
      if (
        !stage.isDirectory() ||
        stage.isSymbolicLink() ||
        (await fs.realpath(stageRoot)) !== stageRoot
      ) {
        throw new Error('Refusing to clean an unowned macOS update directory')
      }
      await fs.rm(stageRoot, { recursive: true })
    }
  }
  for (const cleanupPath of plan.cleanupPaths) {
    const safePath = assertInternalPath(root, cleanupPath)
    await fs.rm(safePath, { recursive: true, force: true })
  }
}

async function logPhase(root, planPath, phase, startedAt) {
  const logPath = assertInternalPath(root, path.join(path.dirname(planPath), 'handoff.log'))
  const timestamp = Date.now()
  await fs
    .appendFile(
      logPath,
      `${JSON.stringify({ phase, timestamp, durationMs: timestamp - startedAt })}\n`
    )
    .catch((error) => console.error('Unable to record update phase timing:', error))
}

async function recoverOnce(root, plan, reason, options = {}) {
  const existing = await readJson(plan.markerPath)
  if (
    existing &&
    existing.schemaVersion === SCHEMA_VERSION &&
    existing.attemptId === plan.attemptId &&
    existing.token === plan.token &&
    existing.recoveryAttempted === true
  ) {
    return false
  }

  if (!plan.recoveryAvailable || !plan.recovery) {
    await writeJsonAtomic(root, plan.markerPath, {
      schemaVersion: SCHEMA_VERSION,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'recovery-required',
      recoveryAttempted: true,
      reason: `${reason}: no previous recovery asset`,
      updatedAt: Date.now()
    })
    return false
  }

  await writeJsonAtomic(root, plan.markerPath, {
    schemaVersion: SCHEMA_VERSION,
    attemptId: plan.attemptId,
    token: plan.token,
    status: 'recovery-started',
    recoveryAttempted: true,
    reason,
    updatedAt: Date.now()
  })

  try {
    assertCommand(root, plan, plan.recovery, 'recovery', options)
    await launchCommand(plan.recovery)
    return true
  } catch (error) {
    await writeJsonAtomic(root, plan.markerPath, {
      schemaVersion: SCHEMA_VERSION,
      attemptId: plan.attemptId,
      token: plan.token,
      status: 'recovery-required',
      recoveryAttempted: true,
      reason: `${reason}: ${error instanceof Error ? error.message : String(error)}`,
      updatedAt: Date.now()
    })
    return false
  }
}

async function runHelper(root, planPath, options = {}) {
  const safePlanPath = assertInternalPath(root, planPath)
  const plan = validatePlan(root, await readJson(safePlanPath), options)
  const existingAck = await readJson(plan.ackPath)
  if (isMatchingHealthAck(plan, existingAck)) {
    await cleanup(root, plan)
    return { status: existingAck.status }
  }
  const existingMarker = await readJson(plan.markerPath)
  if (
    existingMarker &&
    existingMarker.schemaVersion === SCHEMA_VERSION &&
    existingMarker.attemptId === plan.attemptId &&
    existingMarker.token === plan.token &&
    existingMarker.recoveryAttempted === true
  ) {
    return { status: existingMarker.status }
  }
  const lockPath = plan.lockPath || path.join(path.dirname(safePlanPath), 'handoff-lock.json')
  await writeJsonAtomic(root, lockPath, {
    schemaVersion: SCHEMA_VERSION,
    attemptId: plan.attemptId,
    token: plan.token,
    helperPid: process.pid,
    startedAt: Date.now()
  })

  const removeLock = async () => {
    try {
      await fs.rm(assertInternalPath(root, lockPath), { force: true })
    } catch {
      // ignore
    }
  }

  try {
    const parentWaitStarted = Date.now()
    if (!(await waitForParentExit(plan.parentPid))) {
      await writeJsonAtomic(root, plan.markerPath, {
        schemaVersion: SCHEMA_VERSION,
        attemptId: plan.attemptId,
        token: plan.token,
        status: 'handoff-failed',
        recoveryAttempted: true,
        reason: 'Parent process did not exit before helper timeout',
        updatedAt: Date.now()
      })
      return { status: 'parent-timeout' }
    }
    await logPhase(root, safePlanPath, 'parent-exited', parentWaitStarted)

    try {
      const handoffStarted = Date.now()
      await launchCommand(plan.handoff)
      await logPhase(root, safePlanPath, 'platform-handoff', handoffStarted)
    } catch (error) {
      const recovered = await recoverOnce(
        root,
        plan,
        `Update handoff failed: ${error instanceof Error ? error.message : String(error)}`,
        options
      )
      if (recovered && (await waitForHealthAck(plan))) {
        await cleanup(root, plan)
        return { status: 'recovered' }
      }
      return { status: 'handoff-failed' }
    }

    const healthWaitStarted = Date.now()
    if (await waitForHealthAck(plan)) {
      await logPhase(root, safePlanPath, 'startup-health', healthWaitStarted)
      await cleanup(root, plan)
      return { status: 'healthy' }
    }

    const recovered = await recoverOnce(
      root,
      plan,
      'Startup health acknowledgement timed out',
      options
    )
    if (recovered && (await waitForHealthAck(plan))) {
      await logPhase(root, safePlanPath, 'recovery-health', healthWaitStarted)
      await cleanup(root, plan)
      return { status: 'recovered' }
    }
    return { status: recovered ? 'recovery-started' : 'recovery-required' }
  } finally {
    await removeLock()
  }
}

function parseArgs(argv) {
  const result = { planPath: '', root: '' }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--plan') result.planPath = argv[++index] || ''
    else if (argv[index] === '--root') result.root = argv[++index] || ''
    else throw new Error(`Unknown update helper argument: ${argv[index]}`)
  }
  if (!result.planPath || !result.root) throw new Error('Usage: --plan <path> --root <path>')
  return result
}

if (require.main === module) {
  const { planPath, root } = parseArgs(process.argv.slice(2))
  runHelper(root, planPath)
    .then((result) => {
      process.exitCode = result.status === 'healthy' || result.status === 'recovery-started' ? 0 : 1
    })
    .catch((error) => {
      console.error(`[update-helper] ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    })
}

module.exports = {
  cleanup,
  isMatchingHealthAck,
  isWithin,
  launchCommand,
  parseArgs,
  recoverOnce,
  runHelper,
  validatePlan,
  waitForHealthAck,
  waitForParentExit
}
