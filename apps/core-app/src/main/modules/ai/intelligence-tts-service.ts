import type {
  IntelligenceTTSResult,
  IntelligenceTtsSpeakPayload,
  IntelligenceTtsSpeakResult
} from '@talex-touch/tuff-intelligence'
import { createHash } from 'node:crypto'
import { tuffIntelligence } from './intelligence-sdk'

const TTS_CACHE_TTL_MS = 30 * 60 * 1000
const TTS_CACHE_MAX_ENTRIES = 64
const TTS_TEXT_MAX_LENGTH = 4096

interface TtsCacheEntry {
  value: IntelligenceTtsSpeakResult
  cachedAt: number
}

type NormalizedTtsSpeakPayload = Omit<IntelligenceTtsSpeakPayload, 'text' | 'format'> & {
  text: string
  format: NonNullable<IntelligenceTtsSpeakPayload['format']>
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeFormat(value: unknown): NormalizedTtsSpeakPayload['format'] {
  if (value === 'wav' || value === 'ogg' || value === 'flac' || value === 'mp3') {
    return value
  }
  return 'mp3'
}

function normalizeQuality(value: unknown): IntelligenceTtsSpeakPayload['quality'] | undefined {
  if (value === 'standard' || value === 'hd') {
    return value
  }
  return undefined
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return value
}

function resolveMimeType(format: string): string {
  switch (format.toLowerCase()) {
    case 'wav':
      return 'audio/wav'
    case 'ogg':
    case 'opus':
      return 'audio/ogg'
    case 'flac':
      return 'audio/flac'
    case 'mp3':
    default:
      return 'audio/mpeg'
  }
}

function normalizeAudioToDataUrl(audio: unknown, format: string): string {
  if (typeof audio === 'string') {
    const value = audio.trim()
    if (!value) {
      return ''
    }
    if (value.startsWith('data:')) {
      return value
    }
    return `data:${resolveMimeType(format)};base64,${value}`
  }

  if (audio instanceof ArrayBuffer) {
    return `data:${resolveMimeType(format)};base64,${Buffer.from(audio).toString('base64')}`
  }

  if (ArrayBuffer.isView(audio)) {
    const buffer = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)
    return `data:${resolveMimeType(format)};base64,${buffer.toString('base64')}`
  }

  return ''
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export class IntelligenceTtsService {
  private cache = new Map<string, TtsCacheEntry>()

  async speak(payload: IntelligenceTtsSpeakPayload): Promise<IntelligenceTtsSpeakResult> {
    const normalized = this.normalizePayload(payload)
    const cacheKey = this.getCacheKey(normalized)
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      return {
        ...cached,
        sourceTraceId: normalized.sourceTraceId,
        cacheHit: true
      }
    }

    const result = await tuffIntelligence.invoke<IntelligenceTTSResult>(
      'audio.tts',
      {
        text: normalized.text,
        voice: normalized.voice,
        language: normalized.language,
        speed: normalized.speed,
        pitch: normalized.pitch,
        format: normalized.format,
        quality: normalized.quality
      },
      {
        preferredProviderId: normalized.providerId,
        modelPreference: normalized.model ? [normalized.model] : undefined,
        metadata: {
          ...normalized.metadata,
          entry: normalized.metadata?.entry ?? 'tts-speak',
          sourceTraceId: normalized.sourceTraceId
        }
      }
    )

    const format = result.result.format || normalized.format || 'mp3'
    const audio = normalizeAudioToDataUrl(result.result.audio, format)
    if (!audio) {
      throw new Error('[Intelligence] TTS provider returned empty audio')
    }

    const response: IntelligenceTtsSpeakResult = {
      audio,
      format,
      duration: result.result.duration,
      sampleRate: result.result.sampleRate,
      provider: result.provider,
      model: result.model,
      traceId: result.traceId,
      sourceTraceId: normalized.sourceTraceId,
      cacheHit: false
    }

    this.setToCache(cacheKey, response)
    return response
  }

  clear(): void {
    this.cache.clear()
  }

  private normalizePayload(payload: IntelligenceTtsSpeakPayload): NormalizedTtsSpeakPayload {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid TTS speak payload')
    }

    const text = typeof payload.text === 'string' ? payload.text.trim() : ''
    if (!text) {
      throw new Error('TTS speak text is required')
    }
    if (text.length > TTS_TEXT_MAX_LENGTH) {
      throw new Error(`TTS speak text exceeds ${TTS_TEXT_MAX_LENGTH} characters`)
    }

    return {
      text,
      voice: optionalTrimmedString(payload.voice),
      language: optionalTrimmedString(payload.language),
      speed: normalizeNumber(payload.speed),
      pitch: normalizeNumber(payload.pitch),
      format: normalizeFormat(payload.format),
      quality: normalizeQuality(payload.quality),
      sourceTraceId: optionalTrimmedString(payload.sourceTraceId),
      providerId: optionalTrimmedString(payload.providerId),
      model: optionalTrimmedString(payload.model),
      metadata:
        payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? payload.metadata
          : undefined
    }
  }

  private getCacheKey(payload: NormalizedTtsSpeakPayload): string {
    return stableHash({
      text: payload.text,
      voice: payload.voice,
      language: payload.language,
      speed: payload.speed,
      pitch: payload.pitch,
      format: payload.format,
      quality: payload.quality,
      providerId: payload.providerId,
      model: payload.model
    })
  }

  private getFromCache(key: string): IntelligenceTtsSpeakResult | null {
    const cached = this.cache.get(key)
    if (!cached) {
      return null
    }
    if (Date.now() - cached.cachedAt > TTS_CACHE_TTL_MS) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, cached)
    return cached.value
  }

  private setToCache(key: string, value: IntelligenceTtsSpeakResult): void {
    this.cache.set(key, {
      value,
      cachedAt: Date.now()
    })

    while (this.cache.size > TTS_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value
      if (!oldestKey) {
        break
      }
      this.cache.delete(oldestKey)
    }
  }
}

export const intelligenceTtsService = new IntelligenceTtsService()
