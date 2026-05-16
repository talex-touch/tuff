import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult
} from '@talex-touch/tuff-intelligence'
import type {
  OmniPanelContextSource,
  OmniPanelDesktopContextCapsule
} from '../../../../shared/events/omni-panel'
import {
  resolveDesktopContextInput,
  summarizeDesktopContextCapsule
} from '../../../../shared/intelligence/desktop-context-capsule'

export type OmniPanelAiActionId =
  | 'builtin.ai.translate'
  | 'builtin.ai.summarize'
  | 'builtin.ai.rewrite'
  | 'builtin.ai.explain'
  | 'builtin.ai.review'

export interface OmniPanelAiInvokeRequest {
  capabilityId: string
  payload: unknown
  options: IntelligenceInvokeOptions
}

export interface OmniPanelAiPreviewResult {
  text: string
  provider: string
  model: string
  traceId: string
  latency: number
}

const AI_ACTION_IDS = new Set<string>([
  'builtin.ai.translate',
  'builtin.ai.summarize',
  'builtin.ai.rewrite',
  'builtin.ai.explain',
  'builtin.ai.review'
])

const CODE_HINT_PATTERN =
  /(^|\n)\s*(import|export|const|let|var|function|class|interface|type|enum|def|public|private|protected|async|await|return|if|for|while|try|catch)\b|[{};]\s*$|=>|<\/?[a-z][\s\S]*>/i

export function isOmniPanelAiAction(id: string): id is OmniPanelAiActionId {
  return AI_ACTION_IDS.has(id)
}

export function resolveOmniPanelAiInput(
  selectedText: string,
  capsule?: OmniPanelDesktopContextCapsule
): string {
  return resolveDesktopContextInput(selectedText, capsule)
}

export function createOmniPanelAiInputPreview(inputText: string, maxLength = 72): string {
  const normalized = inputText.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  const safeMaxLength = Math.max(16, maxLength)
  if (normalized.length <= safeMaxLength) {
    return normalized
  }

  return `${normalized.slice(0, safeMaxLength - 3)}...`
}

export function looksLikeCode(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (CODE_HINT_PATTERN.test(normalized)) return true
  const codeLineCount = normalized
    .split(/\r?\n/)
    .filter((line) => /^\s{2,}\S/.test(line) || /[{}();=<>]/.test(line)).length
  return normalized.includes('\n') && codeLineCount >= 2
}

export function buildOmniPanelAiInvokeRequest(params: {
  actionId: OmniPanelAiActionId
  inputText: string
  source: OmniPanelContextSource | string
  capsule?: OmniPanelDesktopContextCapsule
}): OmniPanelAiInvokeRequest {
  const inputText = params.inputText.trim()
  const metadata = buildSafeMetadata(params)

  if (params.actionId === 'builtin.ai.translate') {
    return {
      capabilityId: 'text.translate',
      payload: {
        text: inputText,
        sourceLang: 'auto',
        targetLang: 'zh'
      },
      options: { metadata }
    }
  }

  if (params.actionId === 'builtin.ai.summarize') {
    return {
      capabilityId: 'text.summarize',
      payload: {
        text: inputText,
        style: 'bullet-points',
        maxLength: 600
      },
      options: { metadata }
    }
  }

  if (params.actionId === 'builtin.ai.rewrite') {
    return {
      capabilityId: 'text.rewrite',
      payload: {
        text: inputText,
        style: 'professional',
        tone: 'neutral'
      },
      options: { metadata }
    }
  }

  if (params.actionId === 'builtin.ai.review') {
    return {
      capabilityId: 'code.review',
      payload: {
        code: inputText,
        focusAreas: ['bugs', 'best-practices']
      },
      options: { metadata }
    }
  }

  if (looksLikeCode(inputText)) {
    return {
      capabilityId: 'code.explain',
      payload: {
        code: inputText,
        depth: 'brief',
        targetAudience: 'intermediate'
      },
      options: { metadata }
    }
  }

  return {
    capabilityId: 'text.chat',
    payload: {
      messages: [
        {
          role: 'user',
          content: `请用简洁清晰的方式解释以下内容：\n\n${inputText}`
        }
      ]
    },
    options: { metadata }
  }
}

export function normalizeOmniPanelAiResult(
  result: IntelligenceInvokeResult<unknown>
): OmniPanelAiPreviewResult {
  return {
    text: stringifyResult(result.result),
    provider: result.provider,
    model: result.model,
    traceId: result.traceId,
    latency: result.latency
  }
}

function buildSafeMetadata(params: {
  actionId: OmniPanelAiActionId
  source: OmniPanelContextSource | string
  capsule?: OmniPanelDesktopContextCapsule
}): Record<string, unknown> {
  const contextSummary = summarizeDesktopContextCapsule(params.capsule)

  return {
    caller: 'omni-panel',
    entry: 'selection-ai',
    featureId: params.actionId,
    source: params.source,
    contextKinds: contextSummary.contextKinds
  }
}

function stringifyResult(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return String(value ?? '').trim()

  const record = value as Record<string, unknown>
  if (typeof record.explanation === 'string') {
    return [
      record.summary,
      record.explanation,
      Array.isArray(record.keyPoints) ? record.keyPoints.map((item) => `- ${item}`).join('\n') : ''
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join('\n\n')
      .trim()
  }

  if (typeof record.summary === 'string') {
    const issues = Array.isArray(record.issues)
      ? record.issues
          .map((issue) => {
            if (!issue || typeof issue !== 'object') return ''
            const item = issue as Record<string, unknown>
            return `- ${String(item.severity ?? 'info')}: ${String(item.message ?? '')}`.trim()
          })
          .filter(Boolean)
          .join('\n')
      : ''
    const improvements = Array.isArray(record.improvements)
      ? record.improvements.map((item) => `- ${String(item)}`).join('\n')
      : ''

    return [
      record.summary,
      issues ? `Issues:\n${issues}` : '',
      improvements ? `Improvements:\n${improvements}` : ''
    ]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .join('\n\n')
      .trim()
  }

  return JSON.stringify(value, null, 2)
}
