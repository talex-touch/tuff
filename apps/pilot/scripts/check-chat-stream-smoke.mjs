#!/usr/bin/env node

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { URL } from 'node:url'

const DEFAULT_MESSAGE = '请连续输出 12 行中文短句，每行前带阿拉伯数字编号，内容围绕“为什么流式响应需要及时分块返回”。不要省略编号。'
const DEFAULT_TIMEOUT_MS = 45000
const DEFAULT_FIRST_FRAME_TIMEOUT_MS = 12000
const DEFAULT_BUFFERING_WINDOW_MS = 800

function readArg(name, fallback = '') {
  const exact = `--${name}`
  const prefix = `${exact}=`
  const matched = process.argv.find(arg => arg.startsWith(prefix))
  if (matched) {
    return matched.slice(prefix.length)
  }
  const index = process.argv.indexOf(exact)
  if (index >= 0 && index + 1 < process.argv.length) {
    return process.argv[index + 1]
  }
  return fallback
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value, fallback, min = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.floor(parsed))
}

function normalizeBaseUrl(value) {
  const baseUrl = normalizeText(value).replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('missing --base-url, example: --base-url http://127.0.0.1:3300')
  }
  return baseUrl
}

function extractCookieHeader(headers) {
  const single = headers['set-cookie']
  const rawCookies = Array.isArray(single)
    ? single
    : single
      ? [single]
      : []

  return rawCookies
    .map(item => normalizeText(item).split(';')[0])
    .filter(Boolean)
    .join('; ')
}

function mergeCookieHeaders(...values) {
  return values
    .map(item => normalizeText(item))
    .filter(Boolean)
    .join('; ')
}

function parseSseFrame(frame) {
  const lines = frame.split('\n')
  let event = 'message'
  const dataLines = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message'
      continue
    }
    if (line.startsWith('data:')) {
      const data = line.slice(5)
      dataLines.push(data.startsWith(' ') ? data.slice(1) : data)
    }
  }

  if (dataLines.length <= 0) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

function summarizeEventType(frame) {
  if (!frame) {
    return ''
  }
  if (frame.data === '[DONE]') {
    return '[DONE]'
  }
  const parsed = parseJsonSafe(frame.data)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return frame.event
  }
  return normalizeText(parsed.type || parsed.event) || frame.event
}

function sendHttpRequest(targetUrl, options) {
  const url = new URL(targetUrl)
  const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest

  return new Promise((resolve, reject) => {
    const req = requestImpl({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options.method,
      headers: options.headers,
    }, (response) => {
      resolve({
        response,
        statusCode: Number(response.statusCode || 0),
        headers: response.headers,
      })
    })

    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new Error(`request timeout after ${options.timeoutMs}ms`))
    })
    req.on('error', reject)
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

async function readResponseText(response) {
  return await new Promise((resolve, reject) => {
    const chunks = []
    response.setEncoding('utf8')
    response.on('data', chunk => chunks.push(chunk))
    response.on('end', () => resolve(chunks.join('')))
    response.on('error', reject)
  })
}

async function createSession(baseUrl, headers, timeoutMs) {
  const { response, statusCode, headers: responseHeaders } = await sendHttpRequest(`${baseUrl}/api/chat/sessions`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      title: 'pilot-stream-smoke',
    }),
    timeoutMs,
  })

  const text = await readResponseText(response)
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`failed to create session: ${statusCode} ${text}`)
  }
  const payload = parseJsonSafe(text)
  const sessionId = normalizeText(payload?.session?.sessionId || payload?.session?.id)
  if (!sessionId) {
    throw new Error(`missing session id in create-session response: ${text}`)
  }
  return {
    sessionId,
    cookieHeader: extractCookieHeader(responseHeaders),
  }
}

async function streamSession(baseUrl, sessionId, headers, message, timeoutMs) {
  const startedAt = performance.now()
  const { response, statusCode, headers: responseHeaders } = await sendHttpRequest(`${baseUrl}/api/chat/sessions/${encodeURIComponent(sessionId)}/stream`, {
    method: 'POST',
    headers: {
      'accept': 'text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({
      message,
      internet: false,
      thinking: true,
      memoryEnabled: false,
      metadata: {
        source: 'pilot-stream-smoke',
      },
    }),
    timeoutMs,
  })
  const headerReceivedAt = performance.now()

  if (statusCode < 200 || statusCode >= 300) {
    const errorText = await readResponseText(response)
    throw new Error(`stream request failed: ${statusCode} ${errorText}`)
  }

  const contentType = normalizeText(responseHeaders['content-type'])
  const accelBuffering = normalizeText(responseHeaders['x-accel-buffering']).toLowerCase()
  if (!contentType.includes('text/event-stream')) {
    throw new Error(`unexpected content-type: ${contentType || '<empty>'}`)
  }
  if (accelBuffering !== 'no') {
    throw new Error(`unexpected x-accel-buffering header: ${accelBuffering || '<empty>'}`)
  }
  let buffer = ''
  let chunkCount = 0
  let frameCount = 0
  let firstChunkMs = null
  let firstFrameMs = null
  const eventTypes = []

  await new Promise((resolve, reject) => {
    response.setEncoding('utf8')
    response.on('data', (chunk) => {
      const now = performance.now()
      if (!chunk) {
        return
      }

      chunkCount += 1
      if (firstChunkMs === null) {
        firstChunkMs = Math.round(now - startedAt)
      }

      buffer += String(chunk).replace(/\r\n/g, '\n')
      let frameEndIndex = buffer.indexOf('\n\n')
      while (frameEndIndex !== -1) {
        const parsed = parseSseFrame(buffer.slice(0, frameEndIndex))
        buffer = buffer.slice(frameEndIndex + 2)
        if (parsed) {
          frameCount += 1
          if (firstFrameMs === null) {
            firstFrameMs = Math.round(now - startedAt)
          }
          eventTypes.push(summarizeEventType(parsed))
        }
        frameEndIndex = buffer.indexOf('\n\n')
      }
    })
    response.on('end', resolve)
    response.on('error', reject)
  })

  const finishedAt = performance.now()
  return {
    status: statusCode,
    contentType,
    accelBuffering,
    sessionId,
    headerReceivedMs: Math.round(headerReceivedAt - startedAt),
    firstChunkMs,
    firstFrameMs,
    totalDurationMs: Math.round(finishedAt - startedAt),
    chunkCount,
    frameCount,
    eventTypes: Array.from(new Set(eventTypes)).filter(Boolean),
  }
}

function evaluateSummary(summary, options) {
  const failures = []
  if (summary.firstChunkMs === null) {
    failures.push('response body never produced a chunk')
  }
  if (summary.firstFrameMs === null) {
    failures.push('no SSE frame was parsed from the response body')
  }
  if (summary.firstFrameMs !== null && summary.firstFrameMs > options.firstFrameTimeoutMs) {
    failures.push(`first SSE frame arrived too late (${summary.firstFrameMs}ms > ${options.firstFrameTimeoutMs}ms)`)
  }
  if (summary.totalDurationMs >= options.bufferingWindowMs * 2 && summary.chunkCount <= 1) {
    failures.push(`response only emitted ${summary.chunkCount} chunk during ${summary.totalDurationMs}ms, likely buffered by proxy`)
  }
  if (
    summary.firstChunkMs !== null
    && summary.totalDurationMs >= options.bufferingWindowMs * 2
    && summary.firstChunkMs >= summary.totalDurationMs - options.bufferingWindowMs
  ) {
    failures.push(`first chunk arrived near stream end (${summary.firstChunkMs}ms / ${summary.totalDurationMs}ms), likely buffered by proxy`)
  }
  return failures
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log([
      'Usage:',
      '  node ./scripts/check-chat-stream-smoke.mjs --base-url http://127.0.0.1:3300',
      '',
      'Optional:',
      '  --message "<custom prompt>"',
      '  --cookie "<cookie header>"',
      '  --authorization "Bearer xxx"',
      '  --timeout-ms 45000',
      '  --first-frame-timeout-ms 12000',
      '  --buffering-window-ms 800',
    ].join('\n'))
    return
  }

  const baseUrl = normalizeBaseUrl(readArg('base-url'))
  const message = normalizeText(readArg('message')) || DEFAULT_MESSAGE
  const timeoutMs = normalizeNumber(readArg('timeout-ms'), DEFAULT_TIMEOUT_MS, 1000)
  const firstFrameTimeoutMs = normalizeNumber(readArg('first-frame-timeout-ms'), DEFAULT_FIRST_FRAME_TIMEOUT_MS, 100)
  const bufferingWindowMs = normalizeNumber(readArg('buffering-window-ms'), DEFAULT_BUFFERING_WINDOW_MS, 100)
  const initialCookieHeader = normalizeText(readArg('cookie'))
  const authorization = normalizeText(readArg('authorization'))

  const baseHeaders = {}
  if (authorization) {
    baseHeaders.authorization = authorization
  }
  if (initialCookieHeader) {
    baseHeaders.cookie = initialCookieHeader
  }

  const created = await createSession(baseUrl, baseHeaders, timeoutMs)
  const cookieHeader = mergeCookieHeaders(initialCookieHeader, created.cookieHeader)
  const streamHeaders = {
    ...baseHeaders,
  }
  if (cookieHeader) {
    streamHeaders.cookie = cookieHeader
  }

  const summary = await streamSession(
    baseUrl,
    created.sessionId,
    streamHeaders,
    message,
    timeoutMs,
  )
  const failures = evaluateSummary(summary, {
    firstFrameTimeoutMs,
    bufferingWindowMs,
  })

  const result = failures.length > 0 ? 'fail' : 'pass'
  console.log(JSON.stringify({
    result,
    summary,
    failures,
  }, null, 2))

  if (failures.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    result: 'fail',
    failures: [error instanceof Error ? error.message : String(error)],
  }, null, 2))
  process.exit(1)
})
