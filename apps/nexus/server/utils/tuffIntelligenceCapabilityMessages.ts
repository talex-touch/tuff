import type { IntelligenceMessage } from '@talex-touch/tuff-intelligence/light'
import { createError } from 'h3'

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => readOptionalString(item))
    .filter((item): item is string => Boolean(item))
}

export function normalizeCapabilityMessages(messages: unknown): IntelligenceMessage[] {
  if (!Array.isArray(messages))
    return []
  return messages
    .map((message) => {
      const row = toRecord(message)
      const roleRaw = String(row.role || '').trim().toLowerCase()
      const role: IntelligenceMessage['role']
        = roleRaw === 'system' || roleRaw === 'assistant' ? roleRaw : 'user'
      const content = String(row.content || '').trim()
      return content ? { role, content } : null
    })
    .filter((message): message is IntelligenceMessage => Boolean(message))
}

function requireText(record: Record<string, unknown>, field = 'text'): string {
  const text = readOptionalString(record[field])
  if (!text) {
    throw createError({ statusCode: 400, statusMessage: `${field} is required.` })
  }
  return text
}

function textRewriteSystemPrompt(record: Record<string, unknown>): string {
  const preserveKeywords = readStringArray(record.preserveKeywords)
  const style = readOptionalString(record.style) || 'professional'
  const tone = readOptionalString(record.tone) || 'neutral'
  return [
    `You are a writing assistant. Rewrite in a ${style} style with a ${tone} tone.`,
    readOptionalString(record.targetAudience)
      ? `Target audience: ${readOptionalString(record.targetAudience)}.`
      : '',
    preserveKeywords.length ? `Preserve these keywords: ${preserveKeywords.join(', ')}.` : '',
    'Return only the rewritten text.',
  ].filter(Boolean).join(' ')
}

function textRewriteMessages(record: Record<string, unknown>): IntelligenceMessage[] {
  return [
    { role: 'system', content: textRewriteSystemPrompt(record) },
    { role: 'user', content: requireText(record) },
  ]
}

function codeReviewMessages(record: Record<string, unknown>): IntelligenceMessage[] {
  const code = requireText(record, 'code')
  const context = readOptionalString(record.context)
  const focusAreas = readStringArray(record.focusAreas)
  const focus = focusAreas.length
    ? focusAreas.join(', ')
    : 'security, performance, style, bugs, best-practices'
  return [
    {
      role: 'system',
      content: [
        `You are a code reviewer. Focus on ${focus}.`,
        'Return JSON: {"summary":"...","score":0,"issues":[],"improvements":[]}.',
      ].join(' '),
    },
    {
      role: 'user',
      content: context ? `Context:\n${context}\n\nCode:\n${code}` : code,
    },
  ]
}

function textChatMessages(record: Record<string, unknown>): IntelligenceMessage[] {
  const messages = normalizeCapabilityMessages(record.messages)
  if (messages.length <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'messages are required.' })
  }
  return messages
}

function textTranslateMessages(record: Record<string, unknown>): IntelligenceMessage[] {
  const targetLang = readOptionalString(record.targetLang)
  if (!targetLang) {
    throw createError({ statusCode: 400, statusMessage: 'text and targetLang are required.' })
  }
  const sourceLang = readOptionalString(record.sourceLang) || 'auto'
  return [
    {
      role: 'system',
      content: [
        `You are a professional translator. Translate from ${sourceLang} to ${targetLang}.`,
        'Return only the translated text.',
      ].join(' '),
    },
    { role: 'user', content: requireText(record) },
  ]
}

function textSummarizeMessages(record: Record<string, unknown>): IntelligenceMessage[] {
  const style = readOptionalString(record.style) || 'concise'
  const maxLength = readOptionalNumber(record.maxLength)
  return [
    {
      role: 'system',
      content: [
        `You are a summarization assistant. Style: ${style}.`,
        maxLength ? `Keep it under ${maxLength} characters.` : '',
        'Return only the summary.',
      ].filter(Boolean).join(' '),
    },
    { role: 'user', content: requireText(record) },
  ]
}

function jsonTextMessages(system: string, record: Record<string, unknown>): IntelligenceMessage[] {
  return [
    { role: 'system', content: system },
    { role: 'user', content: requireText(record) },
  ]
}

function codeExplainMessages(record: Record<string, unknown>): IntelligenceMessage[] {
  const language = readOptionalString(record.language) || 'the'
  const audience = readOptionalString(record.targetAudience) || 'intermediate'
  const depth = readOptionalString(record.depth) || 'detailed'
  return [
    {
      role: 'system',
      content: [
        `You are a code explanation assistant. Explain ${language} code`,
        `at ${audience} level with ${depth} depth.`,
        'Return JSON: {"explanation":"...","summary":"...","keyPoints":[],',
        '"complexity":"simple|moderate|complex","concepts":[]}.',
      ].join(' '),
    },
    { role: 'user', content: requireText(record, 'code') },
  ]
}

const KEYWORD_PROMPT = [
  'Extract important keywords from the text.',
  'Return JSON only: {"keywords":[{"term":"...","relevance":0.0}]}',
].join(' ')
const INTENT_PROMPT = [
  'Detect user intent.',
  'Return JSON only: {"intent":"...","confidence":0.0,"entities":[]}',
].join(' ')

type CapabilityMessageBuilder = (record: Record<string, unknown>) => IntelligenceMessage[]

const capabilityMessageBuilders: Record<string, CapabilityMessageBuilder> = {
  'text.chat': textChatMessages,
  'text.translate': textTranslateMessages,
  'text.summarize': textSummarizeMessages,
  'text.rewrite': textRewriteMessages,
  'keywords.extract': record => jsonTextMessages(KEYWORD_PROMPT, record),
  'intent.detect': record => jsonTextMessages(INTENT_PROMPT, record),
  'code.explain': codeExplainMessages,
  'code.review': codeReviewMessages,
}

export function buildCapabilityMessages(capabilityId: string, payload: unknown): IntelligenceMessage[] {
  const builder = capabilityMessageBuilders[capabilityId]
  if (!builder) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported capability: ${capabilityId}` })
  }
  return builder(toRecord(payload))
}
