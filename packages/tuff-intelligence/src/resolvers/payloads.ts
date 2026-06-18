import type {
  IntelligenceImageEditPayload,
  IntelligenceImageGeneratePayload,
  IntelligenceVisionImageSource,
} from '../types/intelligence'
import { toRuntimeCapabilityId } from './capabilities'

export type NormalizedIntelligencePayload =
  | { capabilityId: 'image.generate', payload: IntelligenceImageGeneratePayload }
  | { capabilityId: 'image.edit', payload: IntelligenceImageEditPayload }
  | { capabilityId: string, payload: unknown }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return list.length ? list : undefined
}

function normalizeImageSize(size: unknown): { width?: number, height?: number } {
  if (typeof size === 'string') {
    const match = size.trim().match(/^(\d+)x(\d+)$/i)
    if (match) {
      return {
        width: Number(match[1]),
        height: Number(match[2]),
      }
    }
  }
  if (size && typeof size === 'object' && !Array.isArray(size)) {
    const record = size as Record<string, unknown>
    return {
      width: readNumber(record.width),
      height: readNumber(record.height),
    }
  }
  return {}
}

function normalizeImageSource(value: unknown): IntelligenceVisionImageSource | undefined {
  if (typeof value === 'string' && value.trim()) {
    const source = value.trim()
    if (source.startsWith('data:')) {
      return { type: 'data-url', dataUrl: source }
    }
    if (/^[A-Za-z0-9+/]+=*$/.test(source) && source.length > 64) {
      return { type: 'base64', base64: source }
    }
    return { type: 'file', filePath: source }
  }

  const record = asRecord(value)
  const dataUrl = readString(record.dataUrl ?? record.data_url ?? record.url)
  if (dataUrl?.startsWith('data:')) {
    return { type: 'data-url', dataUrl }
  }
  const filePath = readString(record.filePath ?? record.file_path ?? record.path)
  if (filePath) {
    return { type: 'file', filePath }
  }
  const base64 = readString(record.base64 ?? record.b64_json)
  if (base64) {
    return { type: 'base64', base64 }
  }
  if (record.type === 'data-url' || record.type === 'file' || record.type === 'base64') {
    return record as unknown as IntelligenceVisionImageSource
  }
  return undefined
}

function normalizeImageGeneratePayload(payload: unknown): IntelligenceImageGeneratePayload {
  const record = asRecord(payload)
  const size = normalizeImageSize(record.size)
  return {
    prompt: readString(record.prompt ?? record.input ?? record.text) ?? '',
    negativePrompt: readString(record.negativePrompt ?? record.negative_prompt),
    width: readNumber(record.width) ?? size.width,
    height: readNumber(record.height) ?? size.height,
    style: readString(record.style ?? record.stylePreset ?? record.style_preset),
    quality: readString(record.quality) as IntelligenceImageGeneratePayload['quality'],
    count: readNumber(record.count ?? record.n),
    seed: readNumber(record.seed),
  }
}

function normalizeImageEditPayload(payload: unknown): IntelligenceImageEditPayload {
  const record = asRecord(payload)
  const source = normalizeImageSource(record.source ?? record.image ?? record.input_image)
  const mask = normalizeImageSource(record.mask)
  return {
    source: source ?? { type: 'base64', base64: '' },
    mask,
    prompt: readString(record.prompt ?? record.input ?? record.text) ?? '',
    editType: readString(record.editType ?? record.edit_type ?? record.operation) as IntelligenceImageEditPayload['editType'],
  }
}

export function normalizeIntelligencePayload(
  capabilityId: unknown,
  payload: unknown,
): NormalizedIntelligencePayload {
  const normalizedCapabilityId = toRuntimeCapabilityId(capabilityId)

  if (normalizedCapabilityId === 'image.generate') {
    return {
      capabilityId: 'image.generate',
      payload: normalizeImageGeneratePayload(payload),
    }
  }

  if (normalizedCapabilityId === 'image.edit') {
    return {
      capabilityId: 'image.edit',
      payload: normalizeImageEditPayload(payload),
    }
  }

  if (normalizedCapabilityId === 'text.chat') {
    const record = asRecord(payload)
    const messages = Array.isArray(record.messages)
      ? record.messages
      : readString(record.prompt ?? record.input ?? record.text)
        ? [{ role: 'user', content: readString(record.prompt ?? record.input ?? record.text)! }]
        : undefined
    return {
      capabilityId: normalizedCapabilityId,
      payload: messages ? { ...record, messages } : payload,
    }
  }

  if (normalizedCapabilityId === 'text.translate') {
    const record = asRecord(payload)
    return {
      capabilityId: normalizedCapabilityId,
      payload: {
        ...record,
        targetLang: readString(record.targetLang ?? record.target_lang ?? record.to) ?? record.targetLang,
        sourceLang: readString(record.sourceLang ?? record.source_lang ?? record.from) ?? record.sourceLang,
      },
    }
  }

  const record = asRecord(payload)
  const tags = readStringArray(record.tags)
  return {
    capabilityId: normalizedCapabilityId,
    payload: tags ? { ...record, tags } : payload,
  }
}
