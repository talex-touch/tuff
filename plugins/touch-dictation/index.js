/**
 * touch-dictation — voice dictation + text-to-speech for CoreBox.
 *
 * - `dictate` (say / 听写): capture mic → stream live partials → polish → paste
 *   into the previously-active app. Dogfoods `plugin.voice.dictate` / `.asrStream`.
 * - `speak` (朗读 / read aloud): synthesize the clipboard text and play it through
 *   the speakers. Dogfoods `plugin.voice.speak`.
 */
const { plugin, logger, clipboard, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-dictation'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const FEATURE_DICTATE = 'dictate'
const FEATURE_SPEAK = 'speak'
const RECORDING_ITEM_ID = 'dictate-recording'

function truncate(value, max = 80) {
  const text = String(value ?? '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function buildItem({ id, featureId, title, subtitle, actionId, payload }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: featureId,
      actionId,
      ...(payload ? { payload } : {})
    })
    .build()
}

function showRecording(title, subtitle) {
  plugin.feature.clearItems()
  plugin.feature.pushItems([
    buildItem({ id: RECORDING_ITEM_ID, featureId: FEATURE_DICTATE, title, subtitle, actionId: 'recording' })
  ])
}

function readClipboardText() {
  try {
    return typeof clipboard?.readText === 'function' ? (clipboard.readText() || '').trim() : ''
  }
  catch (error) {
    logger?.warn?.('[touch-dictation] clipboard read failed', error)
    return ''
  }
}

async function deliver(text) {
  try {
    if (typeof clipboard?.copyAndPaste === 'function') {
      await clipboard.copyAndPaste({ text })
      return true
    }
    if (typeof clipboard?.writeText === 'function') {
      clipboard.writeText(text)
      return true
    }
  }
  catch (error) {
    logger?.warn?.('[touch-dictation] clipboard delivery failed', error)
  }
  return false
}

/**
 * Runs streaming dictation, updating the recording item with live partials.
 * Falls back to one-shot dictation when the streaming API is unavailable.
 */
async function dictate() {
  if (typeof plugin.voice?.asrStream !== 'function') {
    const result = await plugin.voice.dictate({ cleanup: true })
    return (result?.text ?? '').trim()
  }

  let finalText = ''
  await new Promise((resolve, reject) => {
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      error ? reject(error) : resolve()
    }
    Promise.resolve(
      plugin.voice.asrStream(
        { cleanup: true },
        {
          onData: (event) => {
            if (event?.type === 'partial' && event.text) {
              showRecording('🎙️ 识别中…', truncate(event.text, 120))
            }
            else if (event?.type === 'final') {
              finalText = (event.text ?? '').trim()
            }
            else if (event?.type === 'end') {
              finish()
            }
          },
          onError: (error) => finish(error || new Error('voice stream error')),
          onEnd: () => finish()
        }
      )
    ).catch((error) => finish(error))
  })
  return finalText
}

async function onDictateAction() {
  showRecording('🎙️ 录音中…', '请说话，停顿后自动结束')
  try {
    const text = truncate(await dictate(), 4000)
    if (!text) {
      return { externalAction: true, success: false, message: '没有识别到语音，请靠近麦克风再试一次' }
    }
    const delivered = await deliver(text)
    return {
      externalAction: true,
      success: true,
      message: delivered ? `已听写并粘贴：${truncate(text)}` : truncate(text)
    }
  }
  catch (error) {
    logger?.error?.('[touch-dictation] dictation failed', error)
    return { externalAction: true, success: false, message: '听写失败：请检查麦克风权限与语音服务配置后重试' }
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
  catch (error) {
    logger?.error?.('[touch-dictation] speak failed', error)
    return { externalAction: true, success: false, message: '朗读失败：请检查语音合成(TTS)服务配置' }
  }
}

const lifecycle = {
  async onFeatureTriggered(featureId, _query) {
    if (featureId === FEATURE_DICTATE) {
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildItem({
          id: 'dictate-start',
          featureId: FEATURE_DICTATE,
          title: '语音听写',
          subtitle: '按 Enter 开始说话 · 停顿后自动结束 · 润色后粘贴到当前应用',
          actionId: 'start'
        })
      ])
      return true
    }

    if (featureId === FEATURE_SPEAK) {
      const text = readClipboardText()
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        text
          ? buildItem({
              id: 'speak-start',
              featureId: FEATURE_SPEAK,
              title: '🔊 朗读剪贴板',
              subtitle: truncate(text, 120),
              actionId: 'speak',
              payload: { text }
            })
          : buildItem({
              id: 'speak-empty',
              featureId: FEATURE_SPEAK,
              title: '朗读剪贴板',
              subtitle: '剪贴板为空 —— 先复制一段文字再试',
              actionId: 'noop'
            })
      ])
      return true
    }

    return false
  },

  async onItemAction(item) {
    const featureId = item?.meta?.defaultAction
    const actionId = item?.meta?.actionId

    if (featureId === FEATURE_DICTATE && actionId === 'start') {
      return onDictateAction()
    }
    if (featureId === FEATURE_SPEAK && actionId === 'speak') {
      return onSpeakAction(item?.meta?.payload?.text ?? '')
    }
  }
}

module.exports = { ...lifecycle }
