import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import WebSocket from 'ws'

const endpoint = process.argv[2] ?? 'http://127.0.0.1:56176'
const outputDir = process.argv[3] ?? '/tmp/tuff-corebox-debug/evidence'
const artifactPrefix = process.argv[4] ?? 'corebox'
const firstQuery = process.argv[5] ?? 'corebox synthetic alpha'
const secondQuery = process.argv[6] ?? 'corebox synthetic beta'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function sanitize(value) {
  return String(value)
    .replaceAll(process.env.HOME || '', '<home>')
    .replace(/\/Users\/[^/]+/g, '<home>')
    .slice(0, 500)
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    const events = []
    let nextId = 1
    socket.once('error', reject)
    socket.once('open', () => {
      socket.off('error', reject)
      resolve({
        socket,
        events,
        send(method, params = {}) {
          return new Promise((resolveCall, rejectCall) => {
            const id = nextId++
            pending.set(id, { resolve: resolveCall, reject: rejectCall })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
      })
    })
    socket.on('message', raw => {
      const message = JSON.parse(String(raw))
      if (message.id) {
        const call = pending.get(message.id)
        if (!call) return
        pending.delete(message.id)
        if (message.error) call.reject(new Error(message.error.message))
        else call.resolve(message.result)
        return
      }
      if (message.method === 'Runtime.exceptionThrown') {
        events.push({
          type: 'exception',
          text: sanitize(message.params?.exceptionDetails?.text || 'Runtime exception'),
        })
      }
      if (message.method === 'Log.entryAdded') {
        const entry = message.params?.entry
        if (entry?.level === 'error' || entry?.level === 'warning') {
          events.push({ type: `log:${entry.level}`, text: sanitize(entry.text) })
        }
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        const type = message.params?.type
        if (type === 'error' || type === 'warning') {
          events.push({
            type: `console:${type}`,
            text: sanitize((message.params?.args || []).map(arg => arg.value ?? arg.description ?? arg.type).join(' ')),
          })
        }
      }
    })
  })
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Evaluation failed')
  }
  return result.result?.value
}

async function identifyCoreBoxTarget(targets) {
  for (const target of targets) {
    if (target.type !== 'page' || !target.webSocketDebuggerUrl) continue
    const client = await connect(target.webSocketDebuggerUrl)
    try {
      const identity = await evaluate(
        client,
        `(() => ({
          coreBox: document.body?.classList.contains('core-box') === true,
          divisionBox: document.body?.classList.contains('division-box') === true,
          width: innerWidth,
          height: innerHeight
        }))()`,
      )
      if (identity.coreBox && !identity.divisionBox) return target
    } finally {
      client.socket.close()
    }
  }
  throw new Error('CoreBox renderer target not found')
}

async function snapshot(client, label) {
  return evaluate(
    client,
    `(() => {
      const input = document.querySelector('input, textarea')
      const text = document.body?.innerText || ''
      return {
        label: ${JSON.stringify(label)},
        href: location.href,
        visibilityState: document.visibilityState,
        viewport: { width: innerWidth, height: innerHeight },
        activeTag: document.activeElement?.tagName?.toLowerCase() || null,
        input: input ? {
          valueLength: typeof input.value === 'string' ? input.value.length : 0,
          focused: document.activeElement === input,
          visible: Boolean(input.getClientRects().length)
        } : null,
        textLength: text.length,
        hasFirstQuery: text.includes(${JSON.stringify(firstQuery)}),
        hasSecondQuery: text.includes(${JSON.stringify(secondQuery)}),
        resultCount: document.querySelectorAll('.BoxItem, .BoxGridItem').length,
        activeResultCount: document.querySelectorAll('.BoxItem.is-active, .BoxGridItem.is-active').length,
        resultAreaVisible: Boolean(document.querySelector('.CoreBoxRes--visible')),
        noResults: /no results|暂无|无结果|not found/i.test(text),
        probe: window.__coreboxRuntimeProbe || null
      }
    })()`,
  )
}

async function invoke(client, eventName, payload) {
  return evaluate(
    client,
    `(async () => await window.electron.ipcRenderer.invoke(
      ${JSON.stringify(eventName)},
      ${JSON.stringify(payload)}
    ))()`,
  )
}

async function screenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  await writeFile(path.join(outputDir, filename), Buffer.from(result.data, 'base64'))
}

const targetsResponse = await fetch(`${endpoint}/json/list`, {
  signal: AbortSignal.timeout(5000),
})
const targets = await targetsResponse.json()
const target = await identifyCoreBoxTarget(targets)
const client = await connect(target.webSocketDebuggerUrl)
const output = {
  schema: 'corebox-cdp-runtime-probe/v1',
  target: { id: target.id, url: target.url },
  steps: [],
  invocations: {},
  errors: [],
}

try {
  await Promise.all([client.send('Runtime.enable'), client.send('Log.enable'), client.send('Page.enable')])

  await evaluate(
    client,
    `(() => {
      const state = window.__coreboxRuntimeProbe = {
        focusEvents: 0,
        blurEvents: 0,
        visibilityEvents: 0,
        mutationBatches: 0,
        inputEvents: 0,
        changeEvents: 0
      }
      addEventListener('focus', () => state.focusEvents += 1)
      addEventListener('blur', () => state.blurEvents += 1)
      document.addEventListener('visibilitychange', () => state.visibilityEvents += 1)
      document.addEventListener('input', () => state.inputEvents += 1, true)
      document.addEventListener('change', () => state.changeEvents += 1, true)
      new MutationObserver(() => state.mutationBatches += 1).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      })
      return state
    })()`,
  )

  output.steps.push(await snapshot(client, 'initial'))
  output.invocations.show = await invoke(client, 'core-box:ui:show', undefined)
  output.invocations.pinned = await invoke(client, 'core-box:ui:set-pinned', { pinned: true })
  output.invocations.boundsBefore = await invoke(client, 'core-box:layout:get-bounds', undefined)

  output.invocations.setFirstQuery = await invoke(client, 'core-box:input:set', {
    value: firstQuery,
  })
  await sleep(2500)
  output.steps.push(await snapshot(client, 'alpha-settled'))
  await screenshot(client, `${artifactPrefix}-alpha.png`)

  await Promise.all([
    invoke(client, 'core-box:input:set', { value: firstQuery }),
    invoke(client, 'core-box:input:set', { value: secondQuery }),
  ])
  await sleep(2500)
  output.steps.push(await snapshot(client, 'rapid-beta-settled'))
  await screenshot(client, `${artifactPrefix}-rapid-beta.png`)

  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown' })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown' })
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp' })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp' })

  output.invocations.clear = await invoke(client, 'core-box:input:clear', undefined)
  await sleep(1200)
  output.steps.push(await snapshot(client, 'cleared'))
  await screenshot(client, `${artifactPrefix}-cleared.png`)

  output.invocations.expand = await invoke(client, 'core-box:ui:expand', { length: 4 })
  await sleep(700)
  output.steps.push(await snapshot(client, 'expanded'))
  output.invocations.pinnedOff = await invoke(client, 'core-box:ui:set-pinned', { pinned: false })
  output.invocations.hide = await invoke(client, 'core-box:ui:hide', { immediate: true })
  await sleep(300)
  output.steps.push(await snapshot(client, 'hidden'))
  output.invocations.reshow = await invoke(client, 'core-box:ui:show', undefined)
  output.invocations.focus = await invoke(client, 'core-box:ui:focus-window', undefined)
  await sleep(700)
  output.invocations.boundsAfter = await invoke(client, 'core-box:layout:get-bounds', undefined)
  output.steps.push(await snapshot(client, 'reshown'))

  output.errors = client.events
} finally {
  client.socket.close()
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
