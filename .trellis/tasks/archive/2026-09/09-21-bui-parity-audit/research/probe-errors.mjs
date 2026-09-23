// Capture client-side exceptions on a docs page (no extensions, clean profile).
import {
  createTarget, closeTarget, createClient, setViewport, evaluate, delay,
} from '../../../../apps/nexus/scripts/audit-cdp-client.mjs'

const BASE = process.env.DOCS_URL || 'http://localhost:3200'
const slug = process.argv[2]

const { targetId, webSocketDebuggerUrl } = await createTarget('about:blank')
const client = createClient(webSocketDebuggerUrl)
await client.ready
await client.send('Page.enable', {})
await client.send('Runtime.enable', {})
await client.send('Log.enable', {})
await setViewport(client, { width: 1440, height: 1000, deviceScaleFactor: 1 })

const hits = []
client.on?.('Runtime.exceptionThrown', (p) => {
  const d = p.exceptionDetails || {}
  hits.push(`EXCEPTION ${d.text} :: ${d.exception?.description || ''}`.slice(0, 900))
})
client.on?.('Runtime.consoleAPICalled', (p) => {
  if (!['error', 'warning'].includes(p.type)) return
  hits.push(`${p.type.toUpperCase()} ${p.args.map((a) => a.value ?? a.description ?? a.className).join(' ').slice(0, 700)}`)
})
client.on?.('Log.entryAdded', (p) => {
  if (p.entry.level !== 'error') return
  hits.push(`LOG ${p.entry.text} ${p.entry.url || ''}`.slice(0, 500))
})

await client.send('Page.navigate', { url: `${BASE}/zh/docs/dev/components/${slug}` })
await delay(18000)
const len = await evaluate(client, `String((document.body.innerText||'').length)`)
const html = await evaluate(client, `String(document.body.innerHTML.length)`)
console.log(`slug=${slug} innerText=${len} innerHTML=${html}`)
console.log(`--- ${hits.length} diagnostics ---`)
console.log([...new Set(hits)].slice(0, 25).join('\n'))
client.close?.()
await closeTarget(targetId)
