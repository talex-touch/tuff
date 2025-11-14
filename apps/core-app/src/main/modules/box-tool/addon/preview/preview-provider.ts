import { TuffFactory, TuffItemBuilder, TuffInputType } from '@talex-touch/utils'
import type { PreviewAbilityResult } from '@talex-touch/utils'
import type { ProviderContext, TuffQuery, TuffSearchResult } from '../../search-engine/types'
import type { ISearchProvider } from '@talex-touch/utils'
import crypto from 'node:crypto'
import { PreviewAbilityRegistry } from './preview-registry'
import { performance } from 'perf_hooks'

const PREVIEW_COMPONENT_NAME = 'core-preview-card'
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

    return TuffFactory.createSearchResult(query)
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
    // no-op
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    const duration = performance.now() - startedAt
    return TuffFactory.createSearchResult(query)
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

  private buildPreviewItem(query: TuffQuery, abilityResult: PreviewAbilityResult) {
    const hash = crypto.createHash('sha1')
    hash.update(`${abilityResult.abilityId}:${query.text ?? ''}`)
    const id = `${this.id}:${hash.digest('hex')}`

    const builder = new TuffItemBuilder(id)
      .setSource(this.type, this.id)
      .setKind('preview')
      .setCustomRender('vue', PREVIEW_COMPONENT_NAME, {
        ...abilityResult.payload,
        confidence: abilityResult.confidence
      })
      .setMeta({
        preview: {
          abilityId: abilityResult.abilityId,
          confidence: abilityResult.confidence
        }
      })
      .setClassName('core-preview-card')
      .setFinalScore(1)

    if (abilityResult.payload.title) {
      builder.setTitle(abilityResult.payload.title)
    }

    return builder.build()
  }
}
