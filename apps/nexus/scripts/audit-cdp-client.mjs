import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const cdpBaseUrl = process.env.TUFFEX_CDP_URL || 'http://127.0.0.1:9224'
export const docsBaseUrl = process.env.TUFFEX_DOCS_URL || 'http://127.0.0.1:8011'
export const auditDate = process.env.TUFFEX_AUDIT_DATE
  || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
export const reportDir = path.resolve(
  repoRoot,
  process.env.TUFFEX_AUDIT_OUT || `output/playwright/tuffex-component-audit/${auditDate}`,
)

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function cdpRequest(pathname, init) {
  const response = await globalThis.fetch(`${cdpBaseUrl}${pathname}`, init)
  if (!response.ok)
    throw new Error(`CDP request failed: ${response.status} ${await response.text()}`)
  return await response.json()
}

export async function createTarget(url) {
  return await cdpRequest(`/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })
}

export async function closeTarget(targetId) {
  await globalThis.fetch(`${cdpBaseUrl}/json/close/${targetId}`).catch(() => undefined)
}

export function createClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  let nextId = 1
  const pending = new Map()
  const listeners = new Map()

  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error)
        reject(new Error(JSON.stringify(message.error)))
      else
        resolve(message.result)
      return
    }

    const handlers = listeners.get(message.method)
    if (!handlers)
      return
    for (const handler of handlers)
      handler(message.params)
  }

  return {
    async send(method, params = {}) {
      await ready
      const id = nextId++
      ws.send(JSON.stringify({ id, method, params }))
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
      })
    },
    on(method, handler) {
      const handlers = listeners.get(method) || []
      handlers.push(handler)
      listeners.set(method, handlers)
    },
    close() {
      ws.close()
    },
  }
}

export async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })

  if (result.exceptionDetails) {
    const message = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || JSON.stringify(result.exceptionDetails)
    throw new Error(message)
  }

  return result.result.value
}

export async function waitFor(client, expression, timeoutMs = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await evaluate(client, `Boolean(${expression})`)
    if (ok)
      return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${expression}`)
}

export async function waitForPage(client) {
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('.vp-doc')`)
  await delay(250)
}

export async function setViewport(client, { width, height, mobile = false, deviceScaleFactor = 1 }) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor,
    mobile,
  })
}

export async function clickRect(client, rect) {
  const x = Math.round(rect.left + rect.width / 2)
  const y = Math.min(Math.round(rect.top + rect.height / 2), 895)
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

export function textMatcher(match) {
  if (match == null)
    return 'true'
  const normalized = JSON.stringify(String(match))
  return `(text === ${normalized} || text.includes(${normalized}))`
}

export async function elementRect(client, selector, options = {}) {
  const scope = JSON.stringify(options.scope || 'document')
  const selectorJson = JSON.stringify(selector)
  const matchExpr = textMatcher(options.text)
  const exact = options.exact ? 'true' : 'false'

  return await evaluate(client, `(() => {
    const scopeSelector = ${scope}
    const root = scopeSelector === 'document' ? document : document.querySelector(scopeSelector)
    if (!root)
      return null
    const elements = Array.from(root.querySelectorAll(${selectorJson}))
    const element = elements.find((candidate) => {
      const style = window.getComputedStyle(candidate)
      const rect = candidate.getBoundingClientRect()
      const visible = style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      const text = (candidate.innerText || candidate.textContent || '').trim().replace(/\\s+/g, ' ')
      if (!visible)
        return false
      if (${exact})
        return text === ${JSON.stringify(String(options.text ?? ''))}
      return ${matchExpr}
    })
    if (!element)
      return null
    element.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = element.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  })()`)
}

export async function clickElement(client, selector, options = {}) {
  let rect = await elementRect(client, selector, options)
  if (!rect) {
    await delay(250)
    rect = await elementRect(client, selector, options)
  }
  if (!rect)
    throw new Error(`Element not found: ${selector}`)
  await delay(80)
  rect = await elementRect(client, selector, options) || rect
  await clickRect(client, rect)
  await delay(options.afterMs ?? 250)
}

export async function pressKey(client, key) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key })
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key })
}

export async function typeIntoElement(client, selector, text, options = {}) {
  await clickElement(client, selector, { ...options, afterMs: 80 })
  await client.send('Input.insertText', { text })
  await delay(150)
}

export async function screenshot(client, name, screenshotDir, options = {}) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    ...options,
  })
  const filePath = path.join(screenshotDir, `${name}.png`)
  await writeFile(filePath, Buffer.from(result.data, 'base64'))
  return filePath
}

export function visibleText(selector, scope = 'document') {
  return `(() => {
    const root = ${JSON.stringify(scope)} === 'document' ? document : document.querySelector(${JSON.stringify(scope)})
    return root?.querySelector(${JSON.stringify(selector)})?.innerText?.trim() || ''
  })()`
}

export function collectPageEvents(client) {
  const consoleMessages = []
  const pageErrors = []
  const badResponses = []

  client.on('Runtime.consoleAPICalled', (params) => {
    const level = params.type
    const text = params.args?.map(arg => arg.value ?? arg.description ?? '').join(' ') || ''
    if (level === 'error' || level === 'warning')
      consoleMessages.push({ level, text })
  })
  client.on('Runtime.exceptionThrown', (params) => {
    pageErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Runtime exception')
  })
  client.on('Network.responseReceived', (params) => {
    const status = params.response?.status
    if (status >= 400)
      badResponses.push({ status, url: params.response.url })
  })

  return { consoleMessages, pageErrors, badResponses }
}
