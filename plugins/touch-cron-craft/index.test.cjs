const assert = require('node:assert/strict')
const test = require('node:test')

class MockTuffItemBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [], render: { mode: 'default', basic: {} } }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.title = title
    this.item.render.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.subtitle = subtitle
    this.item.render.basic.subtitle = subtitle
    return this
  }

  setDescription(description) {
    this.item.description = description
    this.item.render.basic.description = description
    return this
  }

  setAccessory(accessory) {
    this.item.accessory = accessory
    this.item.render.basic.accessory = accessory
    return this
  }

  setIcon(icon) {
    this.item.icon = icon
    this.item.render.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, primary: this.item.actions.length === 0, payload })
    return this
  }

  build() {
    return this.item
  }
}

function createHarness(overrides = {}) {
  const pushedBatches = []
  let clearedCount = 0
  const clipboardWrites = []

  globalThis.TuffItemBuilder = MockTuffItemBuilder
  globalThis.logger = { info() {}, warn() {}, error() {} }
  globalThis.plugin = {
    feature: {
      async clearItems() {
        clearedCount += 1
      },
      async pushItems(items) {
        pushedBatches.push(items)
      },
      ...overrides.feature,
    },
  }
  globalThis.permission = 'permission' in overrides
    ? overrides.permission
    : {
        async check(id) {
          return id === 'clipboard.write'
        },
      }
  globalThis.clipboard = 'clipboard' in overrides
    ? overrides.clipboard
    : {
        async writeText(text) {
          clipboardWrites.push(text)
        },
      }

  delete require.cache[require.resolve('./index.js')]
  const mod = require('./index.js')
  delete require.cache[require.resolve('./index.js')]

  return {
    mod,
    get pushed() {
      return pushedBatches.at(-1) || []
    },
    pushedBatches,
    get clearedCount() {
      return clearedCount
    },
    clipboardWrites,
  }
}

test('empty query shows guide and curated cron presets with next run previews', async () => {
  const h = createHarness()
  const ok = await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron',
    now: '2026-11-23T10:00:00Z',
  })
  assert.equal(ok, true)
  assert.equal(h.clearedCount, 1)
  assert.equal(h.pushed[0].id, 'cron-craft-guide')
  assert.ok(h.pushed.length >= 10)
  assert.ok(h.pushed[1].actions.every(a => a.type === 'plugin'))
})

test('parses 5-field cron expression and computes exact next 10 UTC run timestamps', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron */15 9-10 * * 1-5 utc',
    now: '2026-11-23T09:10:00Z', // Monday
  })

  const exprCard = h.pushed.find(i => i.id === 'cron-craft-expression')
  assert.ok(exprCard)
  assert.match(exprCard.title, /\*\/15 9-10 \* \* 1-5/)
  assert.match(exprCard.title, /Every 15 minutes/)
  assert.match(exprCard.subtitle, /周一至周五/)

  const primaryRuns = h.pushed.find(i => i.id === 'cron-craft-runs-primary')
  assert.ok(primaryRuns)
  const lines = primaryRuns.actions[0].payload.text.split('\n')
  assert.equal(lines.length, 10)
  assert.equal(lines[0], '1. 2026-11-23 09:15 UTC (Mon)')
  assert.equal(lines[1], '2. 2026-11-23 09:30 UTC (Mon)')
  assert.equal(lines[2], '3. 2026-11-23 09:45 UTC (Mon)')
  assert.equal(lines[3], '4. 2026-11-23 10:00 UTC (Mon)')
  assert.equal(lines[7], '8. 2026-11-24 09:00 UTC (Tue)')
})

test('supports @daily, @hourly, @weekly aliases and @reboot special handling', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron @weekly utc',
    now: '2026-11-23T12:00:00Z', // Monday Nov 23, next Sunday is Nov 29
  })

  const exprCard = h.pushed.find(i => i.id === 'cron-craft-expression')
  assert.ok(exprCard)
  assert.equal(exprCard.actions[0].payload.text, '0 0 * * 0')
  const run1 = h.pushed.find(i => i.id === 'cron-craft-run-1')
  assert.ok(run1)
  assert.equal(run1.actions[0].payload.text, '2026-11-29T00:00:00.000Z')

  await h.mod.onFeatureTriggered('cron-craft', { text: 'cron @reboot' })
  const rebootCard = h.pushed.find(i => i.id === 'cron-craft-reboot')
  assert.ok(rebootCard)
  assert.equal(rebootCard.actions[0].payload.text, '@reboot')
})

test('handles leap-year Feb 29 schedule and impossible calendar dates like Feb 30 cleanly', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron 0 0 29 2 * utc',
    now: '2026-01-01T00:00:00Z',
  })
  const run1 = h.pushed.find(i => i.id === 'cron-craft-run-1')
  const run2 = h.pushed.find(i => i.id === 'cron-craft-run-2')
  assert.ok(run1 && run2)
  assert.equal(run1.actions[0].payload.text, '2028-02-29T00:00:00.000Z')
  assert.equal(run2.actions[0].payload.text, '2032-02-29T00:00:00.000Z')

  await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron 0 0 30 2 * utc',
    now: '2026-01-01T00:00:00Z',
  })
  const emptyCard = h.pushed.find(i => i.id === 'cron-craft-no-runs')
  assert.ok(emptyCard)
})

test('supports named months, named weekdays, Sunday=7, and FRI-SUN wrap range', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron 0 8 * JAN,DEC FRI-SUN utc',
    now: '2026-12-01T00:00:00Z', // Dec 1 2026 is Tuesday -> Dec 4 is Friday
  })

  const run1 = h.pushed.find(i => i.id === 'cron-craft-run-1')
  const run2 = h.pushed.find(i => i.id === 'cron-craft-run-2')
  const run3 = h.pushed.find(i => i.id === 'cron-craft-run-3')
  assert.equal(run1.actions[0].payload.text, '2026-12-04T08:00:00.000Z')
  assert.equal(run2.actions[0].payload.text, '2026-12-05T08:00:00.000Z')
  assert.equal(run3.actions[0].payload.text, '2026-12-06T08:00:00.000Z')
})

test('reverse generator converts English and Chinese phrases into accurate cron schedules', async () => {
  const h = createHarness()
  const cases = [
    ['every 15 minutes on weekdays', '*/15 * * * 1-5'],
    ['every weekday at 9:30 am', '30 9 * * 1-5'],
    ['every mon,wed,fri at 8:30', '30 8 * * 1,3,5'],
    ['monthly on 15th at 2pm', '0 14 15 * *'],
    ['每5分钟', '*/5 * * * *'],
    ['每天早上9点半', '30 9 * * *'],
    ['每天下午3点15分', '15 15 * * *'],
    ['工作日 9:30', '30 9 * * 1-5'],
    ['每周一三五 8:30', '30 8 * * 1,3,5'],
    ['每月15日 9:30', '30 9 15 * *'],
  ]

  for (const [phrase, expectedExpr] of cases) {
    await h.mod.onFeatureTriggered('cron-craft', {
      text: `cron ${phrase}`,
      now: '2026-11-23T08:00:00Z',
    })
    const card = h.pushed.find(i => i.id === 'cron-craft-expression')
    assert.ok(card, `Expected expression card for "${phrase}"`)
    assert.equal(card.actions[0].payload.text, expectedExpr, `Mismatch for "${phrase}"`)
  }
})

test('rejects invalid cron fields with clear diagnostic card', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('cron-craft', { text: 'cron 65 * * * *' })
  const errCard = h.pushed.find(i => i.id === 'cron-craft-invalid')
  assert.ok(errCard)
  assert.match(errCard.subtitle, /out of range/i)

  await h.mod.onFeatureTriggered('cron-craft', { text: 'cron * * * *' })
  const fieldErr = h.pushed.find(i => i.id === 'cron-craft-invalid')
  assert.ok(fieldErr)
  assert.match(fieldErr.subtitle, /Expected 5 fields/i)
})

test('onItemAction routes context.actionId cleanly for cron, crontab, GHA YAML, and runs', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('cron-craft', {
    text: 'cron 0 9 * * 1-5 utc',
    now: '2026-11-23T08:00:00Z',
  })

  const exprCard = h.pushed.find(i => i.id === 'cron-craft-expression')
  const rCron = await h.mod.onItemAction(exprCard, { actionId: 'copy-cron' })
  const rGha = await h.mod.onItemAction(exprCard, { actionId: 'copy-gha' })
  const rCrontab = await h.mod.onItemAction(exprCard, { actionId: 'copy-crontab' })

  assert.equal(rCron.status, 'started')
  assert.equal(rGha.status, 'started')
  assert.equal(rCrontab.status, 'started')
  assert.equal(h.clipboardWrites[0], '0 9 * * 1-5')
  assert.match(h.clipboardWrites[1], /cron: '0 9 \* \* 1-5'/)
  assert.match(h.clipboardWrites[2], /^0 9 \* \* 1-5 /)

  const bad = await h.mod.onItemAction(exprCard, { actionId: 'unknown-action' })
  assert.equal(bad.status, 'blocked')
  assert.equal(bad.reason, 'invalid-action')
})

test('fail-closed permission and capability guards emit canonical blocked reasons', async () => {
  const base = createHarness()
  await base.mod.onFeatureTriggered('cron-craft', { text: 'cron @daily', now: '2026-11-23T08:00:00Z' })
  const card = base.pushed.find(i => i.id === 'cron-craft-expression')

  const denied = createHarness({ permission: { async check() { return false } } })
  const r1 = await denied.mod.onItemAction(card, { actionId: 'copy-cron' })
  assert.equal(r1.status, 'blocked')
  assert.equal(r1.reason, 'permission-denied')
  assert.equal(denied.clipboardWrites.length, 0)

  const noSdk = createHarness({ permission: undefined })
  const r2 = await noSdk.mod.onItemAction(card, { actionId: 'copy-cron' })
  assert.equal(r2.status, 'blocked')
  assert.equal(r2.reason, 'permission-sdk-unavailable')

  const unavail = createHarness({
    permission: {
      async check() {
        const err = new Error('svc down')
        err.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
        throw err
      },
    },
  })
  const r3 = await unavail.mod.onItemAction(card, { actionId: 'copy-cron' })
  assert.equal(r3.status, 'blocked')
  assert.equal(r3.reason, 'permission-unavailable')

  const checkFail = createHarness({
    permission: {
      async check() {
        throw new Error('unexpected')
      },
    },
  })
  const r4 = await checkFail.mod.onItemAction(card, { actionId: 'copy-cron' })
  assert.equal(r4.status, 'blocked')
  assert.equal(r4.reason, 'permission-check-failed')

  const noClip = createHarness({ clipboard: {} })
  const r5 = await noClip.mod.onItemAction(card, { actionId: 'copy-cron' })
  assert.equal(r5.status, 'blocked')
  assert.equal(r5.reason, 'capability-unavailable')
})

test('trigger generation guard and onDestroy suppress stale async publishes', async () => {
  let releaseFirst
  let calls = 0
  const gate = new Promise((resolve) => {
    releaseFirst = resolve
  })

  const h = createHarness({
    feature: {
      async clearItems() {
        calls += 1
        if (calls === 1) {
          await gate
        }
      },
      async pushItems(items) {
        h.pushedBatches.push(items)
      },
    },
  })

  const pending = h.mod.onFeatureTriggered('cron-craft', { text: 'cron @daily' })
  await Promise.resolve()
  h.mod.onDestroy()
  releaseFirst()
  await pending

  assert.equal(h.pushedBatches.length, 0)
  assert.deepEqual(Object.keys(h.mod).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
})
