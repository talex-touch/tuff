/**
 * touch-dictation - voice dictation + text-to-speech for CoreBox.
 *
 * All microphone, ASR and TTS work stays in the main-owned voice capability.
 */
const { plugin, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-dictation'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-mic-line' }
const FEATURE_DICTATE = 'dictate'
const FEATURE_SPEAK = 'speak'
const RECORDING_ITEM_ID = 'dictate-recording'
const MAX_SPEAK_TEXT = 4000

let destroyed = false
let triggerGeneration = 0
let dictationInFlight = false
let activeStreamHandle = null
let activeFinish = null

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function extractSpeakQueryText(query) {
  const raw = typeof query === 'string' ? query : (query?.text ?? query?.query ?? '')
  const trimmed = String(raw ?? '').trim()
  if (!trimmed)
    return ''
  const stripped = trimmed
    .replace(/^(?:read\s+aloud|speak\s+aloud|tts|朗读|念)\s*[:：-]?\s*/i, '')
    .trim()
  return stripped ? stripped.slice(0, MAX_SPEAK_TEXT) : ''
}

function buildItem({ id, featureId, title, subtitle, actionId, payload }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: featureId,
    })
  if (actionId === 'start' || actionId === 'speak') {
    builder.createAndAddAction(
      actionId,
      'plugin',
      actionId === 'start' ? '开始听写' : '开始朗读',
      payload,
    )
  }
  return builder.build()
}

async function publishItems(items, generation) {
  if (destroyed || (generation !== undefined && generation !== triggerGeneration))
    return false
  await plugin.feature.clearItems()
  if (destroyed || (generation !== undefined && generation !== triggerGeneration))
    return false
  await plugin.feature.pushItems(items)
  return !destroyed && (generation === undefined || generation === triggerGeneration)
}

async function showRecording(title, subtitle, generation) {
  if (destroyed || (generation !== undefined && generation !== triggerGeneration))
    return
  await publishItems([
    buildItem({
      id: RECORDING_ITEM_ID,
      featureId: FEATURE_DICTATE,
      title,
      subtitle,
      actionId: 'recording',
    }),
  ], generation)
}

async function safeShowRecording(title, subtitle, generation) {
  try {
    await showRecording(title, subtitle, generation)
  }
  catch {
    logger?.warn?.('[touch-dictation] recording status update failed')
  }
}

async function readClipboardText() {
  const clipboardFacade = globalThis.clipboard
  if (!clipboardFacade || typeof clipboardFacade.readText !== 'function')
    return { ok: false, text: '', reason: 'clipboard-unavailable' }
  try {
    return {
      ok: true,
      text: String((await clipboardFacade.readText()) ?? '').trim(),
      reason: '',
    }
  }
  catch (error) {
    const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
    const reason = code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      ? 'permission-denied'
      : code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
        ? 'permission-unavailable'
        : code === 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED'
          ? 'permission-check-failed'
          : code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE' || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE'
            ? 'capability-unavailable'
            : 'clipboard-read-failed'
    logger?.warn?.(`[touch-dictation] ${reason}`)
    return { ok: false, text: '', reason }
  }
}

function clipboardFailureItem(reason) {
  if (reason === 'permission-denied') {
    return buildItem({
      id: 'speak-permission-denied',
      featureId: FEATURE_SPEAK,
      title: '缺少剪贴板读取权限',
      subtitle: '请授予 clipboard.read 权限，或直接输入要朗读的文字 · permission-denied',
      actionId: 'noop',
    })
  }
  if (reason === 'permission-unavailable') {
    return buildItem({
      id: 'speak-permission-unavailable',
      featureId: FEATURE_SPEAK,
      title: '剪贴板权限不可用',
      subtitle: '权限系统暂不可用 · permission-unavailable',
      actionId: 'noop',
    })
  }
  if (reason === 'permission-check-failed') {
    return buildItem({
      id: 'speak-permission-check-failed',
      featureId: FEATURE_SPEAK,
      title: '剪贴板权限校验失败',
      subtitle: '无法确认剪贴板读取权限 · permission-check-failed',
      actionId: 'noop',
    })
  }
  if (reason === 'capability-unavailable' || reason === 'clipboard-unavailable') {
    return buildItem({
      id: 'speak-clipboard-unavailable',
      featureId: FEATURE_SPEAK,
      title: '剪贴板能力不可用',
      subtitle: `当前环境未提供剪贴板读取能力 · ${reason}`,
      actionId: 'noop',
    })
  }
  return buildItem({
    id: 'speak-clipboard-failed',
    featureId: FEATURE_SPEAK,
    title: '剪贴板读取失败',
    subtitle: `无法读取剪贴板内容 · ${reason}`,
    actionId: 'noop',
  })
}

/**
 * Map a host capability error to a reason the caller can act on (#821-style contract, #822).
 *
 * The catches here took no error binding, so a denied permission, an absent capability and a
 * transport fault all came back as one message with no `reason` — and the message told the user to
 * check microphone permissions even when the fault was neither. Shape follows touch-snipaste's
 * stableFailure. The host's own text never reaches the result; only the code is read.
 */
function voiceFailure(error, fallbackReason, fallbackMessage) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return failed('permission-denied', '缺少语音权限：请在系统设置中允许麦克风访问', 'blocked')
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return failed('permission-unavailable', '权限系统不可用', 'blocked')
  if (code === 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED')
    return failed('permission-check-failed', '语音权限校验失败', 'blocked')
  if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE' || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    return failed('capability-unavailable', '语音能力不可用：当前环境未提供语音服务', 'blocked')
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_REQUEST_CANCELLED')
    return failed('cancelled', '语音操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT')
    return failed('timeout', '语音服务响应超时')
  return failed(fallbackReason, fallbackMessage)
}

function failed(reason, message, status = 'failed') {
  return {
    externalAction: true,
    success: false,
    status,
    reason,
    message,
  }
}

async function dictate(sessionGeneration) {
  if (!plugin.voice)
    throw Object.assign(new Error('voice capability unavailable'), { code: 'TUFF_VOICE_UNAVAILABLE' })

  if (typeof plugin.voice.asrStream !== 'function') {
    if (typeof plugin.voice.dictate !== 'function')
      throw Object.assign(new Error('voice capability unavailable'), { code: 'TUFF_VOICE_UNAVAILABLE' })
    const result = await plugin.voice.dictate({ cleanup: true, delivery: 'active-app' })
    return {
      text: String(result?.text ?? '').trim(),
      delivery: result?.delivery,
    }
  }

  let finalText = ''
  let delivery
  await new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled)
        return
      settled = true
      if (activeFinish === finish)
        activeFinish = null
      activeStreamHandle = null
      error ? reject(error) : resolve()
    }
    activeFinish = finish
    Promise.resolve(
      plugin.voice.asrStream(
        { cleanup: true, delivery: 'active-app' },
        {
          onData: async (event) => {
            if (destroyed || settled || sessionGeneration !== triggerGeneration)
              return
            if (event?.type === 'partial' && event.text) {
              await safeShowRecording('🎙️ 识别中…', truncate(event.text, 120), sessionGeneration)
            }
            else if (event?.type === 'final') {
              finalText = String(event.text ?? '').trim()
              delivery = event.delivery
            }
          },
          onError: error => finish(error || new Error('VOICE_STREAM_FAILED')),
          onEnd: () => finish(),
        },
      ),
    )
      .then((handle) => {
        if (destroyed && typeof handle?.cancel === 'function') {
          Promise.resolve(handle.cancel()).catch(() => {})
          return
        }
        if (!settled)
          activeStreamHandle = handle
      })
      .catch(error => finish(error))
  })
  return { text: finalText, delivery }
}

async function onDictateAction() {
  if (destroyed)
    return failed('cancelled', '语音操作已取消', 'cancelled')
  if (dictationInFlight)
    return failed('dictation-in-progress', '正在录音中，请等待当前听写结束', 'blocked')
  dictationInFlight = true
  const sessionGeneration = triggerGeneration
  try {
    await safeShowRecording('🎙️ 录音中…', '请说话，停顿后自动结束', sessionGeneration)
    const result = await dictate(sessionGeneration)
    if (destroyed)
      return failed('cancelled', '语音操作已取消', 'cancelled')
    const text = truncate(result.text, MAX_SPEAK_TEXT)
    if (!text)
      return failed('no-speech-detected', '没有识别到语音，请靠近麦克风再试一次')
    if (!result.delivery || result.delivery.method === 'none')
      return failed('delivery-failed', '听写完成，但未能写入当前应用，请重试')
    return {
      externalAction: true,
      success: true,
      message: result.delivery.method === 'native'
        ? `已听写并输入：${truncate(text)}`
        : `已听写并粘贴：${truncate(text)}`,
    }
  }
  catch (error) {
    const failure = error?.code === 'TUFF_VOICE_UNAVAILABLE'
      ? failed('voice-capability-unavailable', '语音能力不可用：当前环境未提供语音服务')
      : voiceFailure(error, 'dictation-failed', '听写失败：请检查麦克风权限与语音服务配置后重试')
    logger?.error?.(`[touch-dictation] ${failure.reason}`)
    return failure
  }
  finally {
    dictationInFlight = false
  }
}

async function onSpeakAction(text) {
  if (destroyed)
    return failed('cancelled', '语音操作已取消', 'cancelled')
  if (!text)
    return failed('no-text-to-speak', '没有可朗读的文字')

  // Same unguarded dereference as dictate had: plugin.voice is undefined when the capability
  // is not injected, and the bare catch below blamed the TTS configuration for it (#822).
  if (typeof plugin.voice?.speak !== 'function') {
    logger?.error?.('[touch-dictation] voice-capability-unavailable')
    return failed('voice-capability-unavailable', '语音能力不可用：当前环境未提供语音服务')
  }

  try {
    await plugin.voice.speak({ text })
    return { externalAction: true, success: true, message: `正在朗读：${truncate(text)}` }
  }
  catch (error) {
    const failure = voiceFailure(error, 'speak-failed', '朗读失败：请检查语音合成(TTS)服务配置')
    logger?.error?.(`[touch-dictation] ${failure.reason}`)
    return failure
  }
}

const lifecycle = {
  async onFeatureTriggered(featureId, query) {
    if (destroyed)
      return false
    if (featureId !== FEATURE_DICTATE && featureId !== FEATURE_SPEAK)
      return false
    const generation = ++triggerGeneration
    try {
      if (featureId === FEATURE_DICTATE) {
        await publishItems([
          buildItem({
            id: 'dictate-start',
            featureId: FEATURE_DICTATE,
            title: '语音听写',
            subtitle: '按 Enter 开始说话 · 停顿后自动结束 · 润色后粘贴到当前应用',
            actionId: 'start',
          }),
        ], generation)
        return true
      }

      const typedText = extractSpeakQueryText(query)
      if (typedText) {
        await publishItems([
          buildItem({
            id: 'speak-start',
            featureId: FEATURE_SPEAK,
            title: '🔊 朗读文本',
            subtitle: truncate(typedText, 120),
            actionId: 'speak',
            payload: { text: typedText },
          }),
        ], generation)
        return true
      }

      const clip = await readClipboardText()
      if (destroyed || generation !== triggerGeneration)
        return true
      if (!clip.ok) {
        await publishItems([clipboardFailureItem(clip.reason)], generation)
        return true
      }
      await publishItems([
        clip.text
          ? buildItem({
              id: 'speak-start',
              featureId: FEATURE_SPEAK,
              title: '🔊 朗读剪贴板',
              subtitle: truncate(clip.text, 120),
              actionId: 'speak',
              payload: { text: clip.text },
            })
          : buildItem({
              id: 'speak-empty',
              featureId: FEATURE_SPEAK,
              title: '朗读剪贴板',
              subtitle: '剪贴板为空 - 先复制一段文字或直接输入文字再试',
              actionId: 'noop',
            }),
      ], generation)
      return true
    }
    catch (error) {
      if (destroyed || generation !== triggerGeneration)
        return true
      const failure = voiceFailure(error, 'feature-trigger-failed', '功能加载失败，请重试')
      logger?.error?.(`[touch-dictation] ${failure.reason}`)
      try {
        await publishItems([
          buildItem({
            id: `${featureId}-error`,
            featureId,
            title: featureId === FEATURE_SPEAK ? '朗读暂不可用' : '听写暂不可用',
            subtitle: failure.message,
            actionId: 'noop',
          }),
        ], generation)
        return true
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    const featureId = item?.meta?.defaultAction
    const actionId = context.actionId || item?.actions?.[0]?.id
    const action = item?.actions?.find?.(entry => entry?.id === actionId)

    if (featureId === FEATURE_DICTATE && actionId === 'start') {
      return onDictateAction()
    }
    if (featureId === FEATURE_SPEAK && actionId === 'speak') {
      return onSpeakAction(action?.payload?.text ?? '')
    }
  },

  onDestroy() {
    destroyed = true
    triggerGeneration += 1
    const handle = activeStreamHandle
    activeStreamHandle = null
    const finish = activeFinish
    activeFinish = null
    if (typeof handle?.cancel === 'function') {
      Promise.resolve(handle.cancel()).catch(() => {})
    }
    if (typeof finish === 'function') {
      finish(Object.assign(new Error('VOICE_STREAM_CANCELLED'), {
        code: 'PLUGIN_HOST_CAPABILITY_CANCELLED',
      }))
    }
  },
}

module.exports = { ...lifecycle }
