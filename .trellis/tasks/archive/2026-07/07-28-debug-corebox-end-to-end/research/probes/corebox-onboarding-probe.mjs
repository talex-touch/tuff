import process from 'node:process'
import WebSocket from 'ws'

const endpoint = process.argv[2] ?? 'http://127.0.0.1:56177'
const action = process.argv[3] ?? 'inspect'
const requestedLabels = process.argv.slice(4)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let nextId = 1
    socket.once('error', reject)
    socket.once('open', () =>
      resolve({
        socket,
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
      if (!message.id) return
      const pendingCall = pending.get(message.id)
      if (!pendingCall) return
      pending.delete(message.id)
      if (message.error) pendingCall.reject(new Error(message.error.message))
      else pendingCall.resolve(message.result)
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

async function findMainTarget(targets) {
  for (const target of targets) {
    if (target.type !== 'page' || !target.webSocketDebuggerUrl) continue
    const client = await connect(target.webSocketDebuggerUrl)
    try {
      const identity = await evaluate(
        client,
        `(() => ({
          coreBox: document.body?.classList.contains('core-box') === true,
          metaOverlay: document.body?.classList.contains('meta-overlay') === true,
          width: innerWidth,
          height: innerHeight
        }))()`,
      )
      if (!identity.coreBox && !identity.metaOverlay && identity.width >= 900) return target
    } finally {
      client.socket.close()
    }
  }
  throw new Error('Main settings target not found')
}

async function snapshot(client, label) {
  return evaluate(
    client,
    `(() => {
      const visible = (element) => Boolean(element.getClientRects().length)
      const text = document.body?.innerText || ''
      return {
        label: ${JSON.stringify(label)},
        textLength: text.length,
        tailText: text.slice(-1200),
        headings: [...document.querySelectorAll('h1,h2,h3,h4')]
          .filter(visible)
          .map((element) => element.innerText.trim())
          .filter(Boolean)
          .slice(-20),
        buttons: [...document.querySelectorAll('button')]
          .filter(visible)
          .map((element) => (element.innerText || element.getAttribute('aria-label') || '').trim())
          .filter(Boolean)
          .slice(-40),
        dialogs: [...document.querySelectorAll('[role="dialog"], dialog')]
          .filter(visible)
          .map((element) => ({ className: element.className, text: element.innerText.slice(0, 1000) })),
        actionCandidates: [...document.querySelectorAll('*')]
          .filter(visible)
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: (element.innerText || '').trim(),
            className: element.className,
            role: element.getAttribute('role')
          }))
          .filter((item) => item.text && item.text.length <= 80)
          .slice(-50)
      }
    })()`,
  )
}

async function clickButton(client, labels) {
  return evaluate(
    client,
    `(() => {
      const labels = ${JSON.stringify(labels)}
      const button = [...document.querySelectorAll('button')].find((element) => {
        if (!element.getClientRects().length || element.disabled) return false
        const text = (element.innerText || element.getAttribute('aria-label') || '').trim()
        return labels.includes(text)
      })
      if (!button) return null
      const text = (button.innerText || button.getAttribute('aria-label') || '').trim()
      button.click()
      return text
    })()`,
  )
}

async function clickAnyExactText(client, labels) {
  return evaluate(
    client,
    `(() => {
      const labels = ${JSON.stringify(labels)}
      const element = [...document.querySelectorAll('*')].find((candidate) => {
        if (!candidate.getClientRects().length) return false
        return labels.includes((candidate.innerText || '').trim())
      })
      if (!element) return null
      const text = (element.innerText || '').trim()
      element.click()
      return { text, tag: element.tagName.toLowerCase(), className: element.className }
    })()`,
  )
}

const targets = await (await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
const target = await findMainTarget(targets)
const client = await connect(target.webSocketDebuggerUrl)
const output = { target: target.id, action, steps: [] }
try {
  output.steps.push(await snapshot(client, 'before'))
  if (action === 'open') {
    output.clicked = await clickButton(client, ['Rerun'])
    await sleep(600)
    output.steps.push(await snapshot(client, 'opened'))
  } else if (action === 'click') {
    output.clicked = await clickButton(client, requestedLabels)
    await sleep(600)
    output.steps.push(await snapshot(client, 'clicked'))
  } else if (action === 'click-any') {
    output.clicked = await clickAnyExactText(client, requestedLabels)
    await sleep(600)
    output.steps.push(await snapshot(client, 'clicked-any'))
  }
} finally {
  client.socket.close()
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
