/**
 * touch-dictation - voice dictation + text-to-speech for CoreBox.
 *
 * All microphone, ASR and TTS work stays in the main-owned voice capability.
 */
const { plugin, logger, clipboard, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-dictation'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-mic-line' }
const FEATURE_DICTATE = 'dictate'
const FEATURE_SPEAK = 'speak'
const RECORDING_ITEM_ID = 'dictate-recording'

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
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

async function publishItems(items) {
  await plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
}

async function showRecording(title, subtitle) {
  await publishItems([
    buildItem({
      id: RECORDING_ITEM_ID,
      featureId: FEATURE_DICTATE,
      title,
      subtitle,
      actionId: 'recording',
    }),
  ])
}

async function readClipboardText() {
  try {
    return typeof clipboard?.readText === 'function'
      ? String((await clipboard.readText()) ?? '').trim()
      : ''
  }
  catch {
    logger?.warn?.('[touch-dictation] clipboard read failed')
    return ''
  }
}

async function deliver(text) {
  try {
    if (typeof clipboard?.copyAndPaste === 'function') {
      return (await clipboard.copyAndPaste({ text })) === true
    }
    if (typeof clipboard?.writeText === 'function') {
      await clipboard.writeText(text)
      return true
    }
  }
  catch {
    logger?.warn?.('[touch-dictation] clipboard delivery failed')
  }
  return false
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
    return failed('permission-denied', '缺少语音权限：请在系统设置中允许麦克风访问')
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return failed('permission-unavailable', '权限系统不可用')
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED')
    return failed('cancelled', '语音操作已取消', 'cancelled')
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT')
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

async function dictate() {
  // plugin.voice is undefined when the capability is not injected. The old guard read
  // `plugin.voice?.asrStream`, which is satisfied by undefined, and the next line then
  // dereferenced plugin.voice — a TypeError the bare catch reported as a microphone
  // permission problem (#822).
  if (!plugin.voice)
    throw Object.assign(new Error('voice capability unavailable'), { code: 'TUFF_VOICE_UNAVAILABLE' })

  if (typeof plugin.voice.asrStream !== 'function') {
    if (typeof plugin.voice.dictate !== 'function')
      throw Object.assign(new Error('voice capability unavailable'), { code: 'TUFF_VOICE_UNAVAILABLE' })
    const result = await plugin.voice.dictate({ cleanup: true })
    return String(result?.text ?? '').trim()
  }

  let finalText = ''
  await new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled)
        return
      settled = true
      error ? reject(error) : resolve()
    }
    Promise.resolve(
      plugin.voice.asrStream(
        {},
        {
          onData: async (event) => {
            if (event?.type === 'partial' && event.text) {
              await showRecording('🎙️ 识别中…', truncate(event.text, 120))
            }
            else if (event?.type === 'final') {
              finalText = String(event.text ?? '').trim()
            }
          },
          onError: error => finish(error || new Error('VOICE_STREAM_FAILED')),
          onEnd: () => finish(),
        },
      ),
    ).catch(error => finish(error))
  })
  return finalText
}

async function onDictateAction() {
  await showRecording('🎙️ 录音中…', '请说话，停顿后自动结束')
  try {
    const text = truncate(await dictate(), 4000)
    if (!text)
      return failed('no-speech-detected', '没有识别到语音，请靠近麦克风再试一次')
    const delivered = await deliver(text)
    return {
      externalAction: true,
      success: true,
      message: delivered ? `已听写并粘贴：${truncate(text)}` : truncate(text),
    }
  }
  catch (error) {
    const failure = error?.code === 'TUFF_VOICE_UNAVAILABLE'
      ? failed('voice-capability-unavailable', '语音能力不可用：当前环境未提供语音服务')
      : voiceFailure(error, 'dictation-failed', '听写失败：请检查麦克风权限与语音服务配置后重试')
    logger?.error?.(`[touch-dictation] ${failure.reason}`)
    return failure
  }
}

async function onSpeakAction(text) {
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
  async onFeatureTriggered(featureId, _query) {
    if (featureId === FEATURE_DICTATE) {
      await publishItems([
        buildItem({
          id: 'dictate-start',
          featureId: FEATURE_DICTATE,
          title: '语音听写',
          subtitle: '按 Enter 开始说话 · 停顿后自动结束 · 润色后粘贴到当前应用',
          actionId: 'start',
        }),
      ])
      return true
    }

    if (featureId === FEATURE_SPEAK) {
      const text = await readClipboardText()
      await publishItems([
        text
          ? buildItem({
              id: 'speak-start',
              featureId: FEATURE_SPEAK,
              title: '🔊 朗读剪贴板',
              subtitle: truncate(text, 120),
              actionId: 'speak',
              payload: { text },
            })
          : buildItem({
              id: 'speak-empty',
              featureId: FEATURE_SPEAK,
              title: '朗读剪贴板',
              subtitle: '剪贴板为空 - 先复制一段文字再试',
              actionId: 'noop',
            }),
      ])
      return true
    }

    return false
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
}

module.exports = { ...lifecycle }
