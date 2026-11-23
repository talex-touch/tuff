const assert = require('node:assert/strict')
const test = require('node:test')

class MockItemBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.item.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, title, payload) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

function setupHarness(overrides = {}) {
  const state = {
    pushed: [],
    clears: 0,
    clipboardWrites: [],
    permissionChecks: [],
    aiCalls: [],
  }

  globalThis.TuffItemBuilder = MockItemBuilder
  globalThis.logger = { info() {}, warn() {}, error() {} }
  globalThis.plugin = {
    feature: {
      async clearItems() {
        state.clears += 1
        state.pushed = []
      },
      async pushItems(items) {
        state.pushed = items
      },
      ...overrides.feature,
    },
  }
  globalThis.clipboard = Object.prototype.hasOwnProperty.call(overrides, 'clipboard')
    ? overrides.clipboard
    : {
        async writeText(text) {
          state.clipboardWrites.push(text)
        },
      }
  globalThis.permission = Object.prototype.hasOwnProperty.call(overrides, 'permission')
    ? overrides.permission
    : {
        async check(id) {
          state.permissionChecks.push(id)
          return true
        },
      }
  globalThis.intelligence = Object.prototype.hasOwnProperty.call(overrides, 'intelligence')
    ? overrides.intelligence
    : {
        text: {
          async chat(payload) {
            state.aiCalls.push(payload)
            return {
              result: '```mermaid\nflowchart LR\n  A["Order"] --> B["Stripe"]\n```',
            }
          },
        },
      }

  delete require.cache[require.resolve('./index.js')]
  const mod = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { mod, state }
}

test('exposes 16+ production templates covering Flowchart, Sequence, ER, State, Class, Architecture, and GitGraph', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('diagram-sketch', '')

  const templateItems = state.pushed.filter(item => item.id.startsWith('diagram-sketch-tpl-'))
  assert.ok(templateItems.length >= 16, `expected >= 16 templates, got ${templateItems.length}`)

  const categories = new Set(templateItems.map(item => /\[([^\]]+)\]$/.exec(item.title)?.[1]))
  for (const required of ['flowchart', 'sequence', 'er', 'state', 'class', 'architecture', 'gitgraph']) {
    assert.ok(categories.has(required), `missing template category: ${required}`)
  }

  for (const item of templateItems) {
    const actionIds = item.actions.map(a => a.id)
    assert.deepEqual(actionIds, ['copy-mermaid', 'copy-markdown', 'copy-ascii'])
    assert.ok(item.actions[0].payload.text.length > 10)
    assert.match(item.actions[1].payload.text, /^```mermaid\n[\s\S]+\n```$/)
    assert.match(item.actions[2].payload.text, /[┌│└●]/)
  }
})

test('compiles arrow shorthand "Client -> API -> DB" to Mermaid flowchart, sequence, Markdown, and Unicode ASCII', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('diagram-sketch', 'diagram Client -> API -> DB')

  const mmdItem = state.pushed.find(i => i.id === 'diagram-sketch-compiled-mermaid')
  const asciiItem = state.pushed.find(i => i.id === 'diagram-sketch-compiled-ascii')
  const mdItem = state.pushed.find(i => i.id === 'diagram-sketch-compiled-markdown')
  const altItem = state.pushed.find(i => i.id === 'diagram-sketch-compiled-alt')

  assert.ok(mmdItem)
  assert.equal(
    mmdItem.actions[0].payload.text,
    [
      'flowchart LR',
      '  N1["Client"]',
      '  N2["API"]',
      '  N3["DB"]',
      '  N1 --> N2',
      '  N2 --> N3',
    ].join('\n'),
  )

  const ascii = asciiItem.actions[0].payload.text
  assert.match(ascii, /┌────────┐.*┌─────┐.*┌────┐/)
  assert.match(ascii, /│ Client │.*──▶.*│ API │.*──▶.*│ DB │/)
  assert.match(ascii, /└────────┘.*└─────┘.*└────┘/)

  assert.match(mdItem.actions[0].payload.text, /^```mermaid\nflowchart LR/)
  assert.match(altItem.actions[0].payload.text, /^sequenceDiagram\n  participant N1 as Client/)
})

test('compiles multi-branch arrows with labels, dashed/thick/bidirectional edges, and CJK alignment', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('diagram-sketch', '客户端 -> 网关 : HTTPS => 服务 --> 缓存; 网关 <-> 鉴权')

  const mmd = state.pushed.find(i => i.id === 'diagram-sketch-compiled-mermaid').actions[0].payload.text
  assert.match(mmd, /N1\["客户端"\]/)
  assert.match(mmd, /N2\["网关"\]/)
  assert.match(mmd, /N1 --> N2/)
  assert.match(mmd, /N2 ==>\|"HTTPS"\| N3/)
  assert.match(mmd, /N3 -.-> N4/)
  assert.match(mmd, /N2 <--> N5/)

  const ascii = state.pushed.find(i => i.id === 'diagram-sketch-compiled-ascii').actions[0].payload.text
  assert.match(ascii, /│ 客户端 │/)
  assert.match(ascii, /HTTPS/)
  assert.match(ascii, /══▶/)
  assert.match(ascii, /╌╌▶/)
  assert.match(ascii, /◀─+▶/)
})

test('supports td: top-down vertical ASCII and seq: primary Sequence compilation', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('diagram-sketch', 'td: Trigger -> Build -> Deploy')
  const tdMmd = state.pushed.find(i => i.id === 'diagram-sketch-compiled-mermaid').actions[0].payload.text
  const tdAscii = state.pushed.find(i => i.id === 'diagram-sketch-compiled-ascii').actions[0].payload.text
  assert.match(tdMmd, /^flowchart TD\n/)
  assert.match(tdAscii, /▼/)
  assert.match(tdAscii, /│ Build │/)

  await mod.onFeatureTriggered('diagram-sketch', 'seq: Web -> API : POST /orders -> Queue')
  const seqMmd = state.pushed.find(i => i.id === 'diagram-sketch-compiled-mermaid').actions[0].payload.text
  assert.match(seqMmd, /^sequenceDiagram\n/)
  assert.match(seqMmd, /N2->>N3: POST \/orders/)
})

test('honors context.actionId for copying Mermaid, Markdown, and ASCII variants', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('diagram-sketch', 'diagram oauth')
  const oauthItem = state.pushed.find(i => i.id === 'diagram-sketch-tpl-oauth-flow')
  assert.ok(oauthItem)

  const resMermaid = await mod.onItemAction(oauthItem, { actionId: 'copy-mermaid' })
  assert.equal(resMermaid.status, 'completed')
  assert.match(state.clipboardWrites[0], /^flowchart LR/)

  const resMd = await mod.onItemAction(oauthItem, { actionId: 'copy-markdown' })
  assert.equal(resMd.status, 'completed')
  assert.match(state.clipboardWrites[1], /^```mermaid\n/)

  const resAscii = await mod.onItemAction(oauthItem, { actionId: 'copy-ascii' })
  assert.equal(resAscii.status, 'completed')
  assert.match(state.clipboardWrites[2], /┌──────────────┐/)
})

test('display-time AI offer performs non-mutating permission check only and never invokes AI during typing', async () => {
  const { mod, state } = setupHarness({
    permission: {
      async check(id) {
        state.permissionChecks.push(id)
        return false
      },
    },
  })

  await mod.onFeatureTriggered('diagram-sketch', 'diagram ai user checkout with stripe webhook')
  assert.equal(state.aiCalls.length, 0)
  assert.ok(state.permissionChecks.includes('intelligence.basic'))
  const aiItem = state.pushed.find(i => i.id === 'diagram-sketch-ai-generate')
  assert.ok(aiItem)
  assert.match(aiItem.subtitle, /intelligence\.basic/)
  assert.match(aiItem.subtitle, /permission-denied/)
})

test('executes intelligence.basic natural-language-to-Mermaid when permitted and extracts clean Mermaid', async () => {
  const { mod, state } = setupHarness()
  await mod.onFeatureTriggered('diagram-sketch', 'diagram ai order checkout with stripe')
  const aiItem = state.pushed.find(i => i.id === 'diagram-sketch-ai-generate')

  const result = await mod.onItemAction(aiItem, { actionId: 'ai-generate-copy' })
  assert.equal(result.success, true)
  assert.equal(result.status, 'completed')
  assert.equal(result.mermaid, 'flowchart LR\n  A["Order"] --> B["Stripe"]')
  assert.equal(state.aiCalls.length, 1)
  assert.equal(state.clipboardWrites[0], 'flowchart LR\n  A["Order"] --> B["Stripe"]')
  assert.ok(state.pushed.some(i => i.id === 'diagram-sketch-ai-result-mermaid'))
})

test('fails closed on intelligence.basic when permission is denied, missing, throws, or capability unavailable', async () => {
  // 1. Denied
  {
    const { mod, state } = setupHarness({
      permission: { async check() { return false } },
    })
    await mod.onFeatureTriggered('diagram-sketch', 'ai login flow')
    const aiItem = state.pushed.find(i => i.id === 'diagram-sketch-ai-generate')
    const res = await mod.onItemAction(aiItem, { actionId: 'ai-generate' })
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-denied')
    assert.equal(state.aiCalls.length, 0)
  }

  // 2. Permission SDK missing
  {
    const { mod, state } = setupHarness({ permission: undefined })
    await mod.onFeatureTriggered('diagram-sketch', 'ai login flow')
    const aiItem = state.pushed.find(i => i.id === 'diagram-sketch-ai-generate')
    const res = await mod.onItemAction(aiItem, { actionId: 'ai-generate' })
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-sdk-unavailable')
    assert.equal(state.aiCalls.length, 0)
  }

  // 3. Intelligence capability unavailable
  {
    const { mod, state } = setupHarness({ intelligence: undefined })
    await mod.onFeatureTriggered('diagram-sketch', 'ai login flow')
    const aiItem = state.pushed.find(i => i.id === 'diagram-sketch-ai-generate')
    const res = await mod.onItemAction(aiItem, { actionId: 'ai-generate' })
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'capability-unavailable')
  }

  // 4. Host timeout mapped cleanly without leaking internal errors
  {
    const { mod, state } = setupHarness({
      intelligence: {
        text: {
          async chat() {
            const err = new Error('/internal/token-leak timeout')
            err.code = 'PLUGIN_HOST_CAPABILITY_TIMEOUT'
            throw err
          },
        },
      },
    })
    await mod.onFeatureTriggered('diagram-sketch', 'ai login flow')
    const aiItem = state.pushed.find(i => i.id === 'diagram-sketch-ai-generate')
    const res = await mod.onItemAction(aiItem, { actionId: 'ai-generate' })
    assert.equal(res.status, 'failed')
    assert.equal(res.reason, 'timeout')
    assert.doesNotMatch(JSON.stringify(res), /token-leak/)
  }
})

test('fails closed on clipboard copy when clipboard.write is denied or clipboard is missing', async () => {
  {
    const { mod, state } = setupHarness({
      permission: { async check() { return false } },
    })
    await mod.onFeatureTriggered('diagram-sketch', 'Client -> API')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'permission-denied')
    assert.equal(state.clipboardWrites.length, 0)
  }

  {
    const { mod, state } = setupHarness({ clipboard: {} })
    await mod.onFeatureTriggered('diagram-sketch', 'Client -> API')
    const res = await mod.onItemAction(state.pushed[0])
    assert.equal(res.status, 'blocked')
    assert.equal(res.reason, 'clipboard-unavailable')
  }
})

test('guards against stale trigger generations and halts publishing on onDestroy()', async () => {
  let releaseFirstClear
  let firstClearEntered
  const firstEntered = new Promise((resolve) => {
    firstClearEntered = resolve
  })
  let clearCount = 0
  const batches = []

  const { mod } = setupHarness({
    feature: {
      async clearItems() {
        clearCount += 1
        if (clearCount === 1) {
          firstClearEntered()
          await new Promise((resolve) => {
            releaseFirstClear = resolve
          })
        }
      },
      async pushItems(items) {
        batches.push(items)
      },
    },
  })

  const first = mod.onFeatureTriggered('diagram-sketch', 'A -> B')
  await firstEntered
  const second = mod.onFeatureTriggered('diagram-sketch', 'X -> Y -> Z')
  await second
  releaseFirstClear()
  assert.equal(await first, false)
  assert.equal(batches.length, 1)
  assert.match(batches[0][0].actions[0].payload.text, /X/)

  let releaseDestroy
  let destroyClearEntered
  const destroyEntered = new Promise((resolve) => {
    destroyClearEntered = resolve
  })
  const { mod: mod2 } = setupHarness({
    feature: {
      async clearItems() {
        destroyClearEntered()
        await new Promise((resolve) => {
          releaseDestroy = resolve
        })
      },
      async pushItems() {
        throw new Error('should not push after onDestroy')
      },
    },
  })
  const pending = mod2.onFeatureTriggered('diagram-sketch', 'A -> B')
  await destroyEntered
  await mod2.onDestroy()
  releaseDestroy()
  assert.equal(await pending, false)
})

test('strips ascii-diagram and box-diagram manifest command prefixes cleanly', async () => {
  const { mod, state } = setupHarness()

  await mod.onFeatureTriggered('diagram-sketch', 'ascii-diagram')
  assert.ok(state.pushed.some(item => item.id.startsWith('diagram-sketch-tpl-')))
  assert.equal(state.pushed.some(item => /AI 生成/.test(item.title || '')), false)

  await mod.onFeatureTriggered('diagram-sketch', 'box-diagram')
  assert.ok(state.pushed.some(item => item.id.startsWith('diagram-sketch-tpl-')))
  assert.equal(state.pushed.some(item => /AI 生成/.test(item.title || '')), false)

  await mod.onFeatureTriggered('diagram-sketch', 'ascii-diagram Client -> API')
  const mermaidAction = state.pushed[0]?.actions?.find(action => action.id === 'copy-mermaid')
  assert.ok(mermaidAction)
  assert.doesNotMatch(mermaidAction.payload.text, /ascii-diagram/)
  assert.match(mermaidAction.payload.text, /Client/)
  assert.match(mermaidAction.payload.text, /API/)
})
