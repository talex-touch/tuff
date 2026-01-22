import type { AiUsageInfo, IntelligenceChatPayload } from '@talex-touch/utils'
import type { TuffItem } from '@talex-touch/utils/core-box'
import type { IFeatureLifeCycle, IPluginFeature } from '@talex-touch/utils/plugin'
import crypto from 'node:crypto'
import path from 'node:path'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { DEFAULT_WIDGET_RENDERERS } from '@talex-touch/utils/plugin'
import { app } from 'electron'
import { TuffIconImpl } from '../../core/tuff-icon'
import { ensureAiConfigLoaded } from '../../modules/ai/intelligence-config'
import { ai } from '../../modules/ai/intelligence-sdk'
import { WindowManager } from '../../modules/box-tool/core-box/window'
import { TouchPlugin } from '../../modules/plugin'
import { normalizePrompt } from './internal-ai-utils'

const AI_SYSTEM_PROMPT =
  '你是 Talex Touch 桌面助手中的智能助理，以简洁、可靠的方式回答用户问题。如有需要，可提供结构化的列表或步骤。'

const INTERNAL_AI_ICON = new TuffIconImpl(
  '',
  'url',
  'https://api.iconify.design/majesticons:sparkles.svg'
)

type InternalAiPlugin = TouchPlugin & {
  ask: (prompt: string) => Promise<void>
}

export function createInternalAiPlugin(): TouchPlugin {
  const pluginPath = path.join(app.getPath('userData'), '__internal_ai__')
  const aiPlugin = new TouchPlugin(
    'internal-ai',
    INTERNAL_AI_ICON,
    '1.0.0',
    'Internal AI integration plugin',
    '',
    { enable: false, address: '' },
    pluginPath,
    {},
    { skipDataInit: false }
  ) as InternalAiPlugin

  const feature = createAiFeature()
  const featureAdded = aiPlugin.addFeature(feature)

  if (!featureAdded) {
    console.error('[InternalAI] Failed to add feature!')
  }

  aiPlugin.pluginLifecycle = createAiLifecycle(aiPlugin)

  // Provide imperative API for other modules
  aiPlugin.ask = async (prompt: string) => {
    const lifecycle = aiPlugin.pluginLifecycle
    await lifecycle?.onFeatureTriggered?.(feature.id, prompt, feature)
  }

  return aiPlugin
}

function createAiFeature(): IPluginFeature {
  return {
    id: 'internal-ai-ask',
    name: 'AI 助手',
    desc: 'Talex Touch 内置 AI 智能助手',
    icon: INTERNAL_AI_ICON,
    push: true,
    platform: {},
    commands: [
      {
        type: 'over',
        value: ['ai', '@ai', '/ai']
      }
    ],
    interaction: {
      type: 'widget'
    },
    priority: 999
  }
}

function createAiLifecycle(plugin: TouchPlugin): IFeatureLifeCycle {
  const featureUtil = plugin.getFeatureUtil()
  const { push } = featureUtil.boxItems

  const buildBaseItem = (id: string): TuffItemBuilder => {
    return new TuffItemBuilder(id)
      .setSource('plugin', 'plugin-features', plugin.name)
      .setKind('command')
      .setIcon(INTERNAL_AI_ICON)
  }

  const createPlaceholderItem = (): TuffItem => {
    return buildBaseItem('internal-ai:input')
      .setTitle('向 Talex AI 提问')
      .setSubtitle('输入内容后回车即可发送给 AI')
      .setMeta({
        keepCoreBoxOpen: true,
        footerHints: {
          primary: { label: '发送', visible: true },
          secondary: { visible: false },
          quickSelect: { visible: false }
        }
      })
      .build()
  }

  const createActionItem = (prompt: string): TuffItem => {
    return buildBaseItem('internal-ai:input')
      .setTitle(prompt)
      .setSubtitle('按回车发送给 AI')
      .setMeta({
        keepCoreBoxOpen: true,
        pluginName: plugin.name,
        defaultAction: 'send-to-ai',
        intelligence: {
          prompt,
          status: 'action'
        },
        footerHints: {
          primary: { label: '发送', visible: true },
          secondary: { visible: false },
          quickSelect: { visible: false }
        }
      })
      .build()
  }

  const createPendingItem = (requestId: string, prompt: string): TuffItem => {
    return buildBaseItem(`internal-ai:pending:${requestId}`)
      .setTitle(prompt)
      .setSubtitle('AI 正在思考…')
      .setMeta({
        keepCoreBoxOpen: true,
        intelligence: {
          requestId,
          prompt,
          status: 'pending',
          createdAt: Date.now()
        },
        footerHints: {
          primary: { visible: false },
          secondary: { visible: false },
          quickSelect: { visible: false }
        }
      })
      .build()
  }

  const createAnswerItem = (
    requestId: string,
    prompt: string,
    answer: string,
    model?: string,
    usage?: AiUsageInfo
  ): TuffItem => {
    return buildBaseItem(`internal-ai:answer:${requestId}`)
      .setTitle(prompt || 'Talex AI')
      .setSubtitle('AI 回答已就绪')
      .setCustomRender('vue', DEFAULT_WIDGET_RENDERERS.CORE_INTELLIGENCE_ANSWER, {
        requestId,
        prompt,
        status: 'ready',
        answer,
        model,
        usage,
        createdAt: Date.now()
      })
      .setMeta({
        keepCoreBoxOpen: true,
        intelligence: {
          requestId,
          prompt,
          status: 'ready',
          answer,
          model,
          usage,
          createdAt: Date.now()
        },
        footerHints: {
          primary: { label: '复制', visible: true },
          secondary: { visible: false },
          quickSelect: { visible: false }
        }
      })
      .build()
  }

  const createErrorItem = (requestId: string, prompt: string, message: string): TuffItem => {
    return buildBaseItem(`internal-ai:error:${requestId}`)
      .setTitle(prompt || 'Talex AI')
      .setSubtitle('AI 回答失败')
      .setMeta({
        keepCoreBoxOpen: true,
        intelligence: {
          requestId,
          prompt,
          status: 'error',
          error: message,
          createdAt: Date.now()
        },
        footerHints: {
          primary: { label: '重试', visible: true },
          secondary: { visible: false },
          quickSelect: { visible: false }
        }
      })
      .build()
  }

  const dispatchPrompt = async (requestId: string, prompt: string): Promise<void> => {
    try {
      ensureAiConfigLoaded()
      const payload: IntelligenceChatPayload = {
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      }

      let answerText = ''
      let model: string | undefined
      let usage: AiUsageInfo | undefined

      const stream = ai.text.chatStream(payload)

      for await (const chunk of stream) {
        if (chunk.delta) {
          answerText += chunk.delta
        }
        if (chunk.usage) usage = chunk.usage

        push(createAnswerItem(requestId, prompt, answerText, model, usage))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      push(createErrorItem(requestId, prompt, message))
    }
  }

  return {
    onFeatureTriggered(_id, data) {
      WindowManager.getInstance().expand({ forceMax: true })

      const prompt = normalizePrompt(data)

      if (!prompt) {
        push(createPlaceholderItem())
        return
      }

      // 显示 action item，等待用户按回车确认
      push(createActionItem(prompt))
    },

    async onItemAction(item) {
      const intelligence = item.meta?.intelligence

      // 只处理 action 状态的 item
      if (!intelligence || intelligence.status !== 'action') {
        return { shouldActivate: false }
      }

      const prompt = intelligence.prompt
      if (!prompt) {
        return { shouldActivate: false }
      }

      // 用户确认发送，开始 AI 请求
      const requestId = crypto.randomUUID()
      push(createPendingItem(requestId, prompt))
      void dispatchPrompt(requestId, prompt)

      return { shouldActivate: true }
    }
  }
}
