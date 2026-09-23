// Verify the follow-up to the BUI parity commits in a real browser:
//   - the Flow suite gallery actually renders (it had no `flow` branch before),
//     and a dragged node stays where it was dropped (controlled write-back);
//   - the AI suite gallery carries an AgentScreen cell;
//   - both hubs link the three new components and carry a Flow section;
//   - the English docs use the Title Case headings the coverage contract reads.
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9231 node verify-hub-gallery.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  closeTarget, createClient, createTarget, delay, evaluate, setViewport, waitFor,
} from '../../../../apps/nexus/scripts/audit-cdp-client.mjs'

const OUT = process.env.OUT_DIR || '/tmp/tuff-ref/verify-hub-gallery'
const BASE = process.env.DOCS || 'http://localhost:3200'

async function open(docPath, readySelector) {
  const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
  const client = createClient(webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable', {})
  await client.send('Runtime.enable', {})
  // Docs pages ship `max-age=300, stale-while-revalidate=86400`, so a probe
  // profile keeps whatever it fetched first — including a copy served while the
  // dev server was still syncing content. Every read here must hit the server.
  await client.send('Network.enable', {})
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  await setViewport(client, { width: 1100, height: 900, deviceScaleFactor: 2 })
  await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
  })
  await client.send('Page.navigate', { url: `${BASE}${docPath}` })
  // The first hit after a cache wipe compiles lazily; poll rather than sleep.
  await waitFor(client, `document.readyState === 'complete' && document.querySelector('h1, h2')`, 120000)
  await evaluate(client, `(async () => {
    const h = document.body.scrollHeight
    for (let y = 0; y < h + 1500; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)) }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 400)); return h
  })()`)
  if (readySelector)
    await waitFor(client, `document.querySelector(${JSON.stringify(readySelector)})`, 60000)
  await delay(800)
  return { client, targetId }
}

async function shoot(client, name, selector) {
  if (selector) {
    await evaluate(client, `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center', behavior: 'instant' })`)
    await delay(700)
  }
  const png = await client.send('Page.captureScreenshot', { format: 'png' })
  await fs.mkdir(OUT, { recursive: true })
  const file = path.join(OUT, `${name}.png`)
  await fs.writeFile(file, Buffer.from(png.data, 'base64'))
  return file
}

async function close({ client, targetId }) {
  client.close?.()
  await closeTarget(targetId)
}

function dump(label, value) {
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(value, null, 2))
}

// ── Flow suite gallery ──────────────────────────────────────────────────────
{
  const page = await open('/zh/docs/dev/components/flow-suite', '.docs-gallery .tx-bui-flowchart__node')
  const { client } = page

  const readFlow = () => evaluate(client, `JSON.stringify((() => {
    const gallery = document.querySelector('.docs-gallery')
    const chart = gallery.querySelector('.tx-bui-flowchart')
    const nodes = [...chart.querySelectorAll('.tx-bui-flowchart__node')]
    return {
      gridColumns: getComputedStyle(gallery.querySelector('.docs-gallery__grid')).gridTemplateColumns,
      cellLabel: gallery.querySelector('.docs-gallery__label')?.textContent.trim(),
      cellHref: gallery.querySelector('.docs-gallery__label')?.getAttribute('href'),
      canvas: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(chart.getBoundingClientRect()),
      nodes: nodes.map(n => ({
        chip: n.querySelector('.tx-bui-flowchart__chip')?.textContent.trim(),
        card: n.querySelector('.tx-bui-flowchart__card')?.innerText.trim().replace(/\\n+/g, ' | '),
        rect: (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(n.getBoundingClientRect()),
      })),
      edges: [...chart.querySelectorAll('.tx-bui-flowchart__edge')].map(e => e.getAttribute('d')),
    }
  })())`).then(JSON.parse)

  // Shoot first: it scrolls the gallery into view, and the drag below needs
  // coordinates read AFTER that scroll, not before it.
  console.log('shot:', await shoot(client, 'flow-suite-gallery', '.docs-gallery'))
  const before = await readFlow()
  dump('flow gallery (zh) before drag', before)

  // Drag the branch node two grid steps right and one down.
  const b = before.nodes[1].rect
  const from = { x: b.x + b.w / 2, y: b.y + 12 }
  const to = { x: from.x + 44, y: from.y + 22 }
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none' })
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 8; i++) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: from.x + ((to.x - from.x) * i) / 8,
      y: from.y + ((to.y - from.y) * i) / 8,
      button: 'left',
      buttons: 1,
    })
    await delay(16)
  }
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(600)

  const after = await readFlow()
  dump('flow gallery after drag', {
    branchMovedBy: { dx: after.nodes[1].rect.x - before.nodes[1].rect.x, dy: after.nodes[1].rect.y - before.nodes[1].rect.y },
    triggerMovedBy: { dx: after.nodes[0].rect.x - before.nodes[0].rect.x, dy: after.nodes[0].rect.y - before.nodes[0].rect.y },
    edgeChanged: before.edges[0] !== after.edges[0],
    edgeAfter: after.edges[0],
  })
  console.log('shot:', await shoot(client, 'flow-suite-gallery-dragged', '.docs-gallery'))
  await close(page)
}

// ── AI suite gallery: AgentScreen cell ─────────────────────────────────────
{
  const page = await open('/zh/docs/dev/components/ai-suite', '.docs-gallery .tx-bui-agent-screen')
  const { client } = page
  const cell = JSON.parse(await evaluate(client, `JSON.stringify((() => {
    const screen = document.querySelector('.docs-gallery .tx-bui-agent-screen')
    const cell = screen.closest('.docs-gallery__cell')
    const frame = screen.querySelector('.tx-bui-agent-screen__frame')
    return {
      cellsInBand: document.querySelectorAll('.docs-gallery .docs-gallery__cell').length,
      label: cell.querySelector('.docs-gallery__label')?.textContent.trim(),
      href: cell.querySelector('.docs-gallery__label')?.getAttribute('href'),
      frame: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(frame.getBoundingClientRect()),
      cursorLabel: screen.querySelector('.tx-bui-agent-screen__cursor-label')?.textContent.trim(),
      standInWindows: screen.querySelectorAll('.docs-gallery__desktop-window').length,
    }
  })())`))
  dump('ai gallery AgentScreen cell (zh)', cell)
  console.log('shot:', await shoot(client, 'ai-suite-agent-screen', '.docs-gallery .tx-bui-agent-screen'))
  await close(page)
}

// ── Hubs ────────────────────────────────────────────────────────────────────
for (const locale of ['en', 'zh']) {
  const page = await open(`/${locale}/docs/dev/components`, 'main a[href*="flowchart"]')
  const hub = JSON.parse(await evaluate(page.client, `JSON.stringify((() => {
    const has = slug => [...document.querySelectorAll('main a')].some(a => (a.getAttribute('href') || '').includes('/' + slug))
    return {
      links: Object.fromEntries(['toast-panel', 'agent-screen', 'flowchart', 'flow-suite'].map(s => [s, has(s)])),
      h2: [...document.querySelectorAll('main h2')].map(h => h.textContent.trim()).filter(t => /Flow|流程|Data|数据/.test(t)),
      flowRow: [...document.querySelectorAll('main table tr')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()).find(t => /Flow Suite|流程套件/.test(t)) ?? null,
    }
  })())`))
  dump(`hub (${locale})`, hub)
  await close(page)
}

// ── English headings the coverage contract reads ───────────────────────────
for (const slug of ['agent-screen', 'flowchart', 'toast-panel']) {
  const page = await open(`/en/docs/dev/components/${slug}`, 'main h2')
  const h2 = JSON.parse(await evaluate(page.client, `JSON.stringify([...document.querySelectorAll('main h2')].map(h => h.textContent.trim()))`))
  dump(`${slug} (en) h2`, h2)
  await close(page)
}
