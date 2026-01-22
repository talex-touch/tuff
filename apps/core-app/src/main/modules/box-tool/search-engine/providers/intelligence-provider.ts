import type {
  AiUsageInfo,
  IExecuteArgs,
  IntelligenceChatPayload,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ProviderContext } from '../types'
import type { IClipboardItem } from '../../../clipboard'
import crypto from 'node:crypto'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { genTouchApp } from '../../../../core/'
import { ensureAiConfigLoaded } from '../../../ai/intelligence-config'
import { ai } from '../../../ai/intelligence-sdk'
import { clipboardModule } from '../../../clipboard'
import { coreBoxManager } from '../../core-box/manager'
import { windowManager } from '../../core-box/window'
import { getBoxItemManager } from '../../item-sdk'
import searchEngineCore from '../search-core'

const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel

const AI_SYSTEM_PROMPT =
  '你是 Talex Touch 桌面助手中的智能助理，以简洁、可靠的方式回答用户问题。如有需要，可提供结构化的列表或步骤。'

const AI_PREFIX_PATTERNS = [
  /^ai[\s:：，。?？]+(.*)$/i,
  /^\/ai[\s:：，。?？]+(.*)$/i,
  /^@ai[\s:：，。?？]+(.*)$/i
]

type IntelligenceItemStatus = 'pending' | 'ready' | 'error'

interface IntelligencePayload extends Record<string, unknown> {
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

  readonly priority = 'deferred' as const
  readonly expectedDuration = 300

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    const normalized = query.text?.trim() ?? ''

    // 模仿插件：如果 AI 已经被激活，则不再要求前缀，直接把输入当作 prompt
    const activationState = searchEngineCore.getActivationState()
    const isAiActive = activationState?.some((a) => a.id === this.id)

    const parsedPrompt = this.extractPrompt(normalized)

    if (!isAiActive && !parsedPrompt) {
      return new TuffSearchResultBuilder(query).build()
    }

    const prompt = isAiActive ? normalized : (parsedPrompt?.prompt ?? '')

    const items: TuffItem[] = []

    if (!prompt) {
      // 没有输入时，显示占位符和历史记录
      items.push(this.createPlaceholderItem())

      // 加载最近的 AI 历史记录
      const historyItems = await this.loadAiHistory(5) // 加载最近 5 条
      items.push(...historyItems)
    } else {
      items.push(this.createActionItem(prompt))
    }

    return new TuffSearchResultBuilder(query).setItems(items).build()
  }

  async onExecute({ item }: IExecuteArgs): Promise<IProviderActivate | null> {
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

    const prompt = (meta.prompt ?? '').trim()
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

    void this.dispatchPrompt(requestId, prompt)

    // 模仿插件：返回一个 activation，让 SearchEngineCore 锁定到 AI provider
    const activation: IProviderActivate = {
      id: this.id,
      name: this.name,
      icon: item.render?.basic?.icon ?? item.icon,
      meta: {
        keepCoreBoxOpen: true,
        intelligence: {
          requestId,
          prompt
        }
      }
    }

    return activation
  }

  private async dispatchPrompt(requestId: string, prompt: string): Promise<void> {
    try {
      ensureAiConfigLoaded()
      const payload: IntelligenceChatPayload = {
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      }

      let accumulatedAnswer = ''
      let finalModel: string | undefined
      let finalUsage: AiUsageInfo | undefined

      // 使用流式调用
      for await (const chunk of ai.text.chatStream(payload)) {
        if (chunk.done) {
          // 流式响应完成，发送最终结果
          const answerPayload: IntelligencePayload = {
            requestId,
            prompt,
            status: 'ready',
            answer: accumulatedAnswer.trim(),
            model: finalModel,
            usage: finalUsage,
            createdAt: Date.now()
          }
          this.emitResultItem(this.createResultItem(answerPayload))

          // 保存到 clipboard 数据库
          await this.saveToClipboardHistory(prompt, accumulatedAnswer.trim(), {
            requestId,
            model: finalModel,
            usage: finalUsage
          })
        } else {
          // 累积增量文本
          accumulatedAnswer += chunk.delta

          // 实时更新显示（streaming 状态）
          const streamingPayload: IntelligencePayload = {
            requestId,
            prompt,
            status: 'pending',
            answer: accumulatedAnswer,
            model: finalModel,
            usage: finalUsage,
            createdAt: Date.now()
          }
          this.emitResultItem(this.createResultItem(streamingPayload))
        }
      }
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
  }

  private async saveToClipboardHistory(
    prompt: string,
    answer: string,
    meta: {
      requestId: string
      model?: string
      usage?: AiUsageInfo
    }
  ): Promise<void> {
    try {
      // 构造问答内容
      const content = `Q: ${prompt}\n\nA: ${answer}`

      // 保存到 clipboard 数据库
      await clipboardModule.saveCustomEntry({
        content,
        rawContent: null,
        category: 'ai-chat',
        meta: {
          requestId: meta.requestId,
          prompt,
          answer,
          model: meta.model,
          usage: meta.usage,
          type: 'ai-qa'
        }
      })

      console.log('[Intelligence] AI Q&A saved to clipboard history:', meta.requestId)
    } catch (error) {
      console.error('[Intelligence] Failed to save AI Q&A to clipboard:', error)
    }
  }

  private async loadAiHistory(limit: number = 5): Promise<TuffItem[]> {
    try {
      const coreWindow = windowManager.current?.window

      if (!coreWindow || coreWindow.isDestroyed()) {
        return []
      }

      // 使用统一查询接口按 category 筛选 AI 历史记录
      const history = await clipboardModule.queryHistoryByMeta({
        category: 'ai-chat',
        limit
      })

      if (!Array.isArray(history)) {
        return []
      }

      const historyItems: TuffItem[] = history.map((item: IClipboardItem) => {
        const meta = (item.meta ?? {}) as Record<string, unknown>
        const prompt = typeof meta.prompt === 'string' ? meta.prompt : ''
        const answer = typeof meta.answer === 'string' ? meta.answer : ''
        const model = typeof meta.model === 'string' ? meta.model : 'Unknown'
        const requestId = typeof meta.requestId === 'string' ? meta.requestId : crypto.randomUUID()
        const usage =
          typeof meta.usage === 'object' && meta.usage !== null
            ? (meta.usage as AiUsageInfo)
            : undefined

        // 创建历史记录的结果 item
        const payload: IntelligencePayload = {
          requestId,
          prompt,
          status: 'ready',
          answer,
          model,
          usage,
          createdAt: item.timestamp ? new Date(item.timestamp).getTime() : Date.now()
        }

        return this.createResultItem(payload)
      })

      return historyItems
    } catch (error) {
      console.error('[Intelligence] Failed to load AI history:', error)
      return []
    }
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

    if (
      value.toLowerCase() === 'ai' ||
      value.toLowerCase() === '/ai' ||
      value.toLowerCase() === '@ai'
    ) {
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
    // 使用 BoxItemSDK 统一管理
    const boxItemManager = getBoxItemManager()
    boxItemManager.upsert(item)

    // 扩展 CoreBox 窗口
    coreBoxManager.expand({ forceMax: true })
  }

  private focusInputWithPrefix(): void {
    const app = genTouchApp()
    const coreWindow = windowManager.current?.window
    if (!coreWindow || coreWindow.isDestroyed()) {
      return
    }

    const keyManager = resolveKeyManager(app.channel as { keyManager?: unknown })
    const transport = getTuffTransportMain(app.channel, keyManager)
    void transport.sendTo(coreWindow.webContents, CoreBoxEvents.input.setQuery, {
      value: 'ai '
    })
  }
}

const intelligenceSearchProvider = new IntelligenceSearchProvider()

export { intelligenceSearchProvider }

export default intelligenceSearchProvider
