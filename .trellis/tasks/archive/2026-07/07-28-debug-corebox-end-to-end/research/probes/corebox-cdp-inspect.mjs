import { createHash } from 'node:crypto'
import process from 'node:process'
import WebSocket from 'ws'

const endpoint = process.argv[2] ?? 'http://127.0.0.1:56176'

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    let nextId = 1
    socket.once('error', reject)
    socket.once('open', () => {
      socket.off('error', reject)
      resolve({
        socket,
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
      if (!message.id) return
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      if (message.error) call.reject(new Error(message.error.message))
      else call.resolve(message.result)
    })
  })
}

async function inspect(target) {
  const client = await connect(target.webSocketDebuggerUrl)
  try {
    await client.send('Runtime.enable')
    const evaluation = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const text = document.body?.innerText || ''
        return {
          href: location.href,
          readyState: document.readyState,
          title: document.title,
          bodyClasses: [...(document.body?.classList || [])],
          viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
          textLength: text.length,
          textPreview: text.slice(0, 320),
          hasIpcInvoke: Boolean(window.electron?.ipcRenderer?.invoke),
          hasRouter: Boolean(window.__VUE_ROUTER__?.push),
          inputs: [...document.querySelectorAll('input, textarea')].slice(0, 20).map((element) => ({
            tag: element.tagName.toLowerCase(),
            type: element.getAttribute('type'),
            placeholder: element.getAttribute('placeholder'),
            ariaLabel: element.getAttribute('aria-label'),
            className: element.className,
            valueLength: typeof element.value === 'string' ? element.value.length : 0,
            visible: Boolean(element.getClientRects().length)
          })),
          buttons: [...document.querySelectorAll('button')].slice(0, 30).map((element) => ({
            text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 80),
            ariaLabel: element.getAttribute('aria-label'),
            className: element.className,
            visible: Boolean(element.getClientRects().length)
          }))
        }
      })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    const snapshot = evaluation.result?.value ?? null
    if (snapshot?.textPreview) {
      snapshot.textPreviewHash = createHash('sha256').update(snapshot.textPreview).digest('hex')
    }
    return snapshot
  } finally {
    client.socket.close()
  }
}

const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) })
const targets = await response.json()
const output = []
for (const target of targets) {
  if (target.type !== 'page' || !target.webSocketDebuggerUrl) continue
  try {
    output.push({ id: target.id, url: target.url, snapshot: await inspect(target) })
  } catch (error) {
    output.push({ id: target.id, url: target.url, error: String(error) })
  }
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
