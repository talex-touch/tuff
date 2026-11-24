const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

class FakeBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
    this.basic = {}
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    this.item.render = { mode: 'default', basic: { ...this.basic } }
    return this.item
  }
}

function createHarness(options = {}) {
  let currentNowMs = options.initialNowMs ?? new Date(2026, 10, 23, 10, 0, 0).getTime()
  const storageFiles = new Map(options.files || [])
  const grantedPermissions = new Set(
    options.permissions ?? ['storage.plugin', 'system.notification', 'clipboard.write'],
  )
  const state = {
    items: [],
    clipboardWrites: [],
    notifications: [],
  }

  class MockDate extends Date {
    constructor(...args) {
      if (args.length === 0)
        super(currentNowMs)
      else
        super(...args)
    }

    static now() {
      return currentNowMs
    }
  }

  const plugin = {
    storage: options.omitStorage
      ? undefined
      : {
          async getFile(name) {
            if (options.onGetFile)
              await options.onGetFile(name)
            return storageFiles.has(name) ? structuredClone(storageFiles.get(name)) : null
          },
          async setFile(name, value) {
            storageFiles.set(name, structuredClone(value))
          },
        },
    notification: options.omitNotification
      ? undefined
      : {
          async notify(payload) {
            if (options.failNotification)
              throw new Error('notification daemon unavailable')
            state.notifications.push(structuredClone(payload))
          },
        },
    feature: {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }

  const clipboard = options.omitClipboard
    ? undefined
    : {
        async writeText(text) {
          state.clipboardWrites.push(text)
        },
      }

  const permission = options.omitPermission
    ? undefined
    : {
        async check(permissionId) {
          if (options.failPermissionCheck)
            throw new Error('permission ipc error')
          return grantedPermissions.has(permissionId)
        },
      }

  const sandbox = {
    plugin,
    clipboard,
    permission,
    logger: {},
    TuffItemBuilder: FakeBuilder,
    Date: MockDate,
    Math,
    JSON,
    Map,
    Set,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox

  vm.runInNewContext(readFileSync(require.resolve('./index.js'), 'utf8'), sandbox, {
    filename: 'touch-pomodoro-zen/index.js',
  })

  return {
    module: sandbox.module.exports,
    state,
    storageFiles,
    grantedPermissions,
    advanceMs(ms) {
      currentNowMs += ms
    },
    setNowMs(ms) {
      currentNowMs = ms
    },
  }
}

test('exports only canonical lifecycle hooks and uses zero forbidden runtime globals', () => {
  const source = readFileSync(require.resolve('./index.js'), 'utf8')
  assert.doesNotMatch(source, /\brequire\s*\(/)
  assert.doesNotMatch(source, /\bprocess\b/)
  assert.doesNotMatch(source, /\bBuffer\b/)
  assert.doesNotMatch(source, /\beval\s*\(/)
  assert.doesNotMatch(source, /\bnew\s+Function\b/)
  assert.doesNotMatch(source, /\bfetch\s*\(/)

  const harness = createHarness()
  assert.deepEqual(Object.keys(harness.module).sort(), [
    'onDestroy',
    'onFeatureTriggered',
    'onItemAction',
  ])
})

test('starts presets (25/5, 50/10) and custom "pomo 15m Deep Work" with wall-clock persistence', async () => {
  const harness = createHarness()

  await harness.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  assert.ok(harness.state.items.some(i => i.id === 'pomodoro-zen-preset-classic-25-5'))
  assert.ok(harness.state.items.some(i => i.id === 'pomodoro-zen-preset-deep-50-10'))

  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'pomo 15m Deep Work' })
  const customItem = harness.state.items.find(i => i.id === 'pomodoro-zen-custom-start')
  assert.ok(customItem)
  assert.match(customItem.render.basic.title, /Start 15m Focus · Deep Work/)

  const startRes = await harness.module.onItemAction(customItem)
  assert.equal(startRes.success, true)
  assert.equal(startRes.status, 'started')

  const persisted = harness.storageFiles.get('pomodoro-state.json')
  assert.equal(persisted.active.status, 'running')
  assert.equal(persisted.active.label, 'Deep Work')
  assert.equal(persisted.active.durationSec, 900)
  assert.equal(persisted.active.endsAtMs - persisted.active.startedAtMs, 900 * 1000)

  // Advance wall clock by 5 minutes and verify remaining countdown
  harness.advanceMs(5 * 60 * 1000)
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  const runningItem = harness.state.items.find(i => i.id === 'pomodoro-zen-active-running')
  assert.ok(runningItem)
  assert.match(runningItem.render.basic.title, /10:00 left · Deep Work/)
})

test('supports pause, resume, and reset lifecycle preserving exact remaining seconds', async () => {
  const harness = createHarness()

  await harness.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  const preset25 = harness.state.items.find(i => i.id === 'pomodoro-zen-preset-classic-25-5')
  await harness.module.onItemAction(preset25)

  // Advance 10 minutes -> 15:00 left, then pause
  harness.advanceMs(10 * 60 * 1000)
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'pause' })
  const pauseItem = harness.state.items.find(i => i.id === 'pomodoro-zen-active-running')
  const pauseRes = await harness.module.onItemAction(pauseItem)
  assert.equal(pauseRes.status, 'paused')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').active.pausedRemainingSec, 900)

  // Wait 30 minutes while paused -> remaining time must NOT drift
  harness.advanceMs(30 * 60 * 1000)
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'resume' })
  const pausedItem = harness.state.items.find(i => i.id === 'pomodoro-zen-active-paused')
  assert.match(pausedItem.render.basic.title, /Paused · 15:00 left/)

  const resumeRes = await harness.module.onItemAction(pausedItem)
  assert.equal(resumeRes.status, 'resumed')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').active.status, 'running')

  // Reset returns cleanly to idle
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'reset' })
  const runningAfterResume = harness.state.items.find(i => i.id === 'pomodoro-zen-active-running')
  const resetRes = await harness.module.onItemAction(runningAfterResume, { actionId: 'reset-timer' })
  assert.equal(resetRes.status, 'reset')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').active.status, 'idle')
})

test('detects wall-clock completion, logs daily/weekly minutes & multi-day streak, and chains paired break', async () => {
  const harness = createHarness({
    initialNowMs: new Date(2026, 10, 23, 14, 0, 0).getTime(),
    files: [
      ['pomodoro-state.json', {
        active: { status: 'idle', mode: 'focus', label: '', durationSec: 1500, breakSec: 300 },
        history: {
          '2026-11-21': { focusMinutes: 50, sessions: 2, lastLabel: 'Deep Flow' },
          '2026-11-22': { focusMinutes: 25, sessions: 1, lastLabel: 'Classic Pomodoro' },
        },
        longestStreak: 2,
        alertsEnabled: true,
      }],
    ],
  })

  await harness.module.onFeatureTriggered('pomodoro-zen', { text: '50/10 Architecture' })
  await harness.module.onItemAction(harness.state.items.find(i => i.id === 'pomodoro-zen-custom-start'))

  // Advance past 50 minutes
  harness.advanceMs(51 * 60 * 1000)
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  const doneItem = harness.state.items.find(i => i.id === 'pomodoro-zen-active-done')
  assert.ok(doneItem)
  assert.match(doneItem.render.basic.title, /Claim \+50m "Architecture"/)

  // Complete and auto-chain 10m break via context.actionId
  const completeRes = await harness.module.onItemAction(doneItem, { actionId: 'complete-and-break' })
  assert.equal(completeRes.success, true)
  assert.equal(completeRes.status, 'completed')
  assert.match(completeRes.message, /Logged \+50m "Architecture" & started 10m break · Alert sent/)
  assert.equal(harness.state.notifications.length, 1)

  const persisted = harness.storageFiles.get('pomodoro-state.json')
  assert.equal(persisted.active.status, 'running')
  assert.equal(persisted.active.mode, 'break')
  assert.equal(persisted.active.durationSec, 600)
  assert.equal(persisted.history['2026-11-23'].focusMinutes, 50)
  assert.equal(persisted.longestStreak, 3)

  // Inspect stats view and copy Markdown report
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'stats' })
  const statsItem = harness.state.items.find(i => i.id === 'pomodoro-zen-stats-summary')
  assert.ok(statsItem)
  assert.match(statsItem.render.basic.title, /Today 50m \(1 sessions\) · 7d 125m · 🔥 3d streak/)

  const copyRes = await harness.module.onItemAction(statsItem)
  assert.equal(copyRes.status, 'copied')
  assert.match(harness.state.clipboardWrites[0], /Pomodoro Zen Focus Report \(2026-11-23\)/)
  assert.match(harness.state.clipboardWrites[0], /3 day\(s\) current · 3 day\(s\) best/)
})

test('provides all 4 guided micro-break cards with timed start and copyable routine steps', async () => {
  const harness = createHarness()
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'break' })

  const ids = harness.state.items.map(i => i.id)
  assert.ok(ids.includes('pomodoro-zen-break-eye-rest'))
  assert.ok(ids.includes('pomodoro-zen-break-hydrate'))
  assert.ok(ids.includes('pomodoro-zen-break-stretch'))
  assert.ok(ids.includes('pomodoro-zen-break-box-breathing'))

  const breathingItem = harness.state.items.find(i => i.id === 'pomodoro-zen-break-box-breathing')
  const copyGuide = await harness.module.onItemAction(breathingItem, { actionId: 'copy-guide' })
  assert.equal(copyGuide.status, 'copied')
  assert.match(harness.state.clipboardWrites[0], /4-4-4-4 Box Breathing/)
  assert.match(harness.state.clipboardWrites[0], /Inhale quietly through the nose for 4 seconds/)

  const eyeItem = harness.state.items.find(i => i.id === 'pomodoro-zen-break-eye-rest')
  const startBreak = await harness.module.onItemAction(eyeItem)
  assert.equal(startBreak.status, 'started')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').active.mode, 'break')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').active.durationSec, 20)
})

test('handles optional system.notification alerts fail-closed without blocking timer completion', async () => {
  const denied = createHarness({ permissions: ['storage.plugin', 'clipboard.write'] })
  await denied.module.onFeatureTriggered('pomodoro-zen', { text: 'stats' })
  const alertItem = denied.state.items.find(i => i.id === 'pomodoro-zen-alerts-control')

  // Explicit test-alert fails closed with permission-denied
  const testRes = await denied.module.onItemAction(alertItem, { actionId: 'test-alert' })
  assert.equal(testRes.status, 'blocked')
  assert.equal(testRes.reason, 'permission-denied')
  assert.equal(denied.state.notifications.length, 0)

  // Completing a focus session still succeeds and logs stats when notification permission is absent
  await denied.module.onFeatureTriggered('pomodoro-zen', { text: '15m Write Docs' })
  await denied.module.onItemAction(denied.state.items.find(i => i.id === 'pomodoro-zen-custom-start'))
  denied.advanceMs(15 * 60 * 1000)
  await denied.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  const completeRes = await denied.module.onItemAction(
    denied.state.items.find(i => i.id === 'pomodoro-zen-active-done'),
  )
  assert.equal(completeRes.success, true)
  assert.equal(completeRes.status, 'completed')
  assert.doesNotMatch(completeRes.message, /Alert sent/)
  assert.equal(denied.state.notifications.length, 0)

  // Missing notification capability returns capability-unavailable on explicit test
  const noBridge = createHarness({ omitNotification: true })
  await noBridge.module.onFeatureTriggered('pomodoro-zen', { text: 'stats' })
  const noBridgeRes = await noBridge.module.onItemAction(
    noBridge.state.items.find(i => i.id === 'pomodoro-zen-alerts-control'),
    { actionId: 'test-alert' },
  )
  assert.equal(noBridgeRes.status, 'blocked')
  assert.equal(noBridgeRes.reason, 'capability-unavailable')
})

test('fails closed on storage.plugin and clipboard.write permission denials and missing SDK', async () => {
  const noStoragePerm = createHarness({ permissions: ['clipboard.write'] })
  await noStoragePerm.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  const startBlocked = await noStoragePerm.module.onItemAction(
    noStoragePerm.state.items.find(i => i.id === 'pomodoro-zen-preset-classic-25-5'),
  )
  assert.equal(startBlocked.status, 'blocked')
  assert.equal(startBlocked.reason, 'permission-denied')

  const noPermSdk = createHarness({ omitPermission: true })
  await noPermSdk.module.onFeatureTriggered('pomodoro-zen', { text: '' })
  const sdkBlocked = await noPermSdk.module.onItemAction(
    noPermSdk.state.items.find(i => i.id === 'pomodoro-zen-preset-classic-25-5'),
  )
  assert.equal(sdkBlocked.status, 'blocked')
  assert.equal(sdkBlocked.reason, 'permission-sdk-unavailable')

  const noClipPerm = createHarness({ permissions: ['storage.plugin'] })
  await noClipPerm.module.onFeatureTriggered('pomodoro-zen', { text: 'stats' })
  const clipBlocked = await noClipPerm.module.onItemAction(
    noClipPerm.state.items.find(i => i.id === 'pomodoro-zen-stats-summary'),
  )
  assert.equal(clipBlocked.status, 'blocked')
  assert.equal(clipBlocked.reason, 'permission-denied')
})

test('toggles completion alerts preference in storage cleanly', async () => {
  const harness = createHarness()
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'stats' })
  const control = harness.state.items.find(i => i.id === 'pomodoro-zen-alerts-control')

  const r1 = await harness.module.onItemAction(control)
  assert.equal(r1.status, 'updated')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').alertsEnabled, false)

  await harness.module.onFeatureTriggered('pomodoro-zen', { text: 'stats' })
  const r2 = await harness.module.onItemAction(
    harness.state.items.find(i => i.id === 'pomodoro-zen-alerts-control'),
  )
  assert.equal(r2.status, 'updated')
  assert.equal(harness.storageFiles.get('pomodoro-state.json').alertsEnabled, true)
})

test('enforces trigger generation guard, clears issued actions on onDestroy(), and ignores foreign items', async () => {
  let releaseFirst
  let calls = 0
  const harness = createHarness({
    onGetFile: async () => {
      calls += 1
      if (calls === 1) {
        await new Promise((resolve) => {
          releaseFirst = resolve
        })
      }
    },
  })

  const slow = harness.module.onFeatureTriggered('pomodoro-zen', { text: '15m Slow Task' })
  await new Promise(resolve => setTimeout(resolve, 5))
  await harness.module.onFeatureTriggered('pomodoro-zen', { text: '30m Fast Task' })
  releaseFirst()
  await slow

  const customItem = harness.state.items.find(i => i.id === 'pomodoro-zen-custom-start')
  assert.ok(customItem)
  assert.match(customItem.render.basic.title, /Fast Task/)

  harness.module.onDestroy()
  const afterDestroy = await harness.module.onItemAction(customItem)
  assert.equal(afterDestroy.status, 'blocked')
  assert.equal(afterDestroy.reason, 'stale-request')

  const foreign = await harness.module.onItemAction({
    source: { type: 'plugin', id: 'other-plugin' },
    meta: { pluginName: 'other-plugin', featureId: 'other', defaultAction: 'start-focus' },
    actions: [{ id: 'start-focus', type: 'plugin', payload: { token: 'fake' } }],
  })
  assert.equal(foreign, undefined)
})
