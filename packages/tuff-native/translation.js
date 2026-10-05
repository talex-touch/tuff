'use strict'

const { Buffer } = require('node:buffer')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')
const { StringDecoder } = require('node:string_decoder')

const MAX_FRAME_BYTES = 1024 * 1024
const MAX_TEXT_BYTES = 64 * 1024
const MAX_PENDING = 32
const helperPath = path.join(__dirname.replace(/app\.asar([\\/])/g, 'app.asar.unpacked$1'), 'build', 'Release', 'tuff-native-translation')
let worker = null
let sequence = 0
let latestStatus = { supported: false, ready: false, installedLanguages: [] }

function createError(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

function unsupportedStatus() {
  if (process.platform !== 'darwin' || Number.parseInt(os.release(), 10) < 25) {
    return { supported: false, ready: false, installedLanguages: [], reason: 'SYSTEM_TRANSLATION_UNAVAILABLE' }
  }
  try {
    fs.accessSync(helperPath, fs.constants.X_OK)
    return null
  }
  catch {
    return { supported: false, ready: false, installedLanguages: [], reason: 'SYSTEM_TRANSLATION_UNAVAILABLE' }
  }
}

function terminate(active, code, message) {
  if (active.closed)
    return
  active.closed = true
  if (worker === active)
    worker = null
  for (const pending of active.pending.values()) {
    pending.cleanup()
    pending.reject(createError(code, message))
  }
  active.pending.clear()
  if (active.child.exitCode === null && active.child.signalCode === null)
    active.child.kill('SIGKILL')
}

function receive(active, line) {
  let response
  try {
    response = JSON.parse(line)
  }
  catch {
    terminate(active, 'SYSTEM_TRANSLATION_INVALID_RESPONSE', 'Invalid native translation response')
    return
  }
  if (!response || typeof response !== 'object' || typeof response.id !== 'string') {
    terminate(active, 'SYSTEM_TRANSLATION_INVALID_RESPONSE', 'Invalid native translation response')
    return
  }
  const pending = active.pending.get(response.id)
  if (!pending)
    return
  active.pending.delete(response.id)
  pending.cleanup()
  if (typeof response.code === 'string')
    pending.reject(createError(response.code, response.message))
  else pending.resolve(response)
}

function ensureWorker() {
  if (worker && !worker.closed)
    return worker
  const child = spawn(helperPath, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
  const active = { child, closed: false, pending: new Map(), decoder: new StringDecoder('utf8'), buffer: '' }
  worker = active
  child.stdout.on('data', (chunk) => {
    if (active.closed)
      return
    active.buffer += active.decoder.write(chunk)
    if (Buffer.byteLength(active.buffer) > MAX_FRAME_BYTES) {
      terminate(active, 'SYSTEM_TRANSLATION_INVALID_RESPONSE', 'Native translation frame exceeded the size limit')
      return
    }
    let end = active.buffer.indexOf('\n')
    while (end !== -1) {
      const line = active.buffer.slice(0, end)
      active.buffer = active.buffer.slice(end + 1)
      if (line)
        receive(active, line)
      if (active.closed)
        return
      end = active.buffer.indexOf('\n')
    }
  })
  child.on('error', () => terminate(active, 'SYSTEM_TRANSLATION_PROCESS_EXITED', 'Native translation process failed to start'))
  child.on('exit', () => terminate(active, 'SYSTEM_TRANSLATION_PROCESS_EXITED', 'Native translation process exited'))
  child.stdin.on('error', () => terminate(active, 'SYSTEM_TRANSLATION_PROCESS_EXITED', 'Native translation process input closed'))
  return active
}

function request(operation, payload, options = {}) {
  if (options.signal?.aborted)
    return Promise.reject(createError('SYSTEM_TRANSLATION_ABORTED'))
  const unavailable = unsupportedStatus()
  if (unavailable)
    return Promise.reject(createError(unavailable.reason))
  const active = ensureWorker()
  if (active.pending.size >= MAX_PENDING)
    return Promise.reject(createError('SYSTEM_TRANSLATION_UNAVAILABLE', 'Native translation queue is full'))
  const id = String(++sequence)
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 30_000
  return new Promise((resolve, reject) => {
    const abort = () => terminate(active, 'SYSTEM_TRANSLATION_ABORTED', 'Native translation cancelled')
    const timeout = setTimeout(() => terminate(active, 'SYSTEM_TRANSLATION_TIMEOUT', 'Native translation timed out'), timeoutMs)
    const cleanup = () => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
    }
    active.pending.set(id, { resolve, reject, cleanup })
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) {
      abort()
      return
    }
    active.child.stdin.write(`${JSON.stringify({ id, operation, ...payload })}\n`, (error) => {
      if (error)
        terminate(active, 'SYSTEM_TRANSLATION_PROCESS_EXITED', 'Native translation process input failed')
    })
  })
}

async function getSystemTranslationStatus(options) {
  const unavailable = unsupportedStatus()
  if (unavailable) {
    latestStatus = unavailable
    return { ...unavailable, installedLanguages: [] }
  }
  const response = await request('status', {}, options)
  if (response.supported !== true || typeof response.ready !== 'boolean' || !Array.isArray(response.installedLanguages) || !response.installedLanguages.every(language => typeof language === 'string')) {
    throw createError('SYSTEM_TRANSLATION_INVALID_RESPONSE')
  }
  latestStatus = { supported: true, ready: response.ready, installedLanguages: response.installedLanguages, ...(response.reason ? { reason: response.reason } : {}) }
  return { ...latestStatus, installedLanguages: [...latestStatus.installedLanguages] }
}

function isSystemTranslationAvailable() {
  return latestStatus.ready && unsupportedStatus() === null
}

async function translateSystemText(payload, options) {
  if (!payload || typeof payload.text !== 'string' || !payload.text.trim())
    throw createError('SYSTEM_TRANSLATION_EMPTY_TEXT')
  if (Buffer.byteLength(payload.text) > MAX_TEXT_BYTES)
    throw createError('SYSTEM_TRANSLATION_UNAVAILABLE', 'Native translation text exceeded the size limit')
  if (typeof payload.targetLang !== 'string' || !payload.targetLang.trim())
    throw createError('SYSTEM_TRANSLATION_UNSUPPORTED_LANGUAGE')
  const response = await request('translate', { text: payload.text, sourceLang: payload.sourceLang, targetLang: payload.targetLang }, options)
  if (typeof response.text !== 'string' || typeof response.sourceLang !== 'string' || typeof response.targetLang !== 'string' || !Number.isFinite(response.durationMs) || response.durationMs < 0) {
    throw createError('SYSTEM_TRANSLATION_INVALID_RESPONSE')
  }
  return { text: response.text, sourceLang: response.sourceLang, targetLang: response.targetLang, durationMs: response.durationMs }
}

function closeSystemTranslation() {
  if (worker)
    terminate(worker, 'SYSTEM_TRANSLATION_ABORTED', 'Native translation closed')
  latestStatus = { supported: false, ready: false, installedLanguages: [] }
}

process.once('exit', closeSystemTranslation)
module.exports = { getSystemTranslationStatus, isSystemTranslationAvailable, translateSystemText, closeSystemTranslation }
