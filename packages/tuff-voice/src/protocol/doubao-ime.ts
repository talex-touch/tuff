import type { VoiceProviderEvent, VoiceStreamRequest } from '../contracts'
import { Buffer } from 'node:buffer'
import { VoiceProviderError } from '../contracts'

export const DEFAULT_DOUBAO_IME_STREAM_URL = 'wss://frontier-audio-ime-ws.doubao.com/ocean/api/v1/ws'
export const DEFAULT_DOUBAO_IME_TOKEN_URL = 'https://ime.oceancloudapi.com/api/v1/user/get_config'

export interface DoubaoImeCredentials {
  appKey: string
  accessKey: string
}

export interface DoubaoImeTokenResponse {
  Code?: number
  Msg?: string
  Data?: {
    sami_token?: string
  }
}

const tokenCache = new Map<string, { token: string, expiresAt: number }>()

function assertDoubaoImeCredentials(credentials?: Partial<DoubaoImeCredentials>): DoubaoImeCredentials {
  const appKey = credentials?.appKey?.trim() ?? ''
  const accessKey = credentials?.accessKey?.trim() ?? ''
  if (!appKey || !accessKey) {
    throw new VoiceProviderError(
      'DOUBAO_IME_CREDENTIALS_MISSING',
      'Doubao IME requires explicit caller-provided appKey and accessKey credentials.',
    )
  }
  return { appKey, accessKey }
}

/**
 * Fetches and caches a valid SAMI token for Doubao IME cloud ASR using caller-provided credentials.
 */
export async function acquireDoubaoImeToken(
  credentials: DoubaoImeCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { appKey, accessKey } = assertDoubaoImeCredentials(credentials)
  const cacheKey = `${appKey}:${accessKey}`
  const now = Date.now()
  const cached = tokenCache.get(cacheKey)
  if (cached && now < cached.expiresAt - 600_000) {
    return cached.token
  }

  const response = await fetchImpl(DEFAULT_DOUBAO_IME_TOKEN_URL, {
    method: 'POST',
    headers: {
      'User-Agent': 'tuff-voice',
      'Content-Type': 'application/json',
      'X-Api-Access-Key': accessKey,
      'X-Api-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({ sami_app_key: appKey }),
    redirect: 'manual',
  })

  if (!response.ok) {
    throw new VoiceProviderError(
      `DOUBAO_IME_HTTP_${response.status}`,
      `Failed to acquire Doubao IME token: HTTP ${response.status}`,
      { retryable: response.status >= 500 },
    )
  }

  const data = (await response.json()) as DoubaoImeTokenResponse
  if (data.Code === 0 && data.Data?.sami_token) {
    tokenCache.set(cacheKey, {
      token: data.Data.sami_token,
      expiresAt: now + 18_000_000, // 5 hours
    })
    return data.Data.sami_token
  }

  throw new VoiceProviderError('DOUBAO_IME_TOKEN_INVALID', 'Invalid Doubao IME token response.')
}

export function clearDoubaoImeTokenCache(): void {
  tokenCache.clear()
}

export function buildDoubaoImeStartTask(
  taskId: string,
  sessionId: string,
  token: string,
  appKey: string,
  request?: Partial<VoiceStreamRequest>,
): string {
  const trimmedAppKey = appKey.trim()
  if (!trimmedAppKey) {
    throw new VoiceProviderError('DOUBAO_IME_CREDENTIALS_MISSING', 'Doubao IME appKey is required.')
  }
  const payload = {
    app_name: 'tuff-voice',
    app_version: '1.0.0',
    enable_asr_twopass: request?.enableNonstream ?? true,
    enable_asr_threepass: request?.enableDdc ?? true,
    strong_ddc: request?.enableDdc ?? true,
    remove_space_between_han_num: true,
    remove_space_between_han_eng: true,
    enable_asr_format: request?.enablePunctuation ?? true,
    audio_format: request?.audio?.codec === 'opus' ? 'speech_opus' : 'raw_pcm',
  }

  return JSON.stringify({
    task_id: taskId,
    session_id: sessionId,
    namespace: 'ASR',
    event: 'StartTask',
    appkey: trimmedAppKey,
    token,
    payload: JSON.stringify(payload),
  })
}

export function buildDoubaoImeAudioRequest(
  taskId: string,
  sessionId: string,
  token: string,
  appKey: string,
  seqId: number,
  audioChunk: Uint8Array,
  isLast = false,
): string {
  const trimmedAppKey = appKey.trim()
  if (!trimmedAppKey) {
    throw new VoiceProviderError('DOUBAO_IME_CREDENTIALS_MISSING', 'Doubao IME appKey is required.')
  }
  const extra = {
    is_history_audio: false,
    seq_id: seqId,
    timestamp_ms: Date.now(),
    is_last_history_audio: isLast,
  }

  return JSON.stringify({
    task_id: taskId,
    session_id: sessionId,
    namespace: 'ASR',
    event: 'TaskRequest',
    appkey: trimmedAppKey,
    token,
    payload: Buffer.from(audioChunk).toString('base64'),
    extra: JSON.stringify(extra),
  })
}

export function buildDoubaoImeFinishTask(
  taskId: string,
  sessionId: string,
  token: string,
  appKey: string,
): string {
  const trimmedAppKey = appKey.trim()
  if (!trimmedAppKey) {
    throw new VoiceProviderError('DOUBAO_IME_CREDENTIALS_MISSING', 'Doubao IME appKey is required.')
  }
  return JSON.stringify({
    task_id: taskId,
    session_id: sessionId,
    namespace: 'ASR',
    event: 'FinishTask',
    appkey: trimmedAppKey,
    token,
  })
}

export interface DoubaoImeServerMessage {
  task_id?: string
  message_id?: string
  namespace?: string
  event?: string
  status_code?: number
  status_text?: string
  payload?: string
}

export function parseDoubaoImeResponse(
  rawText: string,
): VoiceProviderEvent | null {
  try {
    const msg = JSON.parse(rawText) as DoubaoImeServerMessage
    if (msg.status_code && msg.status_code !== 20000000) {
      return {
        type: 'error',
        code: `DOUBAO_IME_${msg.status_code}`,
        message: msg.status_text || 'Doubao IME ASR error',
        retryable: msg.status_code === 40200001, // Token expired -> retryable
        requestId: msg.task_id,
      }
    }

    if (msg.payload) {
      const payload = JSON.parse(msg.payload)
      const results = payload.results as Array<{ text?: string, is_interim?: boolean }> | undefined
      if (results && results.length > 0) {
        const first = results[0]
        const text = first?.text ?? ''
        if (text) {
          const isInterim = first.is_interim ?? true
          return isInterim
            ? { type: 'partial', text, requestId: msg.task_id }
            : { type: 'final', text, requestId: msg.task_id }
        }
      }
    }

    if (msg.event === 'TaskFinished') {
      return { type: 'end', requestId: msg.task_id }
    }

    return null
  }
  catch {
    return null
  }
}
