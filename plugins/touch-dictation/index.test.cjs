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
    dictationRequests: [],
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
        return { text: 'one-shot words', delivery: { method: 'native' } }
      },
      async speak(payload) {
        state.spoken.push(structuredClone(payload))
        return { format: 'wav', played: true }
      },
      async asrStream(payload, options) {
        state.dictationRequests.push(structuredClone(payload))
        await options.onData({ type: 'partial', text: 'partial words' })
        await options.onData({
          type: 'final',
          text: 'final words',
          language: 'en-US',
          delivery: { method: 'autopaste' },
        })
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
  }
  Object.assign(plugin.voice, overrides.voice)
  // `voice: undefined` cannot express this — Object.assign ignores it and the default survives.
  // The capability being absent entirely is its own case (#822), so it needs its own switch.
  if (overrides.withoutVoice)
    delete plugin.voice
  Object.assign(clipboard, overrides.clipboard)
  Object.assign(plugin.feature, overrides.feature)

  const context = {
    TuffItemBuilder,
    clipboard: overrides.withoutClipboard ? undefined : clipboard,
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

  assert.deepEqual(Object.keys(lifecycle).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
  assert.equal(await lifecycle.onFeatureTriggered('dictate', { text: '' }), true)
  assert.deepEqual(state.order, ['clear:start', 'clear:end', 'push'])
  assert.equal(state.items.length, 1)
  assert.deepEqual(state.items[0].render.basic.icon, {
    type: 'class',
    value: 'i-ri-mic-line',
  })
})

test('streams partials, returns the main-owned delivery result, and never performs child-side paste', async () => {
  const { lifecycle, state } = createHarness()
  await lifecycle.onFeatureTriggered('dictate', { text: '' })
  const item = state.items[0]

  const result = await lifecycle.onItemAction(item)

  assert.deepEqual(structuredClone(result), {
    externalAction: true,
    success: true,
    message: '已听写并粘贴：final words',
  })
  assert.deepEqual(state.dictationRequests, [{ cleanup: true, delivery: 'active-app' }])
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
  assert.equal(result.status, 'blocked')
  assert.match(result.message, /缺少语音权限/)
  // The part that matters most is unchanged: the host's own error text carries a device path,
  // and none of it may reach the result.
  assert.doesNotMatch(JSON.stringify(result), /private|native|microphone device/)
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

test('surfaces clipboard permission denied and unavailable states instead of claiming empty clipboard', async () => {
  const denied = createHarness({
    clipboard: {
      async readText() {
        throw Object.assign(new Error('denied'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      },
    },
  })
  await denied.lifecycle.onFeatureTriggered('speak', { text: '' })
  assert.equal(denied.state.items[0].id, 'speak-permission-denied')
  assert.match(denied.state.items[0].render.basic.subtitle, /permission-denied/)
  assert.doesNotMatch(denied.state.items[0].render.basic.subtitle, /剪贴板为空/)

  const unavailable = createHarness({
    clipboard: {
      async readText() {
        throw Object.assign(new Error('unavailable'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
        })
      },
    },
  })
  await unavailable.lifecycle.onFeatureTriggered('speak', { text: '' })
  assert.equal(unavailable.state.items[0].id, 'speak-permission-unavailable')
  assert.match(unavailable.state.items[0].render.basic.subtitle, /permission-unavailable/)
  assert.doesNotMatch(unavailable.state.items[0].render.basic.subtitle, /剪贴板为空/)

  const missing = createHarness({ withoutClipboard: true })
  await missing.lifecycle.onFeatureTriggered('speak', { text: '' })
  assert.equal(missing.state.items[0].id, 'speak-clipboard-unavailable')
  assert.match(missing.state.items[0].render.basic.subtitle, /clipboard-unavailable/)
})

test('allows non-empty typed query text in speak without requiring clipboard', async () => {
  let clipboardReads = 0
  const { lifecycle, state } = createHarness({
    clipboard: {
      async readText() {
        clipboardReads += 1
        return 'ignored clipboard'
      },
    },
  })

  await lifecycle.onFeatureTriggered('speak', { text: 'tts hello typed world' })
  assert.equal(clipboardReads, 0)
  assert.equal(state.items[0].actions[0].payload.text, 'hello typed world')

  const result = await lifecycle.onItemAction(state.items[0])
  assert.equal(result.success, true)
  assert.deepEqual(state.spoken, [{ text: 'hello typed world' }])
})

test('maps permission-unavailable in voiceFailure to blocked status', async () => {
  const { lifecycle } = createHarness({
    voice: {
      async speak() {
        throw Object.assign(new Error('permission backend offline'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
        })
      },
    },
  })
  await lifecycle.onFeatureTriggered('speak', { text: '' })
  const result = await lifecycle.onItemAction(
    { meta: { defaultAction: 'speak' }, actions: [{ id: 'speak', payload: { text: 'hi' } }] },
  )
  assert.equal(result.success, false)
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-unavailable')
})

test('enforces single-flight recording lock, catches onData render errors, and cancels on destroy', async () => {
  let streamStarts = 0
  let cancelled = false
  let capturedOptions
  let pushFailOnce = true
  let markStarted
  const streamStarted = new Promise((resolve) => {
    markStarted = resolve
  })
  const { lifecycle, state } = createHarness({
    feature: {
      async pushItems(items) {
        if (pushFailOnce && items[0]?.render?.basic?.title === '🎙️ 识别中…') {
          pushFailOnce = false
          throw new Error('renderer detached')
        }
        state.order.push('push')
        state.items = structuredClone(items)
      },
    },
    voice: {
      async asrStream(payload, options) {
        streamStarts += 1
        capturedOptions = options
        markStarted()
        return {
          id: 'stream-lock',
          cancelled: false,
          async cancel() {
            cancelled = true
          },
        }
      },
    },
  })

  await lifecycle.onFeatureTriggered('dictate', { text: '' })
  const item = state.items[0]

  const firstRun = lifecycle.onItemAction(item)
  await streamStarted
  await Promise.resolve()

  const duplicate = await lifecycle.onItemAction(item)
  assert.equal(duplicate.success, false)
  assert.equal(duplicate.status, 'blocked')
  assert.equal(duplicate.reason, 'dictation-in-progress')
  assert.equal(streamStarts, 1)

  // Partial render failure must not reject unhandled
  await capturedOptions.onData({ type: 'partial', text: 'testing resilience' })
  assert.equal(state.logs.includes('[touch-dictation] recording status update failed'), true)

  lifecycle.onDestroy()
  const settled = await firstRun
  assert.equal(cancelled, true)
  assert.equal(settled.success, false)
  assert.equal(settled.status, 'cancelled')
  assert.equal(settled.reason, 'cancelled')
})

test('wraps onFeatureTriggered errors safely instead of rejecting uncaught', async () => {
  let clearCalls = 0
  const { lifecycle, state } = createHarness({
    feature: {
      async clearItems() {
        clearCalls += 1
        if (clearCalls === 1)
          throw new Error('transient clear error')
        state.items = []
      },
    },
  })

  assert.equal(await lifecycle.onFeatureTriggered('dictate', { text: '' }), true)
  assert.equal(state.items[0].id, 'dictate-error')
  assert.equal(state.logs.includes('[touch-dictation] feature-trigger-failed'), true)
})
