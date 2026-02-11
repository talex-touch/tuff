const { plugin, clipboard, logger, TuffItemBuilder, permission } = globalThis
const crypto = require('node:crypto')

const PLUGIN_NAME = 'touch-intelligence'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'intelligence-action'

const AI_SYSTEM_PROMPT = '你是 Talex Touch 桌面助手里的智能助手，请用简洁清晰的中文回答。'

function resolveIntelligenceClient() {
  const { createIntelligenceClient } = require('@talex-touch/utils/intelligence')
  return createIntelligenceClient()
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 88) {
  const text = normalizeText(value)
  if (!text)
    return ''
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizePrompt(raw) {
  const input = normalizeText(raw)
  if (!input)
    return ''

  const withoutPrefix = input.replace(/^(?:@?ai|\/ai|智能|问答)[\s:：，,。?？]*/i, '')
  return normalizeText(withoutPrefix || input)
}

function buildInvokePayload(prompt) {
  return {
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  }
}

function mapInvokeResult(result, prompt, requestId) {
  return {
    requestId,
    prompt,
    answer: normalizeText(result?.result),
    provider: normalizeText(result?.provider),
    model: normalizeText(result?.model),
  }
}

async function ensurePermission(permissionId, reason) {
  if (!permission)
    return true

  const hasPermission = await permission.check(permissionId)
  if (hasPermission)
    return true

  const granted = await permission.request(permissionId, reason)
  return Boolean(granted)
}

function buildInfoItem({ id, featureId, title, subtitle, payload, actionId }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)

  const meta = {
    pluginName: PLUGIN_NAME,
    featureId,
  }

  if (actionId) {
    meta.defaultAction = ACTION_ID
    meta.actionId = actionId
    meta.payload = payload
  }

  return builder.setMeta(meta).build()
}

function buildPlaceholderItem(featureId) {
  return buildInfoItem({
    id: `${featureId}-placeholder`,
    featureId,
    title: '输入问题后回车发送',
    subtitle: '示例：ai 帮我总结今天待办',
  })
}

function buildSendItem(featureId, prompt) {
  return buildInfoItem({
    id: `${featureId}-send`,
    featureId,
    title: prompt,
    subtitle: '按回车发送到 AI',
    actionId: 'send',
    payload: { prompt },
  })
}

function buildPendingItem(featureId, prompt, requestId) {
  return buildInfoItem({
    id: `${featureId}-pending-${requestId}`,
    featureId,
    title: prompt,
    subtitle: 'AI 正在思考…',
  })
}

function buildReadyItem(featureId, state) {
  const modelInfo = [state.provider, state.model].filter(Boolean).join(' / ')
  const subtitle = [truncateText(state.answer, 72), modelInfo].filter(Boolean).join(' · ')

  return buildInfoItem({
    id: `${featureId}-ready-${state.requestId}`,
    featureId,
    title: state.prompt || 'AI 回答',
    subtitle: subtitle || '回答已生成',
    actionId: 'copy-answer',
    payload: {
      prompt: state.prompt,
      answer: state.answer,
    },
  })
}

function buildErrorItem(featureId, prompt, message) {
  return buildInfoItem({
    id: `${featureId}-error-${Date.now()}`,
    featureId,
    title: prompt || 'AI 请求失败',
    subtitle: truncateText(message || '未知错误', 96),
    actionId: 'retry',
    payload: { prompt },
  })
}

async function dispatchPrompt(featureId, prompt, requestId) {
  try {
    const client = resolveIntelligenceClient()
    const payload = buildInvokePayload(prompt)
    const result = await client.invoke('text.chat', payload)
    const mapped = mapInvokeResult(result, prompt, requestId)

    if (!mapped.answer) {
      throw new Error('AI 未返回可用内容')
    }

    plugin.feature.clearItems()
    plugin.feature.pushItems([buildReadyItem(featureId, mapped)])
  }
  catch (error) {
    logger?.error?.('[touch-intelligence] invoke failed', error)
    plugin.feature.clearItems()
    plugin.feature.pushItems([
      buildErrorItem(featureId, prompt, error?.message || 'AI 调用失败'),
    ])
  }
}

async function copyAnswer(answer) {
  if (!clipboard?.writeText)
    return false

  const canCopy = await ensurePermission('clipboard.write', '需要剪贴板权限以复制 AI 回答')
  if (!canCopy)
    return false

  clipboard.writeText(answer)
  return true
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const prompt = normalizePrompt(getQueryText(query))

      plugin.feature.clearItems()

      if (!prompt) {
        plugin.feature.pushItems([buildPlaceholderItem(featureId)])
        return true
      }

      plugin.feature.pushItems([buildSendItem(featureId, prompt)])
      return true
    }
    catch (error) {
      logger?.error?.('[touch-intelligence] Failed to handle feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildErrorItem(featureId, '', error?.message || '未知错误'),
      ])
      return true
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== ACTION_ID)
        return

      const actionId = item.meta?.actionId
      const payload = item.meta?.payload || {}
      const prompt = normalizePrompt(payload.prompt)

      if (actionId === 'copy-answer') {
        const answer = normalizeText(payload.answer)
        if (!answer)
          return

        const copied = await copyAnswer(answer)
        if (!copied) {
          return {
            externalAction: true,
            success: false,
            message: '复制失败：缺少 clipboard.write 权限',
          }
        }

        return { externalAction: true }
      }

      if (actionId === 'send' || actionId === 'retry') {
        if (!prompt)
          return

        const hasPermission = await ensurePermission('ai.basic', '需要 AI 权限以执行智能问答')
        if (!hasPermission)
          return

        const requestId = crypto.randomUUID()
        plugin.feature.clearItems()
        plugin.feature.pushItems([buildPendingItem(item.meta?.featureId || 'intelligence.ask', prompt, requestId)])
        void dispatchPrompt(item.meta?.featureId || 'intelligence.ask', prompt, requestId)
        return { externalAction: true }
      }
    }
    catch (error) {
      logger?.error?.('[touch-intelligence] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildInvokePayload,
    mapInvokeResult,
    normalizePrompt,
  },
}
