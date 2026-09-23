// Verify 02 (agent-trace four-way switch) and 09 (inline entity token) in the
// running dev server. Demos mount on intersection, so scroll the whole page
// before measuring — a probe fired straight after navigation reads the
// placeholder, not the demo.
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9231 node verify-02-09.mjs
import {
  closeTarget, createClient, createTarget, delay, evaluate, setViewport,
} from '../../../../apps/nexus/scripts/audit-cdp-client.mjs'

const BASE = process.env.DOCS || 'http://localhost:3200'

async function open(path) {
  const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
  const client = createClient(webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable', {})
  await client.send('Runtime.enable', {})
  await setViewport(client, { width: 1100, height: 900, deviceScaleFactor: 2 })
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{localStorage.setItem('nuxt-color-mode','light')}catch(e){}`,
  })
  await client.send('Page.navigate', { url: `${BASE}${path}` })
  await delay(13000)

  await evaluate(client, `(async () => {
    const h = document.body.scrollHeight
    for (let y = 0; y < h + 1500; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 110)) }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 500)); return h
  })()`)
  await delay(3000)

  const pending = await evaluate(client, `document.querySelectorAll('.tuff-demo__pending, .tuff-demo__loading').length`)
  return { client, targetId, pending }
}

function dump(label, value) {
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(value, null, 2))
}

// ── 09: recommendation card inline entity token ─────────────────────────────
{
  const { client, targetId, pending } = await open('/zh/docs/dev/components/recommendation-card')
  console.log('09 pending demos:', pending)

  const shot = JSON.parse(await evaluate(client, `(() => {
    const mark = document.querySelector('.tx-bui-recommendation-card__body mark')
    const code = document.querySelector('.tx-bui-recommendation-card__body code.is-success')
    if (!mark) return JSON.stringify({ error: 'no mark rendered' })
    const ms = getComputedStyle(mark)
    const dot = getComputedStyle(mark, '::before')
    const cs = code ? getComputedStyle(code) : null
    return JSON.stringify({
      markText: mark.textContent.trim(),
      markRadius: ms.borderRadius,
      markBg: ms.backgroundColor,
      markDisplay: ms.display,
      markFontMono: /mono|Mono/.test(ms.fontFamily),
      dotBg: dot.backgroundColor,
      dotSize: dot.width + ' x ' + dot.height,
      dotRadius: dot.borderRadius,
      codeText: code ? code.textContent.trim() : null,
      codeColor: cs ? cs.color : null,
      codeBg: cs ? cs.backgroundColor : null,
      codeFontMono: cs ? /mono|Mono/.test(cs.fontFamily) : null,
      bodyText: document.querySelector('.tx-bui-recommendation-card__body')?.innerText.trim(),
    })
  })()`))
  dump('09 recommendation-card (zh)', shot)
  client.close?.()
  await closeTarget(targetId)
}

// ── 02: agent-trace four-way switcher ───────────────────────────────────────
{
  const { client, targetId, pending } = await open('/zh/docs/dev/components/agent-trace')
  console.log('02 pending demos:', pending)

  const labels = JSON.parse(await evaluate(client, `(() => {
    const target = [...document.querySelectorAll('.tx-flat-radio')].find(r => r.closest('.tuff-demo'))
    if (!target) return JSON.stringify({ error: 'no flat radio in a demo' })
    return JSON.stringify({
      items: [...target.querySelectorAll('.tx-flat-radio-item')].map(i => i.innerText.trim()),
    })
  })()`))
  dump('02 switcher labels', labels)

  const seen = []
  for (let i = 0; i < 4; i++) {
    const box = JSON.parse(await evaluate(client, `(() => {
      const target = [...document.querySelectorAll('.tx-flat-radio')].find(r => r.closest('.tuff-demo'))
      const item = target.querySelectorAll('.tx-flat-radio-item')[${i}]
      item.scrollIntoView({ block: 'center', behavior: 'instant' })
      const r = item.getBoundingClientRect()
      return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), label: item.innerText.trim() })
    })()`))
    await delay(300)

    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await client.send('Input.dispatchMouseEvent', {
        type, x: box.x, y: box.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1,
      })
    }
    await delay(900)

    seen.push(JSON.parse(await evaluate(client, `(() => {
      // Scope to the trace that shares a demo with the switcher. The page also
      // renders AgentTraceStepsDemo, and a bare '.tx-bui-agent-trace' picks
      // that one — which never changes, making the switch look inert.
      const radio = [...document.querySelectorAll('.tx-flat-radio')].find(r => r.closest('.tuff-demo'))
      const scope = radio.closest('.tuff-demo')
      const trace = scope.querySelector('.tx-bui-agent-trace')
      if (!trace) return JSON.stringify({ error: 'trace gone' })
      const text = trace.innerText.trim().split('\\n').map(s => s.trim()).filter(Boolean)
      return JSON.stringify({
        tab: ${JSON.stringify(box.label)},
        tracesOnPage: document.querySelectorAll('.tx-bui-agent-trace').length,
        selected: scope.querySelector('.tx-flat-radio-item.is-active, .tx-flat-radio-item[aria-checked="true"]')?.innerText.trim() ?? null,
        header: text[0] ?? null,
        rows: text.slice(1, 6),
        height: Math.round(trace.getBoundingClientRect().height),
      })
    })()`)))
  }
  dump('02 per-tab render', seen)
  client.close?.()
  await closeTarget(targetId)
}
