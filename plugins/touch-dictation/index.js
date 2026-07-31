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

async function dictate() {
  if (typeof plugin.voice?.asrStream !== 'function') {
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
    if (!text) {
      return {
        externalAction: true,
        success: false,
        message: '没有识别到语音，请靠近麦克风再试一次',
      }
    }
    const delivered = await deliver(text)
    return {
      externalAction: true,
      success: true,
      message: delivered ? `已听写并粘贴：${truncate(text)}` : truncate(text),
    }
  }
  catch {
    logger?.error?.('[touch-dictation] dictation failed')
    return {
      externalAction: true,
      success: false,
      message: '听写失败：请检查麦克风权限与语音服务配置后重试',
    }
  }
}

async function onSpeakAction(text) {
  if (!text) {
    return { externalAction: true, success: false, message: '没有可朗读的文字' }
  }
  try {
    await plugin.voice.speak({ text })
    return { externalAction: true, success: true, message: `正在朗读：${truncate(text)}` }
  }
  catch {
    logger?.error?.('[touch-dictation] speak failed')
    return {
      externalAction: true,
      success: false,
      message: '朗读失败：请检查语音合成(TTS)服务配置',
    }
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
