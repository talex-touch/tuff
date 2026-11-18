'use strict'

const { Buffer } = require('node:buffer')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const { StringDecoder } = require('node:string_decoder')

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_IDLE_TTL_MS = 180_000
const MAX_FRAME_BYTES = 4 * 1024 * 1024
const DISABLE_NATIVE_OCR_FLAG = 'TUFF_DISABLE_NATIVE_OCR'
const DISABLE_RUST_OCR_FLAG = 'TUFF_DISABLE_RUST_OCR'

const binaryName = process.platform === 'win32' ? 'tuff-native-ocr.exe' : 'tuff-native-ocr'
const defaultHelperPath = path.join(
  __dirname.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1'),
  'build',
  'Release',
  binaryName,
)

let activeProcess = null
let activeSlot = null
let idleTimer = null
const waiters = []

function createError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

function resolveHelperPath() {
  const override = process.env.TUFF_RUST_OCR_HELPER_PATH
  return typeof override === 'string' && override.trim() ? override.trim() : defaultHelperPath
}

function getRustOcrHelperStatus() {
  const helperPath = resolveHelperPath()
  if (process.env[DISABLE_NATIVE_OCR_FLAG] === '1') {
    return { available: false, helperPath, reason: 'disabled-by-env' }
  }
  if (process.env[DISABLE_RUST_OCR_FLAG] === '1') {
    return { available: false, helperPath, reason: 'rust-ocr-disabled-by-env' }
  }
  try {
    const stats = fs.lstatSync(helperPath)
    if (!stats.isFile()) {
      return { available: false, helperPath, reason: 'helper-not-regular-file' }
    }
    if (process.platform !== 'win32') {
      fs.accessSync(helperPath, fs.constants.X_OK)
    }
    return { available: true, helperPath }
  }
  catch (error) {
    return {
      available: false,
      helperPath,
      reason: error instanceof Error ? error.message : 'helper-unavailable',
    }
  }
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleShutdown(idleTtlMs) {
  clearIdleTimer()
  if (activeSlot || waiters.length > 0 || !activeProcess || activeProcess.closed) {
    return
  }
  const ttl = Number.isFinite(idleTtlMs) && idleTtlMs > 0 ? idleTtlMs : DEFAULT_IDLE_TTL_MS
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (!activeSlot && waiters.length === 0 && activeProcess) {
      terminateProcess(activeProcess, 'OCR_PROCESS_ABORTED', 'OCR helper idle shutdown', true)
    }
  }, ttl)
  idleTimer.unref?.()
}

function parseNativeResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  if (typeof raw.text !== 'string') {
    return null
  }
  if (raw.engine !== 'apple-vision' && raw.engine !== 'windows-ocr') {
    return null
  }
  if (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs)) {
    return null
  }
  const result = {
    text: raw.text,
    engine: raw.engine,
    durationMs: raw.durationMs,
  }
  if (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) {
    result.confidence = raw.confidence
  }
  if (typeof raw.language === 'string' && raw.language.length > 0) {
    result.language = raw.language
  }
  if (Array.isArray(raw.blocks)) {
    result.blocks = raw.blocks
  }
  return result
}

function terminateProcess(proc, errorCode, errorMessage, gracefulIfIdle = false) {
  if (!proc || proc.closed) {
    return
  }
  proc.closed = true
  if (activeProcess === proc) {
    activeProcess = null
  }
  clearIdleTimer()

  const pending = activeSlot && activeSlot.proc === proc ? activeSlot : null

  try {
    if (gracefulIfIdle && !pending && proc.child.stdin && !proc.child.stdin.destroyed) {
      proc.child.stdin.end(`${JSON.stringify({ id: 'shutdown', operation: 'shutdown' })}\n`)
      const forceKill = setTimeout(() => {
        if (proc.child.exitCode === null && proc.child.signalCode === null) {
          proc.child.kill('SIGKILL')
        }
      }, 300)
      forceKill.unref?.()
    }
    else if (proc.child.exitCode === null && proc.child.signalCode === null) {
      proc.child.kill('SIGKILL')
    }
  }
  catch {}

  if (pending) {
    activeSlot = null
    pending.reject(createError(errorCode, errorMessage))
  }
}

function handleLine(proc, line) {
  let payload
  try {
    payload = JSON.parse(line)
  }
  catch {
    terminateProcess(proc, 'OCR_PROCESS_INVALID_RESPONSE', 'OCR helper returned malformed JSON')
    return
  }

  if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') {
    terminateProcess(proc, 'OCR_PROCESS_INVALID_RESPONSE', 'OCR helper returned an invalid frame')
    return
  }

  const slot = activeSlot
  if (!slot || slot.proc !== proc || slot.requestId !== payload.id) {
    return
  }

  activeSlot = null
  if (payload.ok === true) {
    const parsed = parseNativeResult(payload)
    if (!parsed) {
      slot.reject(
        createError('OCR_PROCESS_INVALID_RESPONSE', 'OCR helper returned a malformed result'),
      )
      return
    }
    slot.resolve(parsed)
    return
  }

  const code = typeof payload.code === 'string' && payload.code.length > 0
    ? payload.code
    : 'ERR_OCR_RECOGNIZE_FAILED'
  const message = typeof payload.message === 'string' && payload.message.length > 0
    ? payload.message
    : 'Native OCR recognition failed'
  slot.reject(createError(code, message))
}

function ensureHelperProcess(helperPath) {
  if (activeProcess && !activeProcess.closed) {
    return activeProcess
  }
  const child = spawn(helperPath, [], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  })
  const proc = {
    child,
    closed: false,
    spawned: child.pid !== undefined,
    decoder: new StringDecoder('utf8'),
    buffer: '',
  }
  activeProcess = proc

  child.once('spawn', () => {
    proc.spawned = true
  })

  child.stdout.on('data', (chunk) => {
    if (proc.closed) {
      return
    }
    proc.buffer += proc.decoder.write(chunk)
    if (Buffer.byteLength(proc.buffer) > MAX_FRAME_BYTES) {
      terminateProcess(
        proc,
        'OCR_PROCESS_INVALID_RESPONSE',
        'OCR helper response exceeded the frame size limit',
      )
      return
    }
    let newlineIndex = proc.buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = proc.buffer.slice(0, newlineIndex)
      proc.buffer = proc.buffer.slice(newlineIndex + 1)
      if (line.length > 0) {
        handleLine(proc, line)
      }
      if (proc.closed) {
        return
      }
      newlineIndex = proc.buffer.indexOf('\n')
    }
  })

  child.on('error', (error) => {
    const code = proc.spawned ? 'OCR_PROCESS_EXITED' : 'OCR_HELPER_SPAWN_FAILED'
    terminateProcess(
      proc,
      code,
      error instanceof Error ? error.message : 'OCR helper failed to start',
    )
  })

  child.on('exit', (exitCode) => {
    const code = proc.spawned ? 'OCR_PROCESS_EXITED' : 'OCR_HELPER_SPAWN_FAILED'
    terminateProcess(
      proc,
      code,
      `OCR helper exited unexpectedly (code ${String(exitCode)})`,
    )
  })

  child.stdin.on('error', () => {
    const code = proc.spawned ? 'OCR_PROCESS_EXITED' : 'OCR_HELPER_SPAWN_FAILED'
    terminateProcess(proc, code, 'OCR helper stdin closed')
  })

  return proc
}

function drainQueue() {
  if (activeSlot || waiters.length === 0) {
    return
  }

  const next = waiters.shift()
  if (!next || next.settled) {
    drainQueue()
    return
  }

  const status = getRustOcrHelperStatus()
  if (!status.available) {
    next.reject(
      createError('OCR_HELPER_UNAVAILABLE', `Rust OCR helper unavailable: ${status.reason}`),
    )
    drainQueue()
    return
  }

  clearIdleTimer()
  let proc
  try {
    proc = ensureHelperProcess(status.helperPath)
  }
  catch (error) {
    next.reject(
      createError(
        'OCR_HELPER_SPAWN_FAILED',
        error instanceof Error ? error.message : 'OCR helper failed to start',
      ),
    )
    drainQueue()
    return
  }
  const requestId = randomUUID()
  next.proc = proc
  next.requestId = requestId
  activeSlot = next

  const wirePayload = {
    id: requestId,
    operation: 'ocr',
    ...(next.options.filePath ? { filePath: next.options.filePath } : {}),
    ...(next.options.imageBase64 ? { imageBase64: next.options.imageBase64 } : {}),
    ...(typeof next.options.languageHint === 'string' && next.options.languageHint
      ? { languageHint: next.options.languageHint }
      : {}),
    includeLayout: Boolean(next.options.includeLayout),
    maxBlocks: typeof next.options.maxBlocks === 'number' ? next.options.maxBlocks : 120,
  }

  try {
    proc.child.stdin.write(`${JSON.stringify(wirePayload)}\n`, (error) => {
      if (error && activeSlot === next) {
        const code = proc.spawned ? 'OCR_PROCESS_EXITED' : 'OCR_HELPER_SPAWN_FAILED'
        terminateProcess(proc, code, error.message || 'Failed to write OCR request')
      }
    })
  }
  catch (error) {
    if (activeSlot === next) {
      const code = proc.spawned ? 'OCR_PROCESS_EXITED' : 'OCR_HELPER_SPAWN_FAILED'
      terminateProcess(
        proc,
        code,
        error instanceof Error ? error.message : 'Failed to write OCR request',
      )
    }
  }
}

function normalizeWireOptions(options) {
  if (!options || typeof options !== 'object') {
    throw createError('ERR_OCR_INVALID_REQUEST', 'OCR options must be an object')
  }
  const normalized = {
    languageHint: options.languageHint,
    includeLayout: options.includeLayout,
    maxBlocks: options.maxBlocks,
  }
  if (typeof options.filePath === 'string' && options.filePath.trim().length > 0) {
    normalized.filePath = options.filePath.trim()
    return normalized
  }
  if (options.image instanceof Uint8Array) {
    if (options.image.byteLength === 0) {
      throw createError('ERR_OCR_DECODE_FAILED', 'Image payload is empty')
    }
    const buf = Buffer.isBuffer(options.image)
      ? options.image
      : Buffer.from(options.image.buffer, options.image.byteOffset, options.image.byteLength)
    normalized.imageBase64 = buf.toString('base64')
    return normalized
  }
  throw createError('ERR_OCR_INVALID_REQUEST', 'OCR request requires filePath or image Buffer')
}

async function recognizeImageTextViaRustHelper(options, invocation = {}) {
  const signal = invocation?.signal
  if (signal?.aborted) {
    throw createError('OCR_PROCESS_ABORTED', 'OCR process request was aborted before it started')
  }

  const status = getRustOcrHelperStatus()
  if (!status.available) {
    throw createError('OCR_HELPER_UNAVAILABLE', `Rust OCR helper unavailable: ${status.reason}`)
  }

  const wireOptions = normalizeWireOptions(options)
  const timeoutMs
    = typeof invocation?.timeoutMs === 'number'
      && Number.isFinite(invocation.timeoutMs)
      && invocation.timeoutMs > 0
      ? invocation.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const idleTtlMs = invocation?.idleTtlMs ?? DEFAULT_IDLE_TTL_MS

  return await new Promise((resolve, reject) => {
    let settled = false
    let timer = null
    let entry = null

    const onAbort = () => {
      if (settled) {
        return
      }
      const err = createError('OCR_PROCESS_ABORTED', 'OCR process request was aborted')
      if (entry && activeSlot === entry && entry.proc) {
        terminateProcess(entry.proc, 'OCR_PROCESS_ABORTED', 'OCR process request was aborted')
      }
      else {
        const index = entry ? waiters.indexOf(entry) : -1
        if (index !== -1) {
          waiters.splice(index, 1)
        }
        entry?.reject(err)
      }
    }

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      signal?.removeEventListener('abort', onAbort)
    }

    entry = {
      options: wireOptions,
      proc: null,
      requestId: null,
      get settled() {
        return settled
      },
      resolve: (value) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        resolve(value)
        scheduleIdleShutdown(idleTtlMs)
        drainQueue()
      },
      reject: (error) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        reject(error)
        scheduleIdleShutdown(idleTtlMs)
        drainQueue()
      },
    }

    timer = setTimeout(() => {
      if (settled) {
        return
      }
      const message = `OCR process timed out after ${timeoutMs}ms`
      if (activeSlot === entry && entry.proc) {
        terminateProcess(entry.proc, 'OCR_PROCESS_TIMEOUT', message)
      }
      else {
        const index = waiters.indexOf(entry)
        if (index !== -1) {
          waiters.splice(index, 1)
        }
        entry.reject(createError('OCR_PROCESS_TIMEOUT', message))
      }
    }, timeoutMs)

    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }

    waiters.push(entry)
    drainQueue()
  })
}

function closeRustOcrHelper() {
  clearIdleTimer()
  const abortError = createError('OCR_PROCESS_ABORTED', 'OCR helper closed')
  while (waiters.length > 0) {
    const waiting = waiters.shift()
    waiting?.reject(abortError)
  }
  if (activeProcess) {
    terminateProcess(activeProcess, 'OCR_PROCESS_ABORTED', 'OCR helper closed', true)
  }
}

process.once('exit', closeRustOcrHelper)

module.exports = {
  getRustOcrHelperStatus,
  recognizeImageTextViaRustHelper,
  closeRustOcrHelper,
}
