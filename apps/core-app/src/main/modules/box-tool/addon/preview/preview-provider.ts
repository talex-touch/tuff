import type {
  IExecuteArgs,
  ISearchProvider,
  PreviewAbilityResult,
  PreviewCardPayload,
  PreviewSdk,
  TuffItem
} from '@talex-touch/utils'
import type { ProviderContext, TuffQuery, TuffSearchResult } from '../../search-engine/types'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import { clipboard } from 'electron'
import { clipboardModule } from '../../../clipboard'
import { createLogger } from '../../../../utils/logger'

const PREVIEW_COMPONENT_NAME = DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD
const SOURCE_ID = 'preview-provider'
const previewLog = createLogger('PreviewProvider')

interface PreparedPreviewQuery {
  originalQuery: TuffQuery
  sdkQuery: TuffQuery
  explicitCommand?: string
}

function extractExplicitCalculatorQuery(query: TuffQuery): PreparedPreviewQuery {
  const originalText = query.text?.trim() ?? ''
  const match = /^(calc(?:ulator)?|calculate|计算|换算)(?:\s*(?::|：)\s*|\s+)(.+)$/i.exec(
    originalText
  )
  if (!match) {
    return {
      originalQuery: query,
      sdkQuery: query
    }
  }

  return {
    originalQuery: query,
    sdkQuery: {
      ...query,
      text: match[2].trim()
    },
    explicitCommand: match[1].toLowerCase()
  }
}

export class PreviewProvider implements ISearchProvider<ProviderContext> {
  readonly id = SOURCE_ID
  readonly type = 'system' as const
  readonly name = '即时预览'
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const
  readonly expectedDuration = 200

  constructor(private readonly sdk: PreviewSdk) {}

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startedAt = performance.now()
    const preparedQuery = extractExplicitCalculatorQuery(query)
    const normalized = preparedQuery.sdkQuery.text?.trim() ?? ''
    if (!normalized) {
      return this.createEmptyResult(query, startedAt)
    }

    const result = await this.sdk.resolve({ query: preparedQuery.sdkQuery, signal })
    if (!result) {
      return this.createEmptyResult(query, startedAt)
    }

    const item = this.buildPreviewItem(preparedQuery, result)
    const duration = performance.now() - startedAt

    return new TuffSearchResultBuilder(query)
      .setItems([item])
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 1,
          status: 'success'
        }
      ])
      .build()
  }

  onActivate(): void {
    // Preview provider has no activation mode
  }

  onDeactivate(): void {
    // Preview provider does not keep activation state.
  }

  async onExecute({ item, searchResult }: IExecuteArgs): Promise<null> {
    const payload = this.extractPayload(item)
    if (payload?.primaryValue) {
      clipboard.writeText(payload.primaryValue)
      try {
        await this.recordHistory(payload, searchResult?.query ?? { text: '', inputs: [] })
      } catch (error) {
        previewLog.error('Failed to record history', { error })
      }
    }
    return null
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: 0,
          status: 'success'
        }
      ])
      .build()
  }

  private buildPreviewItem(query: PreparedPreviewQuery, abilityResult: PreviewAbilityResult) {
    const hash = crypto.createHash('sha1')
    hash.update(`${abilityResult.abilityId}:${query.originalQuery.text ?? ''}`)
    const id = `${this.id}:${hash.digest('hex')}`
    const previewMeta: NonNullable<NonNullable<TuffItem['meta']>['preview']> = {
      abilityId: abilityResult.abilityId,
      confidence: abilityResult.confidence
    }

    if (query.explicitCommand) {
      previewMeta.expression = query.sdkQuery.text
    }

    const payload: PreviewCardPayload = query.explicitCommand
      ? {
          ...abilityResult.payload,
          badges: ['Calculator', ...(abilityResult.payload.badges ?? [])],
          meta: {
            ...abilityResult.payload.meta,
            explicitCommand: query.explicitCommand,
            rawQuery: query.originalQuery.text ?? '',
            resolvedQuery: query.sdkQuery.text ?? ''
          }
        }
      : abilityResult.payload

    const builder = new TuffItemBuilder(id)
      .setSource(this.type, this.id)
      .setKind('preview')
      .setCustomRender('vue', PREVIEW_COMPONENT_NAME, {
        ...payload,
        confidence: abilityResult.confidence
      })
      .setMeta({
        preview: previewMeta
      })
      .setClassName('core-preview-card')
      .setFinalScore(1)

    if (payload.title) {
      builder.setTitle(payload.title)
    }

    return builder.build()
  }

  private extractPayload(item: TuffItem): PreviewCardPayload | undefined {
    if (item.render?.mode !== 'custom') return undefined
    const custom = item.render.custom
    if (custom?.type !== 'vue') return undefined
    return custom.data as PreviewCardPayload | undefined
  }

  private async recordHistory(payload: PreviewCardPayload, query: TuffQuery): Promise<void> {
    if (!payload?.primaryValue) return
    previewLog.debug('Saving preview history', {
      meta: {
        expressionLength: query.text?.length ?? 0,
        valueLength: payload.primaryValue.length,
        abilityId: payload.abilityId
      }
    })
    const result = await clipboardModule.saveCustomEntry({
      content: payload.primaryValue,
      rawContent: query.text ?? '',
      category: 'preview',
      meta: {
        expression: query.text ?? '',
        abilityId: payload.abilityId,
        payload
      }
    })
    if (result?.id) {
      previewLog.debug('Preview history saved', {
        meta: {
          entryId: result.id
        }
      })
    } else {
      previewLog.warn('Preview history save returned null')
    }
  }
}
