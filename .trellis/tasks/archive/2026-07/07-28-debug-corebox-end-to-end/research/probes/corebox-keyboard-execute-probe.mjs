import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import WebSocket from 'ws'

const endpoint = process.argv[2] ?? 'http://127.0.0.1:56177'
const outputDir = process.argv[3] ?? '/tmp/tuff-corebox-debug/evidence'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    const events = []
    let nextId = 1
    socket.once('error', reject)
    socket.once('open', () =>
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
      }),
    )
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
          text:
            message.params?.exceptionDetails?.exception?.description ||
            message.params?.exceptionDetails?.text ||
            'Runtime exception',
        })
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
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
          divisionBox: document.body?.classList.contains('division-box') === true
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
    `(() => ({
      label: ${JSON.stringify(label)},
      visibilityState: document.visibilityState,
      viewport: { width: innerWidth, height: innerHeight },
      inputValueLength: document.querySelector('input, textarea')?.value?.length ?? 0,
      inputFocused: document.activeElement === document.querySelector('input, textarea'),
      resultCount: document.querySelectorAll('.BoxItem, .BoxGridItem').length,
      activeResultCount: document.querySelectorAll('.BoxItem.is-active, .BoxGridItem.is-active').length,
      resultAreaVisible: Boolean(document.querySelector('.CoreBoxRes--visible'))
    }))()`,
  )
}

const targets = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const target = await identifyCoreBoxTarget(targets)
const client = await connect(target.webSocketDebuggerUrl)
const output = { schema: 'corebox-keyboard-execute-probe/v1', target: target.id, steps: [] }

try {
  await Promise.all([client.send('Runtime.enable'), client.send('Page.enable')])
  const replayedExceptionCount = client.events.length
  await evaluate(
    client,
    `(() => {
      const input = document.querySelector('input, textarea')
      if (!input) throw new Error('CoreBox input not found')
      input.focus()
      return { valueLength: input.value?.length ?? 0 }
    })()`,
  )
  output.steps.push(await snapshot(client, 'focused-empty'))

  await client.send('Input.insertText', { text: 'show main window' })
  await sleep(2500)
  output.steps.push(await snapshot(client, 'keyboard-query-settled'))
  const image = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  await writeFile(path.join(outputDir, 'corebox-keyboard-main-window-result.png'), Buffer.from(image.data, 'base64'))

  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 36,
  })
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 36,
  })
  await sleep(1200)
  output.steps.push(await snapshot(client, 'executed'))
  output.replayedExceptionCount = replayedExceptionCount
  output.newExceptions = client.events.slice(replayedExceptionCount)
} finally {
  client.socket.close()
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
