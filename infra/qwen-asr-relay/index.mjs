const MODEL = 'qwen-audio-3.0-asr-flash'
const DATA_URI_PREFIX = 'data:audio/wav;base64,'
const MAX_DATA_URI_BYTES = 14 * 1024 * 1024
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000
const GENERATION_PATH = '/services/aigc/multimodal-generation/generation'

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function endpointBase(value) {
  try {
    const url = new URL(value || '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('invalid endpoint')
    url.pathname = url.pathname.replace(/\/+$/, '') || '/api/v1'
    if (!url.pathname.endsWith('/api/v1'))
      throw new Error('invalid endpoint')
    return url
  }
  catch {
    throw new Error('RELAY_ENDPOINT_INVALID')
  }
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length)
    return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function authorized(request, secret) {
  if (typeof secret !== 'string' || !secret)
    return false
  const header = request.headers.get('authorization') || ''
  if (!header.startsWith('Bearer '))
    return false
  return constantTimeEqual(header.slice(7), secret)
}

async function readBoundedJson(request) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DATA_URI_BYTES + 32_768)
    throw new Error('RELAY_BODY_TOO_LARGE')

  const reader = request.body?.getReader()
  if (!reader)
    throw new Error('RELAY_BODY_INVALID')
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > MAX_DATA_URI_BYTES + 32_768) {
        await reader.cancel().catch(() => {})
        throw new Error('RELAY_BODY_TOO_LARGE')
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  catch {
    throw new Error('RELAY_BODY_INVALID')
  }
}

function normalizeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('RELAY_BODY_INVALID')
  if (body.model !== MODEL)
    throw new Error('RELAY_MODEL_UNSUPPORTED')
  const messages = body.input?.messages
  if (!Array.isArray(messages) || messages.length !== 1)
    throw new Error('RELAY_AUDIO_INVALID')
  const content = messages[0]?.content
  if (!Array.isArray(content) || content.length !== 1)
    throw new Error('RELAY_AUDIO_INVALID')
  const data = content[0]?.input_audio?.data
  if (typeof data !== 'string' || !data.startsWith(DATA_URI_PREFIX) || data.length > MAX_DATA_URI_BYTES)
    throw new Error('RELAY_AUDIO_INVALID')
  const parameters = body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
    ? body.parameters
    : {}
  const sampleRate = parameters.sample_rate
  if (sampleRate !== undefined && sampleRate !== 16_000)
    throw new Error('RELAY_AUDIO_FORMAT_UNSUPPORTED')
  const hints = parameters.language_hints
  if (hints !== undefined && (!Array.isArray(hints) || hints.length > 1 || (hints[0] !== undefined && typeof hints[0] !== 'string')))
    throw new Error('RELAY_LANGUAGE_INVALID')
  return {
    model: MODEL,
    input: {
      messages: [{
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data } }],
      }],
    },
    parameters: {
      format: 'wav',
      sample_rate: 16_000,
      ...(hints?.length ? { language_hints: [hints[0]] } : {}),
    },
  }
}

async function readCappedText(response) {
  const reader = response.body?.getReader()
  if (!reader)
    return ''
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done)
        break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new Error('RELAY_RESPONSE_TOO_LARGE')
      }
      chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health')
      return json({ ok: true, service: 'qwen-asr-relay' })
    if (request.method !== 'POST' || !url.pathname.endsWith(GENERATION_PATH))
      return json({ error: 'RELAY_ROUTE_NOT_FOUND' }, 404)
    if (!(await authorized(request, env.RELAY_SHARED_SECRET)))
      return json({ error: 'RELAY_UNAUTHORIZED' }, 401)

    let payload
    try {
      payload = normalizeRequest(await readBoundedJson(request))
    }
    catch (error) {
      const code = error instanceof Error ? error.message : 'RELAY_BODY_INVALID'
      const status = code === 'RELAY_BODY_TOO_LARGE' ? 413 : 400
      return json({ error: code }, status)
    }

    let upstream
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const endpoint = endpointBase(env.DASHSCOPE_ENDPOINT)
      if (typeof env.DASHSCOPE_API_KEY !== 'string' || !env.DASHSCOPE_API_KEY)
        throw new Error('RELAY_PROVIDER_SECRET_MISSING')
      const upstreamUrl = new URL(endpoint.toString())
      upstreamUrl.pathname = `${endpoint.pathname.replace(/\/+$/, '')}${GENERATION_PATH}`
      upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'disable',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const body = await readCappedText(upstream)
      return new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    catch (error) {
      return json({ error: error instanceof Error && error.name === 'AbortError' ? 'RELAY_UPSTREAM_TIMEOUT' : 'RELAY_UPSTREAM_UNAVAILABLE' }, 502)
    }
    finally {
      clearTimeout(timer)
    }
  },
}
