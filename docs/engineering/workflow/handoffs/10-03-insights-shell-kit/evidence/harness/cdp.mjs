#!/usr/bin/env node
// Minimal CDP client for the isolated Tuff dev instance used by this task's screenshot parity
// check. No dependencies: Node's global WebSocket is enough.
//
//   node cdp.mjs <port> list
//   node cdp.mjs <port> eval <urlMatch> <expression>
//   node cdp.mjs <port> evalfile <urlMatch> <file.js>
//   node cdp.mjs <port> shot <urlMatch> <out.png> [expression]
//   node cdp.mjs <port> reload <urlMatch>
//   node cdp.mjs <port> main                      # prints the main window's target id
//
// CDP_VIEWPORT=WxH[xDPR] pins the viewport for the whole session (eval, evalfile, shot), so a
// geometry read and a screenshot can be taken at exactly the same size in both phases. The
// override lives as long as the session, which is why `shot` takes its preparation expression as
// an argument instead of running it in a separate invocation.
// CDP_PRELUDE=<file.js> is evaluated at the start of every session (after the viewport), so the
// helpers it installs survive page reloads between steps.
//
// Every run carries a process-level timeout (CDP_TIMEOUT_MS, default 30s): an occluded window
// stops producing frames and `Page.captureScreenshot` would otherwise hang forever.
import { readFileSync, writeFileSync } from 'node:fs'

const TIMEOUT_MS = Number(process.env.CDP_TIMEOUT_MS || 30_000)
const SETTLE_MS = Number(process.env.CDP_SETTLE_MS || 1200)
const guard = setTimeout(() => {
  console.error(`[cdp] timed out after ${TIMEOUT_MS}ms`)
  process.exit(124)
}, TIMEOUT_MS)
guard.unref?.()

const [port, command, ...rest] = process.argv.slice(2)
if (!port || !command) {
  console.error('usage: cdp.mjs <port> <list|eval|evalfile|shot|reload> ...')
  process.exit(2)
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  return (await response.json()).filter((target) => target.type === 'page')
}

async function pick(match) {
  const all = await targets()
  // `id:<targetId>` pins one window exactly; anything else is a URL/title substring. The main
  // window and the meta overlay share a URL prefix, so captures always go by id.
  const found = match.startsWith('id:')
    ? all.filter((target) => target.id === match.slice(3))
    : all.filter((target) => target.url.includes(match) || target.title.includes(match))
  if (found.length === 0) throw new Error(`no page target matches ${JSON.stringify(match)}`)
  if (found.length > 1) {
    console.error(`[cdp] ${found.length} targets match, using the first: ${found[0].url}`)
  }
  return found[0]
}

function connect(target) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    let nextId = 1
    const pending = new Map()
    const listeners = new Set()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id && pending.has(message.id)) {
        const { resolve: done, reject: fail } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) fail(new Error(`${message.error.message} (${message.error.code})`))
        else done(message.result)
        return
      }
      for (const listener of listeners) listener(message)
    })
    socket.addEventListener('error', () => reject(new Error('websocket error')))
    socket.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const id = nextId++
          socket.send(JSON.stringify({ id, method, params }))
          return new Promise((done, fail) => pending.set(id, { resolve: done, reject: fail }))
        },
        once(method) {
          return new Promise((done) => {
            const listener = (message) => {
              if (message.method !== method) return
              listeners.delete(listener)
              done(message.params)
            }
            listeners.add(listener)
          })
        },
        close() {
          socket.close()
        }
      })
    )
  })
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text
    throw new Error(`evaluate threw: ${text}`)
  }
  return result.result.value
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function applyViewport(client) {
  const spec = process.env.CDP_VIEWPORT
  if (!spec) return
  const [width, height, dpr = '2'] = spec.split('x')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: Number(width),
    height: Number(height),
    deviceScaleFactor: Number(dpr),
    mobile: false
  })
  // Layout, resize observers and any devtools viewport-size overlay need a moment.
  await sleep(SETTLE_MS)
}

function print(value) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

async function prelude(client) {
  if (process.env.CDP_PRELUDE) await evaluate(client, readFileSync(process.env.CDP_PRELUDE, 'utf8'))
}

async function main() {
  if (command === 'list') {
    const all = await targets()
    print(all.map(({ id, title, url }) => ({ id, title, url })))
    return
  }
  if (command === 'main') {
    // The main window: an app route (hash) that is not the meta overlay. CoreBox has no hash.
    const all = (await targets()).filter(
      (target) => target.url.startsWith('http') && target.url.includes('/#/') && !target.url.includes('meta-overlay')
    )
    if (all.length !== 1) throw new Error(`expected one main window, found ${all.length}: ${all.map((t) => t.url).join(', ')}`)
    console.log(all[0].id)
    return
  }

  const target = await pick(rest[0])
  const client = await connect(target)
  try {
    if (command === 'eval' || command === 'evalfile') {
      await applyViewport(client)
      await prelude(client)
      const source = command === 'eval' ? rest[1] : readFileSync(rest[1], 'utf8')
      print(await evaluate(client, source))
    } else if (command === 'shot') {
      const [, out, prepare] = rest
      await applyViewport(client)
      await prelude(client)
      if (prepare) {
        print(await evaluate(client, prepare))
        await sleep(SETTLE_MS)
      }
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(out, Buffer.from(data, 'base64'))
      console.log(`wrote ${out}`)
    } else if (command === 'reload') {
      await client.send('Page.enable')
      const loaded = client.once('Page.loadEventFired')
      await client.send('Page.reload', { ignoreCache: false })
      await loaded
      console.log('reloaded')
    } else {
      throw new Error(`unknown command ${command}`)
    }
  } finally {
    client.close()
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`[cdp] ${error.message}`)
    process.exit(1)
  })
