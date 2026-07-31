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
  assert.match(result.message, /听写失败/)
  assert.doesNotMatch(JSON.stringify(result), /private|native|microphone device/)
  assert.deepEqual(state.pasted, [])
  assert.deepEqual(state.logs, ['[touch-dictation] dictation failed'])
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
