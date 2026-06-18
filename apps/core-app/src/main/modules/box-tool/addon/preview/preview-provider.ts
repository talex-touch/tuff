import type {
  IExecuteArgs,
  ISearchProvider,
  PreviewAbilityResult,
  PreviewCardPayload,
  PreviewSdk,
  TuffAction,
  TuffItem
} from '@talex-touch/utils'
import type { ProviderContext, TuffQuery, TuffSearchResult } from '../../search-engine/types'
import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { hasQuickOpsDeveloperCommand } from '@talex-touch/utils/core-box/preview'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import { app, clipboard } from 'electron'
import { clipboardModule } from '../../../clipboard'
import { createLogger } from '../../../../utils/logger'

const PREVIEW_COMPONENT_NAME = DEFAULT_WIDGET_RENDERERS.CORE_PREVIEW_CARD
const SOURCE_ID = 'preview-provider'
const PREVIEW_COPY_PRIMARY_ACTION_ID = 'preview-copy-primary'
const PREVIEW_SAVE_QR_SVG_ACTION_ID = 'preview-save-qr-svg'
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
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Html]
  readonly priority = 'fast' as const
  readonly expectedDuration = 200

  constructor(private readonly sdk: PreviewSdk) {}

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startedAt = performance.now()
    const preparedQuery = extractExplicitCalculatorQuery(query)
    const sdkQuery = this.withQuickOpsClipboardInput(preparedQuery.sdkQuery)
    const normalized = preparedQuery.sdkQuery.text?.trim() ?? ''
    if (!normalized) {
      return this.createEmptyResult(query, startedAt)
    }

    const result = await this.sdk.resolve({ query: sdkQuery, signal })
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

  async onExecute({ item, searchResult, actionId }: IExecuteArgs): Promise<null> {
    const payload = this.extractPayload(item)
    if (actionId === PREVIEW_SAVE_QR_SVG_ACTION_ID) {
      await this.saveQrSvg(payload, searchResult?.query ?? { text: '', inputs: [] })
      return null
    }

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

    if (payload.primaryValue) {
      const actions: TuffAction[] = [
        {
          id: PREVIEW_COPY_PRIMARY_ACTION_ID,
          type: 'copy',
          label: '复制结果',
          icon: { type: 'class', value: 'i-ri-file-copy-line' },
          payload: { text: payload.primaryValue }
        }
      ]

      if (isQrSvgPayload(payload)) {
        actions.push({
          id: PREVIEW_SAVE_QR_SVG_ACTION_ID,
          type: 'execute',
          label: '保存 SVG 到临时目录',
          icon: { type: 'class', value: 'i-ri-save-line' }
        })
      }

      builder.setActions(actions)
    }

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

  private async saveQrSvg(
    payload: PreviewCardPayload | undefined,
    query: TuffQuery
  ): Promise<void> {
    if (!isQrSvgPayload(payload)) return

    const svg = extractQrSvg(payload)
    if (!svg) return

    const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
    await mkdir(outputDir, { recursive: true })
    const filePath = path.join(outputDir, `qr-code-${crypto.randomUUID()}.svg`)
    await writeFile(filePath, svg, { flag: 'wx' })
    clipboard.writeText(filePath)

    try {
      await this.recordHistory(
        {
          ...payload,
          primaryValue: filePath,
          primaryLabel: 'SVG 文件路径'
        },
        query
      )
    } catch (error) {
      previewLog.error('Failed to record QR SVG save history', { error })
    }
  }

  private withQuickOpsClipboardInput(query: TuffQuery): TuffQuery {
    if (!hasQuickOpsDeveloperCommand(query)) return query
    if (query.inputs?.some((input) => input.content?.trim() || input.rawContent?.trim())) {
      return query
    }

    const text = clipboard.readText().trim()
    if (!text) return query

    return {
      ...query,
      inputs: [
        ...(query.inputs ?? []),
        {
          type: TuffInputType.Text,
          content: text
        }
      ]
    }
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

function isQrSvgPayload(payload: PreviewCardPayload | undefined): payload is PreviewCardPayload {
  return payload?.meta?.quickOps?.render?.kind === 'qr-code-svg'
}

function extractQrSvg(payload: PreviewCardPayload): string | null {
  const render = payload.meta?.quickOps?.render
  const dataUrl = typeof render?.dataUrl === 'string' ? render.dataUrl : payload.primaryValue
  const prefix = 'data:image/svg+xml;charset=utf-8,'
  if (!dataUrl.startsWith(prefix)) return null

  try {
    const svg = decodeURIComponent(dataUrl.slice(prefix.length))
    return svg.startsWith('<svg ') ? svg : null
  } catch {
    return null
  }
}
