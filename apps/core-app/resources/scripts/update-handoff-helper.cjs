'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const SCHEMA_VERSION = 1
const POLL_INTERVAL_MS = 250
const PARENT_EXIT_TIMEOUT_MS = 60_000

function isWithin(root, candidate) {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  )
}

function assertInternalPath(root, candidate) {
  if (typeof candidate !== 'string' || !isWithin(root, candidate)) {
    throw new Error('Update helper path escapes the storage root')
  }
  return path.resolve(candidate)
}

function assertCommand(command) {
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
}

function validatePlan(root, plan) {
  if (
    !plan ||
    typeof plan !== 'object' ||
    plan.schemaVersion !== SCHEMA_VERSION ||
    typeof plan.attemptId !== 'string' ||
    !/^[a-zA-Z0-9._-]+$/.test(plan.attemptId) ||
    typeof plan.token !== 'string' ||
    plan.token.length < 32 ||
    !['darwin', 'win32', 'linux'].includes(plan.platform) ||
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
  assertCommand(plan.handoff)
  if (plan.recovery !== null) assertCommand(plan.recovery)
  assertInternalPath(root, plan.packagePath)
  assertInternalPath(root, plan.ackPath)
  assertInternalPath(root, plan.markerPath)
  for (const cleanupPath of plan.cleanupPaths) assertInternalPath(root, cleanupPath)
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
  if (command.waitForExit) {
    await new Promise((resolve, reject) => {
      const child = spawn(command.command, command.args, { stdio: 'ignore' })
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
      stdio: 'ignore'
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

async function cleanup(root, cleanupPaths) {
  for (const cleanupPath of cleanupPaths) {
    const safePath = assertInternalPath(root, cleanupPath)
    await fs.rm(safePath, { recursive: true, force: true })
  }
}

async function recoverOnce(root, plan, reason) {
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

async function runHelper(root, planPath) {
  const safePlanPath = assertInternalPath(root, planPath)
  const plan = validatePlan(root, await readJson(safePlanPath))
  const existingAck = await readJson(plan.ackPath)
  if (isMatchingHealthAck(plan, existingAck)) {
    await cleanup(root, plan.cleanupPaths)
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

  try {
    await launchCommand(plan.handoff)
  } catch (error) {
    await recoverOnce(
      root,
      plan,
      `Update handoff failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return { status: 'handoff-failed' }
  }

  if (await waitForHealthAck(plan)) {
    await cleanup(root, plan.cleanupPaths)
    return { status: 'healthy' }
  }

  const recovered = await recoverOnce(root, plan, 'Startup health acknowledgement timed out')
  return { status: recovered ? 'recovery-started' : 'recovery-required' }
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
