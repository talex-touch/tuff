import type {
  IExecuteArgs,
  ISearchProvider,
  PreviewAbilityResult,
  PreviewCardPayload,
  TuffItem,
} from '@talex-touch/utils'
import type { ProviderContext, TuffQuery, TuffSearchResult } from '../../search-engine/types'
import type { PreviewAbilityRegistry } from './preview-registry'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import { clipboard } from 'electron'
import { clipboardModule } from '../../../clipboard'

const PREVIEW_COMPONENT_NAME = DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD
const SOURCE_ID = 'preview-provider'

export class PreviewProvider implements ISearchProvider<ProviderContext> {
  readonly id = SOURCE_ID
  readonly type = 'system' as const
  readonly name = '即时预览'
  readonly supportedInputTypes = [TuffInputType.Text]

  constructor(private readonly registry: PreviewAbilityRegistry) {}

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startedAt = performance.now()
    const normalized = query.text?.trim() ?? ''
    if (!normalized) {
      return this.createEmptyResult(query, startedAt)
    }

    const result = await this.registry.resolve({ query, signal })
    if (!result) {
      return this.createEmptyResult(query, startedAt)
    }

    const item = this.buildPreviewItem(query, result)
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
          status: 'success',
        },
      ])
      .build()
  }

  onActivate(): void {
    // Preview provider has no activation mode
  }

  onDeactivate(): void {
    // no-op
  }

  async onExecute({ item, searchResult }: IExecuteArgs): Promise<null> {
    const payload = this.extractPayload(item)
    if (payload?.primaryValue) {
      clipboard.writeText(payload.primaryValue)
      // Record to history only when user explicitly executes (presses Enter)
      void this.recordHistory(payload, searchResult?.query ?? { text: '', inputs: [] })
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
          status: 'success',
        },
      ])
      .build()
  }

  private buildPreviewItem(query: TuffQuery, abilityResult: PreviewAbilityResult) {
    const hash = crypto.createHash('sha1')
    hash.update(`${abilityResult.abilityId}:${query.text ?? ''}`)
    const id = `${this.id}:${hash.digest('hex')}`

    const builder = new TuffItemBuilder(id)
      .setSource(this.type, this.id)
      .setKind('preview')
      .setCustomRender('vue', PREVIEW_COMPONENT_NAME, {
        ...abilityResult.payload,
        confidence: abilityResult.confidence,
      })
      .setMeta({
        preview: {
          abilityId: abilityResult.abilityId,
          confidence: abilityResult.confidence,
        },
      })
      .setClassName('core-preview-card')
      .setFinalScore(1)

    if (abilityResult.payload.title) {
      builder.setTitle(abilityResult.payload.title)
    }

    return builder.build()
  }

  private extractPayload(item: TuffItem): PreviewCardPayload | undefined {
    if (item.render?.mode !== 'custom')
      return undefined
    const custom = item.render.custom
    if (custom?.type !== 'vue')
      return undefined
    return custom.data as PreviewCardPayload | undefined
  }

  private async recordHistory(payload: PreviewCardPayload, query: TuffQuery): Promise<void> {
    if (!payload?.primaryValue)
      return
    await clipboardModule.saveCustomEntry({
      content: payload.primaryValue,
      rawContent: query.text ?? '',
      category: 'preview',
      meta: {
        expression: query.text ?? '',
        abilityId: payload.abilityId,
        payload,
      },
    })
  }
}
