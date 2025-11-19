import type { AiChatPayload, AiUsageInfo } from '@talex-touch/utils'
import type { TuffItem } from '@talex-touch/utils/core-box'
import type { IFeatureLifeCycle, IPluginFeature } from '@talex-touch/utils/plugin'
import crypto from 'node:crypto'
import path from 'node:path'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { app } from 'electron'
import { TuffIconImpl } from '../../core/tuff-icon'
import { ensureAiConfigLoaded } from '../../modules/ai/intelligence-config'
import { ai } from '../../modules/ai/intelligence-sdk'
import { TouchPlugin } from '../../modules/plugin'
import { normalizePrompt } from './internal-ai-utils'
import { InternalPluginLogger } from './internal-plugin-logger'

const AI_SYSTEM_PROMPT =
  '你是 Talex Touch 桌面助手中的智能助理，以简洁、可靠的方式回答用户问题。如有需要，可提供结构化的列表或步骤。'

export function createInternalAiPlugin(): TouchPlugin {
  const pluginPath = path.join(app.getPath('userData'), '__internal_ai__')
  const icon = new TuffIconImpl(pluginPath, 'emoji', '🤖')
  const aiPlugin = new TouchPlugin(
    'internal-ai',
    icon,
    '1.0.0',
    'Internal AI integration plugin',
    '',
    { enable: false, address: '' },
    pluginPath,
    {},
    { skipDataInit: false }
  )

  ;(aiPlugin as any).logger = new InternalPluginLogger(aiPlugin.name)
  const feature = createAiFeature()
  const featureAdded = aiPlugin.addFeature(feature)

  if (!featureAdded) {
    console.error('[InternalAI] Failed to add feature!')
  }

  aiPlugin.pluginLifecycle = createAiLifecycle(aiPlugin)

  // Provide imperative API for other modules
  ;(aiPlugin as any).ask = async (prompt: string) => {
    const lifecycle = aiPlugin.pluginLifecycle
    await lifecycle?.onFeatureTriggered?.(feature.id, prompt, feature)
  }

  return aiPlugin
}

function createAiFeature(): IPluginFeature {
  return {
    id: 'internal-ai-ask', // 移除点号，使用连字符
    name: 'AI 助手',
    desc: 'Talex Touch 内置 AI 智能助手',
    icon: {
      type: 'emoji',
      value: '🤖',
      status: 'normal'
    } as any, // 传入普通对象，让 PluginFeature 构造函数创建 TuffIconImpl
    push: true, // Push mode: 主动推送 AI 回答
    platform: {},
    commands: [
      {
        type: 'over',
        value: ['ai', '@ai', '/ai']
      } as any
    ],
    interaction: {
      type: 'widget'
    },
    priority: 999
  }
}

function createAiLifecycle(plugin: TouchPlugin): IFeatureLifeCycle {
  const featureUtil = plugin.getFeatureUtil()
  const pushItems = featureUtil.pushItems

  const buildBaseItem = (id: string): TuffItemBuilder => {
    return new TuffItemBuilder(id)
      .setSource('plugin', plugin.name, plugin.name)
      .setKind('command')
      .setIcon({ type: 'emoji', value: '🤖', status: 'normal' })
      .setMeta({ keepCoreBoxOpen: true } as any)
  }

  const createPlaceholderItem = (): TuffItem => {
    return buildBaseItem(`internal-ai:placeholder:${Date.now()}`)
      .setTitle('向 Talex AI 提问')
      .setSubtitle('输入内容后回车即可发送给 AI')
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
        }
      } as any)
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
      .setCustomRender('vue', 'core-intelligence-answer', {
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
        }
      } as any)
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
        }
      } as any)
      .build()
  }

  return {
    onFeatureTriggered(_id, data) {
      const prompt = normalizePrompt(data)

      if (!prompt) {
        void pushItems([createPlaceholderItem()])
        return
      }

      const requestId = crypto.randomUUID()
      void pushItems([createPendingItem(requestId, prompt)])

      void (async () => {
        try {
          ensureAiConfigLoaded()
          const payload: AiChatPayload = {
            messages: [
              { role: 'system', content: AI_SYSTEM_PROMPT },
              { role: 'user', content: prompt }
            ]
          }

          const result = await ai.text.chat(payload)
          const answerText = result?.result?.trim() ?? ''
          await pushItems([
            createAnswerItem(requestId, prompt, answerText, result?.model, result?.usage)
          ])
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await pushItems([createErrorItem(requestId, prompt, message)])
        }
      })()
    }
  }
}
