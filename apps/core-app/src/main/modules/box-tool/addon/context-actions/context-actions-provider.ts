import type {
  ContextActionInput,
  ContextActionMatch,
  ContextActionProvider,
  ContextActionResult,
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from '../../search-engine/types'
import type { IntelligenceCodeReviewResult } from '@talex-touch/tuff-intelligence'
import { clipboard, shell } from 'electron'
import { performance } from 'node:perf_hooks'
import {
  CONTEXT_ACTIONS_PROVIDER_ID,
  getContextActionInput,
  isContextActionQuery,
  TuffInputType,
  TuffSearchResultBuilder
} from '@talex-touch/utils'
import { normalizeIntelligenceError } from '../../../ai/intelligence-error-normalizer'
import { resolveCapabilityStatus } from '../../../ai/intelligence-capability-status'
import { tuffIntelligence } from '../../../ai/intelligence-sdk'
import { pluginModule } from '../../../plugin/plugin-module'
import PluginFeaturesAdapter from '../../../plugin/adapters/plugin-features-adapter'
import { t } from '../../../../utils/i18n-helper'
import { openValidatedExternalUrl } from '../../../../utils/external-url-policy'

export const CONTEXT_ACTION_IDS = {
  QuickReview: 'quick-review',
  Summarize: 'summarize',
  Polish: 'polish',
  Rewrite: 'rewrite',
  WebSearch: 'web-search',
  Ocr: 'ocr',
  TranslateImageText: 'translate-image-text',
  ExplainImage: 'explain-image'
} as const

type ContextActionId = (typeof CONTEXT_ACTION_IDS)[keyof typeof CONTEXT_ACTION_IDS]

type ContextActionDefinition = {
  id: ContextActionId
  inputType: ContextActionInput['type']
  priority: number
  icon: { type: 'class'; value: string }
  title: () => string
  description: () => string
  sourceId: string
  sourceDisplayName: () => string
  capabilityIds: readonly string[]
  execute: (input: ContextActionInput) => Promise<ContextActionResult>
}

type PluginContextActionRoute = {
  pluginName: string
  featureId: string
  inputType: ContextActionInput['type']
  priority: number
  title: () => string
  description: () => string
  icon: { type: 'class'; value: string }
}

type ContextActionExecutionState = {
  actionId: ContextActionId
  completedAt: number
  result: ContextActionResult
}

type ContextActionItemMeta = {
  actionId: ContextActionId
  sessionId: string
}

type ContextActionResultItemMeta = {
  resultSessionId: string
}

const MAX_EXECUTION_STATES = 20
const TEXT_OUTPUT_PREVIEW_LENGTH = 260

const PLUGIN_ROUTES: readonly PluginContextActionRoute[] = [
  {
    pluginName: 'touch-translation',
    featureId: 'touch-translate',
    inputType: 'text',
    priority: 920,
    title: () => t('coreBox.contextActions.actions.translate.title'),
    description: () => t('coreBox.contextActions.actions.translate.description'),
    icon: { type: 'class', value: 'i-ri-translate-2' }
  },
  {
    pluginName: 'touch-snippets',
    featureId: 'snippets-save',
    inputType: 'text',
    priority: 760,
    title: () => t('coreBox.contextActions.actions.saveSnippet.title'),
    description: () => t('coreBox.contextActions.actions.saveSnippet.description'),
    icon: { type: 'class', value: 'i-ri-bookmark-3-line' }
  },
  {
    pluginName: 'touch-dev-utils',
    featureId: 'dev-utils',
    inputType: 'text',
    priority: 700,
    title: () => t('coreBox.contextActions.actions.devTools.title'),
    description: () => t('coreBox.contextActions.actions.devTools.description'),
    icon: { type: 'class', value: 'i-ri-code-box-line' }
  }
] as const

function isTextInput(
  input: ContextActionInput
): input is Extract<ContextActionInput, { type: 'text' }> {
  return input.type === 'text'
}

function isImageInput(
  input: ContextActionInput
): input is Extract<ContextActionInput, { type: 'image' }> {
  return input.type === 'image'
}

function trimDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

function intelligenceMetadata(actionId: ContextActionId, input: ContextActionInput) {
  return {
    entry: 'context-actions',
    actionId,
    inputType: input.type,
    inputSource: input.source
  }
}

function successText(message: string, text: string, label?: string): ContextActionResult {
  return {
    status: 'success',
    message,
    output: {
      type: 'text',
      text,
      label
    }
  }
}

function formatReview(result: IntelligenceCodeReviewResult): string {
  const issues = result.issues.map((issue) => {
    const location = typeof issue.line === 'number' ? ` L${issue.line}` : ''
    const suggestion = issue.suggestion ? `\n  ${issue.suggestion}` : ''
    return `[${issue.severity}]${location} ${issue.message}${suggestion}`
  })
  const improvements = result.improvements.map((item) => `- ${item}`)

  return [
    result.summary,
    t('coreBox.contextActions.reviewScore', { score: result.score }),
    ...issues,
    ...improvements
  ]
    .filter(Boolean)
    .join('\n')
}

async function executeIntelligence<T>(
  capabilityId: string,
  invoke: () => Promise<{ result: T }>,
  format: (result: T) => string,
  successMessage: string
): Promise<ContextActionResult> {
  try {
    const response = await invoke()
    const output = format(response.result).trim()
    if (!output) {
      return {
        status: 'error',
        code: 'EMPTY_RESULT',
        message: t('coreBox.contextActions.errors.emptyResult'),
        recoverable: true
      }
    }
    return successText(successMessage, output)
  } catch (error) {
    const normalized = normalizeIntelligenceError(error, { capabilityId })
    return {
      status: 'error',
      code: normalized.code,
      message: `${normalized.reason} ${normalized.recovery}`,
      recoverable: normalized.code !== 'PERMISSION_DENIED'
    }
  }
}

const BUILTIN_ACTIONS: readonly ContextActionDefinition[] = [
  {
    id: CONTEXT_ACTION_IDS.QuickReview,
    inputType: 'text',
    priority: 1000,
    icon: { type: 'class', value: 'i-ri-git-pull-request-line' },
    title: () => t('coreBox.contextActions.actions.quickReview.title'),
    description: () => t('coreBox.contextActions.actions.quickReview.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.intelligence'),
    capabilityIds: ['code.review'],
    execute: async (input) => {
      if (!isTextInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.textRequired'),
          recoverable: false
        }
      }
      return await executeIntelligence(
        'code.review',
        async () =>
          await tuffIntelligence.code.review(
            {
              code: input.content,
              focusAreas: ['bugs', 'security', 'best-practices']
            },
            { metadata: intelligenceMetadata(CONTEXT_ACTION_IDS.QuickReview, input) }
          ),
        formatReview,
        t('coreBox.contextActions.results.quickReview')
      )
    }
  },
  {
    id: CONTEXT_ACTION_IDS.Summarize,
    inputType: 'text',
    priority: 900,
    icon: { type: 'class', value: 'i-ri-file-list-3-line' },
    title: () => t('coreBox.contextActions.actions.summarize.title'),
    description: () => t('coreBox.contextActions.actions.summarize.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.intelligence'),
    capabilityIds: ['text.summarize'],
    execute: async (input) => {
      if (!isTextInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.textRequired'),
          recoverable: false
        }
      }
      return await executeIntelligence(
        'text.summarize',
        async () =>
          await tuffIntelligence.text.summarize(
            { text: input.content, style: 'bullet-points', maxLength: 600 },
            { metadata: intelligenceMetadata(CONTEXT_ACTION_IDS.Summarize, input) }
          ),
        String,
        t('coreBox.contextActions.results.summarize')
      )
    }
  },
  {
    id: CONTEXT_ACTION_IDS.Polish,
    inputType: 'text',
    priority: 860,
    icon: { type: 'class', value: 'i-ri-quill-pen-line' },
    title: () => t('coreBox.contextActions.actions.polish.title'),
    description: () => t('coreBox.contextActions.actions.polish.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.intelligence'),
    capabilityIds: ['text.rewrite'],
    execute: async (input) => {
      if (!isTextInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.textRequired'),
          recoverable: false
        }
      }
      return await executeIntelligence(
        'text.rewrite',
        async () =>
          await tuffIntelligence.text.rewrite(
            { text: input.content, style: 'professional', tone: 'neutral' },
            { metadata: intelligenceMetadata(CONTEXT_ACTION_IDS.Polish, input) }
          ),
        String,
        t('coreBox.contextActions.results.polish')
      )
    }
  },
  {
    id: CONTEXT_ACTION_IDS.Rewrite,
    inputType: 'text',
    priority: 840,
    icon: { type: 'class', value: 'i-ri-edit-2-line' },
    title: () => t('coreBox.contextActions.actions.rewrite.title'),
    description: () => t('coreBox.contextActions.actions.rewrite.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.intelligence'),
    capabilityIds: ['text.rewrite'],
    execute: async (input) => {
      if (!isTextInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.textRequired'),
          recoverable: false
        }
      }
      return await executeIntelligence(
        'text.rewrite',
        async () =>
          await tuffIntelligence.text.rewrite(
            { text: input.content, style: 'simplified', tone: 'friendly' },
            { metadata: intelligenceMetadata(CONTEXT_ACTION_IDS.Rewrite, input) }
          ),
        String,
        t('coreBox.contextActions.results.rewrite')
      )
    }
  },
  {
    id: CONTEXT_ACTION_IDS.WebSearch,
    inputType: 'text',
    priority: 720,
    icon: { type: 'class', value: 'i-ri-search-line' },
    title: () => t('coreBox.contextActions.actions.webSearch.title'),
    description: () => t('coreBox.contextActions.actions.webSearch.description'),
    sourceId: 'browser-open',
    sourceDisplayName: () => t('coreBox.contextActions.sources.browser'),
    capabilityIds: [],
    execute: async (input) => {
      if (!isTextInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.textRequired'),
          recoverable: false
        }
      }
      const url = `https://www.google.com/search?q=${encodeURIComponent(input.content)}`
      try {
        const decision = await openValidatedExternalUrl(url, { opener: shell.openExternal })
        if (!decision.allowed) {
          return {
            status: 'error',
            code: decision.reason,
            message: t('coreBox.contextActions.errors.browserBlocked'),
            recoverable: false
          }
        }
        return {
          status: 'success',
          message: t('coreBox.contextActions.results.webSearch'),
          output: { type: 'external', url: decision.url }
        }
      } catch (error) {
        return {
          status: 'error',
          code: 'BROWSER_OPEN_FAILED',
          message:
            error instanceof Error ? error.message : t('coreBox.contextActions.errors.browserOpen'),
          recoverable: true
        }
      }
    }
  },
  {
    id: CONTEXT_ACTION_IDS.Ocr,
    inputType: 'image',
    priority: 1000,
    icon: { type: 'class', value: 'i-ri-text-recognition' },
    title: () => t('coreBox.contextActions.actions.ocr.title'),
    description: () => t('coreBox.contextActions.actions.ocr.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.ocr'),
    capabilityIds: ['vision.ocr'],
    execute: async (input) => {
      if (!isImageInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.imageRequired'),
          recoverable: false
        }
      }
      return await executeIntelligence(
        'vision.ocr',
        async () =>
          await tuffIntelligence.vision.ocr(
            {
              source: { type: 'base64', base64: trimDataUrlPrefix(input.content) },
              includeKeywords: true,
              includeLayout: true
            },
            { metadata: intelligenceMetadata(CONTEXT_ACTION_IDS.Ocr, input) }
          ),
        (result) => result.text,
        t('coreBox.contextActions.results.ocr')
      )
    }
  },
  {
    id: CONTEXT_ACTION_IDS.TranslateImageText,
    inputType: 'image',
    priority: 940,
    icon: { type: 'class', value: 'i-ri-translate' },
    title: () => t('coreBox.contextActions.actions.translateImageText.title'),
    description: () => t('coreBox.contextActions.actions.translateImageText.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.intelligence'),
    capabilityIds: ['vision.ocr', 'text.translate'],
    execute: async (input) => {
      if (!isImageInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.imageRequired'),
          recoverable: false
        }
      }
      try {
        const metadata = intelligenceMetadata(CONTEXT_ACTION_IDS.TranslateImageText, input)
        const ocr = await tuffIntelligence.vision.ocr(
          {
            source: { type: 'base64', base64: trimDataUrlPrefix(input.content) },
            includeLayout: false
          },
          { metadata }
        )
        const sourceText = ocr.result.text.trim()
        if (!sourceText) {
          return {
            status: 'error',
            code: 'OCR_EMPTY',
            message: t('coreBox.contextActions.errors.ocrEmpty'),
            recoverable: true
          }
        }
        const translated = await tuffIntelligence.text.translate(
          { text: sourceText, sourceLang: 'auto', targetLang: 'zh' },
          { metadata }
        )
        return successText(
          t('coreBox.contextActions.results.translateImageText'),
          translated.result
        )
      } catch (error) {
        const normalized = normalizeIntelligenceError(error, {
          capabilityId: 'vision.ocr + text.translate'
        })
        return {
          status: 'error',
          code: normalized.code,
          message: `${normalized.reason} ${normalized.recovery}`,
          recoverable: normalized.code !== 'PERMISSION_DENIED'
        }
      }
    }
  },
  {
    id: CONTEXT_ACTION_IDS.ExplainImage,
    inputType: 'image',
    priority: 900,
    icon: { type: 'class', value: 'i-ri-image-ai-line' },
    title: () => t('coreBox.contextActions.actions.explainImage.title'),
    description: () => t('coreBox.contextActions.actions.explainImage.description'),
    sourceId: 'tuff-intelligence',
    sourceDisplayName: () => t('coreBox.contextActions.sources.intelligence'),
    capabilityIds: ['image.caption'],
    execute: async (input) => {
      if (!isImageInput(input)) {
        return {
          status: 'error',
          code: 'INVALID_INPUT',
          message: t('coreBox.contextActions.errors.imageRequired'),
          recoverable: false
        }
      }
      return await executeIntelligence(
        'image.caption',
        async () =>
          await tuffIntelligence.vision.caption(
            {
              source: { type: 'base64', base64: trimDataUrlPrefix(input.content) },
              style: 'detailed',
              language: 'zh-CN'
            },
            { metadata: intelligenceMetadata(CONTEXT_ACTION_IDS.ExplainImage, input) }
          ),
        (result) => result.caption,
        t('coreBox.contextActions.results.explainImage')
      )
    }
  }
] as const

const BUILTIN_ACTION_ID_SET: ReadonlySet<string> = new Set(
  BUILTIN_ACTIONS.map((action) => action.id)
)

function isContextActionId(value: unknown): value is ContextActionId {
  return typeof value === 'string' && BUILTIN_ACTION_ID_SET.has(value)
}

function getContextActionMeta(item: TuffItem): ContextActionItemMeta | null {
  const meta = item.meta?.extension?.contextAction
  if (!meta || typeof meta !== 'object') return null
  const actionId = (meta as { actionId?: unknown }).actionId
  const sessionId = (meta as { sessionId?: unknown }).sessionId
  if (!isContextActionId(actionId) || typeof sessionId !== 'string' || !sessionId) return null
  return { actionId, sessionId }
}

function getContextActionResultMeta(item: TuffItem): ContextActionResultItemMeta | null {
  const meta = item.meta?.extension?.contextActionResult
  if (!meta || typeof meta !== 'object') return null
  const resultSessionId = (meta as { resultSessionId?: unknown }).resultSessionId
  return typeof resultSessionId === 'string' && resultSessionId ? { resultSessionId } : null
}

class BuiltinContextActionProvider implements ContextActionProvider<ContextActionId> {
  readonly id = 'builtin-context-actions'
  readonly displayName = 'Core Context Actions'
  readonly acceptedInputTypes: ContextActionInput['type'][] = ['text', 'image']

  async match(input: ContextActionInput): Promise<ContextActionMatch<ContextActionId>[]> {
    return BUILTIN_ACTIONS.filter((action) => action.inputType === input.type).map((action) => {
      const unavailableCapability = action.capabilityIds.find(
        (capabilityId) => !resolveCapabilityStatus(capabilityId).available
      )
      const unavailableReason = unavailableCapability
        ? {
            code: 'capability-unavailable' as const,
            message: t('coreBox.contextActions.unavailable.capability', {
              capability: unavailableCapability
            }),
            recoverable: true
          }
        : undefined

      return {
        actionId: action.id,
        providerId: this.id,
        providerDisplayName: this.displayName,
        acceptedInputType: action.inputType,
        title: action.title(),
        description: action.description(),
        icon: action.icon,
        priority: action.priority,
        source: {
          type: 'builtin',
          id: action.sourceId,
          displayName: action.sourceDisplayName()
        },
        available: !unavailableReason,
        unavailableReason
      }
    })
  }

  async execute(
    actionId: ContextActionId,
    input: ContextActionInput
  ): Promise<ContextActionResult> {
    const action = BUILTIN_ACTIONS.find((candidate) => candidate.id === actionId)
    if (!action || action.inputType !== input.type) {
      return {
        status: 'error',
        code: 'ACTION_INPUT_MISMATCH',
        message: t('coreBox.contextActions.errors.actionInputMismatch'),
        recoverable: false
      }
    }
    return await action.execute(input)
  }
}

export class ContextActionsProvider implements ISearchProvider<ProviderContext> {
  readonly id = CONTEXT_ACTIONS_PROVIDER_ID
  readonly type = 'system' as const
  readonly name = 'Context Actions'
  readonly icon = { type: 'class' as const, value: 'i-ri-magic-line' }
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Image]
  readonly priority = 'fast' as const
  readonly expectedDuration = 40

  private readonly builtinProvider = new BuiltinContextActionProvider()
  private readonly executionStates = new Map<string, ContextActionExecutionState>()

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startedAt = performance.now()
    const input = getContextActionInput(query)
    if (!input || !isContextActionQuery(query) || signal.aborted) {
      return this.createResult(query, startedAt, [])
    }

    const sessionId = query.context.contextAction.sessionId
    if (!input.available) {
      return this.createResult(query, startedAt, [this.buildContextItem(sessionId, input)])
    }

    const matches = await this.builtinProvider.match(input)
    const pluginItems = await this.buildPluginItems(query, input, signal)
    const items = [
      this.buildContextItem(sessionId, input),
      ...this.buildExecutionResultItems(sessionId),
      ...matches.map((match) => this.buildActionItem(sessionId, match)),
      ...pluginItems
    ]

    return this.createResult(query, startedAt, items)
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const resultMeta = getContextActionResultMeta(args.item)
    if ((!args.actionId || args.actionId === 'copy-result') && resultMeta) {
      const state = this.executionStates.get(resultMeta.resultSessionId)
      if (state?.result.status === 'success' && state.result.output?.type === 'text') {
        clipboard.writeText(state.result.output.text)
      }
      return null
    }

    const meta = getContextActionMeta(args.item)
    const query = args.searchResult?.query
    const input = query ? getContextActionInput(query) : null
    if (!meta || !input || !query || !isContextActionQuery(query)) {
      return null
    }

    const match = (await this.builtinProvider.match(input)).find(
      (candidate) => candidate.actionId === meta.actionId
    )
    const result =
      match?.available === true
        ? await this.builtinProvider.execute(meta.actionId, input)
        : {
            status: 'error' as const,
            code: match?.unavailableReason?.code ?? 'ACTION_UNAVAILABLE',
            message:
              match?.unavailableReason?.message ??
              t('coreBox.contextActions.errors.actionUnavailable'),
            recoverable: match?.unavailableReason?.recoverable ?? true
          }

    this.executionStates.set(meta.sessionId, {
      actionId: meta.actionId,
      completedAt: Date.now(),
      result
    })
    this.trimExecutionStates()

    return null
  }

  private async buildPluginItems(
    query: TuffQuery,
    input: ContextActionInput,
    signal: AbortSignal
  ): Promise<TuffItem[]> {
    const routes = PLUGIN_ROUTES.filter((route) => route.inputType === input.type)
    if (routes.length === 0 || !pluginModule.pluginManager) return []

    const pluginResult = await PluginFeaturesAdapter.onSearch(query, signal)
    const matchedItems = new Map<string, TuffItem>()
    for (const item of pluginResult.items ?? []) {
      const pluginName = item.meta?.pluginName
      const featureId = item.meta?.featureId
      if (pluginName && featureId) {
        matchedItems.set(`${pluginName}/${featureId}`, item)
      }
    }

    return routes.map((route) => {
      const key = `${route.pluginName}/${route.featureId}`
      const item = matchedItems.get(key)
      if (!item) {
        return this.buildUnavailablePluginItem(route)
      }

      return {
        ...item,
        render: {
          ...item.render,
          basic: {
            ...item.render.basic,
            title: route.title(),
            subtitle: t('coreBox.contextActions.sourceDetail', {
              source: route.pluginName,
              detail: route.description()
            }),
            icon: route.icon
          }
        },
        meta: {
          ...item.meta,
          priority: route.priority,
          keepCoreBoxOpen: true
        }
      }
    })
  }

  private buildContextItem(sessionId: string, input: ContextActionInput): TuffItem {
    const preview =
      input.type === 'text'
        ? input.content.replace(/\s+/g, ' ').trim().slice(0, 140)
        : t('coreBox.contextActions.context.imagePreview')
    const issue = input.diagnostic?.issueMessage
    const subtitle = issue
      ? t('coreBox.contextActions.context.withIssue', { preview, issue })
      : preview

    return {
      id: `${this.id}:${sessionId}:context`,
      source: { type: this.type, id: this.id, name: t('coreBox.contextActions.title') },
      kind: input.type === 'image' ? 'image' : 'text',
      render: {
        mode: 'default',
        basic: {
          title: !input.available
            ? t('coreBox.contextActions.context.unavailable')
            : input.type === 'text'
              ? t('coreBox.contextActions.context.selectedText')
              : t('coreBox.contextActions.context.clipboardImage'),
          subtitle,
          icon: {
            type: 'class',
            value: input.type === 'text' ? 'i-ri-text' : 'i-ri-image-line'
          }
        }
      },
      meta: {
        priority: 2000,
        keepCoreBoxOpen: true,
        extension: {
          contextActionSummary: {
            sessionId,
            inputType: input.type,
            source: input.source,
            capturedAt: input.capturedAt,
            supportLevel: input.diagnostic?.supportLevel,
            issueCode: input.diagnostic?.issueCode
          }
        }
      }
    }
  }

  private buildActionItem(sessionId: string, match: ContextActionMatch<ContextActionId>): TuffItem {
    const subtitle = match.available
      ? t('coreBox.contextActions.sourceDetail', {
          source: match.source.displayName,
          detail: match.description
        })
      : t('coreBox.contextActions.unavailable.detail', {
          reason:
            match.unavailableReason?.message ?? t('coreBox.contextActions.unavailable.unknown')
        })

    return {
      id: `${this.id}:${sessionId}:${match.actionId}`,
      source: { type: this.type, id: this.id, name: match.providerDisplayName },
      kind: 'command',
      render: {
        mode: 'default',
        basic: {
          title: match.title,
          subtitle,
          icon: match.icon
        }
      },
      actions: match.available
        ? [
            {
              id: match.actionId,
              type: 'execute',
              label: t('coreBox.hints.execute'),
              primary: true
            }
          ]
        : [],
      meta: {
        priority: match.priority,
        keepCoreBoxOpen: true,
        extension: {
          contextAction: {
            actionId: match.actionId,
            sessionId
          },
          unavailableReason: match.unavailableReason
        }
      }
    }
  }

  private buildUnavailablePluginItem(route: PluginContextActionRoute): TuffItem {
    return {
      id: `${this.id}:plugin-unavailable:${route.pluginName}:${route.featureId}`,
      source: { type: this.type, id: this.id, name: t('coreBox.contextActions.title') },
      kind: 'command',
      render: {
        mode: 'default',
        basic: {
          title: route.title(),
          subtitle: t('coreBox.contextActions.unavailable.plugin', { plugin: route.pluginName }),
          icon: route.icon
        }
      },
      actions: [],
      meta: {
        priority: route.priority,
        keepCoreBoxOpen: true,
        extension: {
          unavailableReason: {
            code: 'plugin-unavailable',
            message: t('coreBox.contextActions.unavailable.plugin', { plugin: route.pluginName }),
            recoverable: true
          }
        }
      }
    }
  }

  private buildExecutionResultItems(sessionId: string): TuffItem[] {
    const state = this.executionStates.get(sessionId)
    if (!state) return []
    const definition = BUILTIN_ACTIONS.find((action) => action.id === state.actionId)
    const title =
      state.result.status === 'success'
        ? t('coreBox.contextActions.status.success', {
            action: definition?.title() ?? state.actionId
          })
        : t('coreBox.contextActions.status.error', {
            action: definition?.title() ?? state.actionId
          })
    const outputText =
      state.result.status === 'success' && state.result.output?.type === 'text'
        ? state.result.output.text
        : ''
    const subtitle =
      state.result.status === 'success'
        ? outputText.replace(/\s+/g, ' ').trim().slice(0, TEXT_OUTPUT_PREVIEW_LENGTH) ||
          state.result.message
        : state.result.message

    return [
      {
        id: `${this.id}:${sessionId}:result`,
        source: { type: this.type, id: this.id, name: t('coreBox.contextActions.title') },
        kind: 'text',
        render: {
          mode: 'default',
          basic: {
            title,
            subtitle,
            icon: {
              type: 'class',
              value:
                state.result.status === 'success'
                  ? 'i-ri-checkbox-circle-line'
                  : 'i-ri-error-warning-line'
            }
          }
        },
        actions: outputText
          ? [
              {
                id: 'copy-result',
                type: 'execute',
                label: t('coreBox.contextActions.status.copyResult'),
                primary: true
              }
            ]
          : [],
        meta: {
          priority: 1900,
          keepCoreBoxOpen: true,
          extension: {
            contextActionResult: { resultSessionId: sessionId },
            status: state.result.status,
            completedAt: state.completedAt
          }
        }
      }
    ]
  }

  private createResult(query: TuffQuery, startedAt: number, items: TuffItem[]): TuffSearchResult {
    return new TuffSearchResultBuilder(query)
      .setItems(items)
      .setDuration(performance.now() - startedAt)
      .build()
  }

  private trimExecutionStates(): void {
    while (this.executionStates.size > MAX_EXECUTION_STATES) {
      const oldestKey = this.executionStates.keys().next().value
      if (typeof oldestKey !== 'string') return
      this.executionStates.delete(oldestKey)
    }
  }
}

export const contextActionsProvider = new ContextActionsProvider()

export const __test__ = {
  BUILTIN_ACTIONS,
  PLUGIN_ROUTES,
  BuiltinContextActionProvider,
  formatReview,
  getContextActionMeta,
  getContextActionResultMeta
}
