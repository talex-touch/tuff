import {
  AiChatPayload,
  AiUsageInfo,
  IExecuteArgs,
  ISearchProvider,
  TuffFactory,
  TuffInputType,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import crypto from 'node:crypto'
import { ensureAiConfigLoaded } from '../../../ai/ai-config'
import { ai } from '../../../ai/ai-sdk'
import { coreBoxManager } from '../../core-box/manager'
import { windowManager } from '../../core-box/window'
import { ProviderContext } from '../types'
import { genTouchApp } from '../../../core'

const AI_SYSTEM_PROMPT =
  '你是 Talex Touch 桌面助手中的智能助理，以简洁、可靠的方式回答用户问题。如有需要，可提供结构化的列表或步骤。'

const AI_PREFIX_PATTERNS = [
  /^ai[\s:：，。?？]+(.*)$/i,
  /^\/ai[\s:：，。?？]+(.*)$/i,
  /^@ai[\s:：，。?？]+(.*)$/i
]

type IntelligenceItemStatus = 'pending' | 'ready' | 'error'

interface IntelligencePayload {
  requestId: string
  prompt: string
  status: IntelligenceItemStatus
  answer?: string
  model?: string
  usage?: AiUsageInfo
  error?: string
  createdAt: number
}

export class IntelligenceSearchProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'intelligence-provider'
  readonly name = 'Intelligence'
  readonly type = 'system' as const
  readonly supportedInputTypes = [
    TuffInputType.Text,
    TuffInputType.Image,
    TuffInputType.Files,
    TuffInputType.Html
  ]

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    const normalized = query.text?.trim() ?? ''
    const parsedPrompt = this.extractPrompt(normalized)

    if (!parsedPrompt) {
      return TuffFactory.createSearchResult(query).build()
    }

    const items: TuffItem[] = []

    if (parsedPrompt.prompt.length === 0) {
      items.push(this.createPlaceholderItem())
    } else {
      items.push(this.createActionItem(parsedPrompt.prompt))
    }

    return TuffFactory.createSearchResult(query).setItems(items).build()
  }

  async onExecute({ item }: IExecuteArgs): Promise<null> {
    const meta = item.meta?.intelligence as
      | (Partial<IntelligencePayload> & { keepCoreBoxOpen?: boolean; placeholder?: boolean })
      | undefined

    if (!meta) {
      return null
    }

    if (meta.placeholder) {
      this.focusInputWithPrefix()
      return null
    }

    const prompt = meta.prompt.trim()
    if (!prompt) {
      this.focusInputWithPrefix()
      return null
    }

    const requestId = crypto.randomUUID()
    const pendingPayload: IntelligencePayload = {
      requestId,
      prompt,
      status: 'pending',
      createdAt: Date.now()
    }

    this.emitResultItem(this.createResultItem(pendingPayload))

    try {
      ensureAiConfigLoaded()
      const payload: AiChatPayload = {
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      }

      const result = await ai.text.chat(payload)
      const answerPayload: IntelligencePayload = {
        requestId,
        prompt,
        status: 'ready',
        answer: result?.result?.trim() ?? '',
        model: result?.model,
        usage: result?.usage,
        createdAt: Date.now()
      }

      this.emitResultItem(this.createResultItem(answerPayload))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorPayload: IntelligencePayload = {
        requestId,
        prompt,
        status: 'error',
        error: message,
        createdAt: Date.now()
      }

      this.emitResultItem(this.createResultItem(errorPayload))
    }

    return null
  }

  private extractPrompt(value: string): { prompt: string } | null {
    if (!value) {
      return null
    }

    for (const pattern of AI_PREFIX_PATTERNS) {
      const match = value.match(pattern)
      if (match) {
        return {
          prompt: (match[1] ?? '').trim()
        }
      }
    }

    if (value.toLowerCase() === 'ai' || value.toLowerCase() === '/ai' || value.toLowerCase() === '@ai') {
      return { prompt: '' }
    }

    return null
  }

  private createActionItem(prompt: string): TuffItem {
    const builder = new TuffItemBuilder(`intelligence-query:${crypto.randomUUID()}`)
      .setSource(this.type, this.id, this.name)
      .setKind('command')
      .setIcon({ type: 'emoji', value: '🤖', status: 'normal' })
      .setTitle(prompt)
      .setSubtitle('Press Enter to ask Talex AI')
      .setMeta({
        intelligence: {
          prompt,
          keepCoreBoxOpen: true
        },
        keepCoreBoxOpen: true
      })

    return builder.build()
  }

  private createPlaceholderItem(): TuffItem {
    const builder = new TuffItemBuilder(`intelligence-placeholder:${crypto.randomUUID()}`)
      .setSource(this.type, this.id, this.name)
      .setKind('command')
      .setIcon({ type: 'emoji', value: '🤖', status: 'normal' })
      .setTitle('Ask Talex AI for help')
      .setSubtitle('Type your question and press Enter to send it to the AI')
      .setMeta({
        intelligence: {
          prompt: '',
          placeholder: true,
          keepCoreBoxOpen: true
        },
        keepCoreBoxOpen: true
      })

    return builder.build()
  }

  private createResultItem(payload: IntelligencePayload): TuffItem {
    const builder = new TuffItemBuilder(`intelligence-result:${payload.requestId}`)
      .setSource(this.type, this.id, this.name)
      .setKind('command')
      .setIcon({ type: 'emoji', value: '🤖', status: 'normal' })
      .setTitle(payload.prompt || 'Talex AI')
      .setSubtitle(this.resolveStatusText(payload.status))
      .setCustomRender('vue', 'core-intelligence-answer', payload as Record<string, unknown>)
      .setMeta({
        intelligence: {
          ...payload,
          keepCoreBoxOpen: true
        },
        keepCoreBoxOpen: true
      })

    return builder.build()
  }

  private resolveStatusText(status: IntelligenceItemStatus): string {
    switch (status) {
      case 'pending':
        return 'AI 正在思考…'
      case 'ready':
        return 'AI 回答已就绪'
      case 'error':
        return 'AI 回答失败'
      default:
        return 'AI 状态未知'
    }
  }

  private emitResultItem(item: TuffItem): void {
    const app = genTouchApp()
    const coreWindow = windowManager.current?.window
    if (!coreWindow || coreWindow.isDestroyed()) {
      return
    }

    void app.channel.sendTo(coreWindow, ChannelType.MAIN, 'core-box:intelligence:upsert-item', {
      item
    })

    coreBoxManager.expand({ forceMax: true })
  }

  private focusInputWithPrefix(): void {
    const app = genTouchApp()
    const coreWindow = windowManager.current?.window
    if (!coreWindow || coreWindow.isDestroyed()) {
      return
    }

    void app.channel.sendTo(coreWindow, ChannelType.MAIN, 'core-box:set-query', {
      value: 'ai '
    })
  }
}

const intelligenceSearchProvider = new IntelligenceSearchProvider()

export { intelligenceSearchProvider }

export default intelligenceSearchProvider
