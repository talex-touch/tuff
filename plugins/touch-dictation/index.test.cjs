const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const source = readFileSync(path.join(__dirname, 'index.js'), 'utf8')

class TuffItemBuilder {
  constructor(id) {
    this.item = { id, render: { mode: 'default', basic: {} } }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.render.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.render.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.item.render.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions = [
      {
        id,
        type,
        label,
        primary: true,
        ...(payload === undefined ? {} : { payload }),
      },
    ]
    return this
  }

  build() {
    return structuredClone(this.item)
  }
}

function createHarness(overrides = {}) {
  const state = {
    items: [],
    order: [],
    pasted: [],
    spoken: [],
    logs: [],
  }
  const plugin = {
    feature: {
      async clearItems() {
        state.order.push('clear:start')
        await Promise.resolve()
        state.items = []
        state.order.push('clear:end')
      },
      async pushItems(items) {
        state.order.push('push')
        state.items = structuredClone(items)
      },
    },
    voice: {
      async dictate() {
        return { text: 'one-shot words' }
      },
      async speak(payload) {
        state.spoken.push(structuredClone(payload))
        return { format: 'wav', played: true }
      },
      async asrStream(_payload, options) {
        await options.onData({ type: 'partial', text: 'partial words' })
        await options.onData({ type: 'final', text: 'final words', language: 'en-US' })
        await options.onData({ type: 'end' })
        await options.onEnd()
        return { id: 'stream-1', cancelled: false, cancel: async () => undefined }
      },
    },
  }
  const clipboard = {
    async readText() {
      return 'clipboard words'
    },
    async copyAndPaste(payload) {
      state.pasted.push(structuredClone(payload))
      return true
    },
    async writeText(text) {
      state.pasted.push({ text })
    },
  }
  Object.assign(plugin.voice, overrides.voice)
  // `voice: undefined` cannot express this — Object.assign ignores it and the default survives.
  // The capability being absent entirely is its own case (#822), so it needs its own switch.
  if (overrides.withoutVoice)
    delete plugin.voice
  Object.assign(clipboard, overrides.clipboard)

  const context = {
    TuffItemBuilder,
    clipboard,
    console,
    logger: {
      error(message) {
        state.logs.push(String(message))
      },
      warn(message) {
        state.logs.push(String(message))
      },
    },
    module: { exports: {} },
    plugin,
  }
  context.globalThis = context
  vm.runInNewContext(source, context, { filename: 'touch-dictation/index.js' })
  return { lifecycle: context.module.exports, state }
}

test('exports lifecycle only and awaits clear before feature publication', async () => {
  const { lifecycle, state } = createHarness()

  assert.deepEqual(Object.keys(lifecycle).sort(), ['onFeatureTriggered', 'onItemAction'])
  assert.equal(await lifecycle.onFeatureTriggered('dictate', { text: '' }), true)
  assert.deepEqual(state.order, ['clear:start', 'clear:end', 'push'])
  assert.equal(state.items.length, 1)
  assert.deepEqual(state.items[0].render.basic.icon, {
    type: 'class',
    value: 'i-ri-mic-line',
  })
})

test('streams partials, captures the final text and awaits governed delivery', async () => {
  const { lifecycle, state } = createHarness()
  await lifecycle.onFeatureTriggered('dictate', { text: '' })
  const item = state.items[0]

  const result = await lifecycle.onItemAction(item)

  assert.deepEqual(structuredClone(result), {
    externalAction: true,
    success: true,
    message: '已听写并粘贴：final words',
  })
  assert.deepEqual(state.pasted, [{ text: 'final words' }])
  assert.equal(state.items[0].render.basic.title, '🎙️ 识别中…')
  assert.equal(state.items[0].render.basic.subtitle, 'partial words')
})

test('contains voice failures without leaking host details', async () => {
  const { lifecycle, state } = createHarness({
    voice: {
      async asrStream() {
        throw Object.assign(new Error('/private/native/microphone device'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      },
    },
  })
  await lifecycle.onFeatureTriggered('dictate', { text: '' })

  const result = await lifecycle.onItemAction(state.items[0])

  assert.equal(result.success, false)
  // A denied permission is now named as one rather than sharing the generic 听写失败 text with
  // transport faults and an absent capability (#822).
  assert.equal(result.reason, 'permission-denied')
  assert.equal(result.status, 'failed')
  assert.match(result.message, /缺少语音权限/)
  // The part that matters most is unchanged: the host's own error text carries a device path,
  // and none of it may reach the result.
  assert.doesNotMatch(JSON.stringify(result), /private|native|microphone device/)
  assert.deepEqual(state.pasted, [])
  assert.deepEqual(state.logs, ['[touch-dictation] permission-denied'])
})

test('names an absent voice capability instead of blaming the microphone', async () => {
  // The reported defect: the guard read plugin.voice?.asrStream, which undefined satisfies, and
  // the next line dereferenced plugin.voice. The TypeError was reported as a microphone
  // permission problem — advice with nothing behind it, since no capability was injected at all.
  const { lifecycle, state } = createHarness({ withoutVoice: true })
  await lifecycle.onFeatureTriggered('dictate', { text: '' })

  const result = await lifecycle.onItemAction(state.items[0])

  assert.equal(result.success, false)
  assert.equal(result.reason, 'voice-capability-unavailable')
  assert.doesNotMatch(result.message, /麦克风权限/)
  assert.deepEqual(state.logs, ['[touch-dictation] voice-capability-unavailable'])
})

test('names an absent voice capability on speak, rather than the TTS configuration', async () => {
  const { lifecycle, state } = createHarness({ withoutVoice: true })

  await lifecycle.onFeatureTriggered('speak', { text: '' })
  const result = await lifecycle.onItemAction(state.items[0])

  assert.equal(result.success, false)
  assert.equal(result.reason, 'voice-capability-unavailable')
  assert.doesNotMatch(result.message, /TTS/)
})

test('maps a timeout to its own reason rather than the catch-all', async () => {
  const { lifecycle, state } = createHarness({
    voice: {
      async asrStream() {
        throw Object.assign(new Error('upstream stalled'), {
          code: 'PLUGIN_HOST_CAPABILITY_TIMEOUT',
        })
      },
    },
  })
  await lifecycle.onFeatureTriggered('dictate', { text: '' })

  const result = await lifecycle.onItemAction(state.items[0])

  assert.equal(result.reason, 'timeout')
  assert.match(result.message, /超时/)
})

test('reads clipboard asynchronously and invokes only the typed speak facade', async () => {
  const { lifecycle, state } = createHarness()

  assert.equal(await lifecycle.onFeatureTriggered('speak', { text: '' }), true)
  const item = state.items[0]
  assert.equal(item.actions[0].payload.text, 'clipboard words')

  const result = await lifecycle.onItemAction(item)
  assert.deepEqual(structuredClone(result), {
    externalAction: true,
    success: true,
    message: '正在朗读：clipboard words',
  })
  assert.deepEqual(state.spoken, [{ text: 'clipboard words' }])
})
