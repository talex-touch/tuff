/**
 * Screenshots component doc pages so their live demos can actually be looked at.
 *
 * scripts/tuffex-visual-smoke.mjs only covers the three composition demos on one
 * page; there are 159 component docs, and a spot check needs to reach any of
 * them by slug.
 *
 * Usage:
 *   pnpm -C apps/nexus dev                       # localhost:3200
 *   chrome --headless=new --remote-debugging-port=9224 --user-data-dir=/tmp/...
 *   node apps/nexus/scripts/component-docs-spot-check.mjs alert tabs popover
 *
 * TUFFEX_SPOT_THEME=dark captures the dark palette. Theme is applied after
 * navigation and again after hydration, the same way the dashboard audit does
 * it: localStorage throws on about:blank, and color-mode rewrites the class on
 * mount.
 * TUFFEX_SPOT_VIEWPORT=mobile|tablet|desktop picks the width.
 *
 * Each capture writes a sibling .txt of the page's body text, so a sweep over
 * many components is greppable instead of needing one read per screenshot.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  auditDate,
  closeTarget,
  createClient,
  createTarget,
  delay,
  evaluate,
  repoRoot,
  screenshot,
  setViewport,
  waitFor,
} from './audit-cdp-client.mjs'

const BASE_URL = process.env.TUFFEX_SPOT_URL || 'http://localhost:3200'

const ALL_VIEWPORTS = {
  mobile: { name: 'mobile', width: 375, height: 812 },
  tablet: { name: 'tablet', width: 768, height: 900 },
  desktop: { name: 'desktop', width: 1440, height: 1000 },
}
const VIEWPORT = ALL_VIEWPORTS[process.env.TUFFEX_SPOT_VIEWPORT] ?? ALL_VIEWPORTS.desktop
const THEME = process.env.TUFFEX_SPOT_THEME === 'dark' ? 'dark' : 'light'
const SETTLE_MS = Number(process.env.TUFFEX_SPOT_SETTLE ?? 3500)
const LOCALE = process.env.TUFFEX_SPOT_LOCALE || 'en'

async function applyTheme(client) {
  await evaluate(client, `(() => {
    const theme = ${JSON.stringify(THEME)}
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('color-mode', theme)
  })()`)
  await delay(300)
}

async function main() {
  const slugs = process.argv.slice(2)
  if (!slugs.length) {
    console.error('usage: node component-docs-spot-check.mjs <slug> [slug ...]')
    process.exit(1)
  }

  const outDir = path.resolve(repoRoot, `output/playwright/tuffex-spot-check/${auditDate}`)
  await mkdir(outDir, { recursive: true })

  for (const slug of slugs) {
    const target = await createTarget('about:blank')
    const client = createClient(target.webSocketDebuggerUrl)
    try {
      await client.ready
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await setViewport(client, VIEWPORT)
      await client.send('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: THEME },
          // Demos that animate on mount would otherwise be caught mid-flight
          // and read as broken layout.
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      })

      // Unprefixed /docs 308s to the locale route; navigating to the redirect
      // target directly keeps the capture off the intermediate page.
      await client.send('Page.navigate', { url: `${BASE_URL}/${LOCALE}/docs/dev/components/${slug}` })
      await waitFor(
        client,
        `document.readyState === 'complete' && !!document.querySelector('#__nuxt')`,
        30000,
      )
      await delay(SETTLE_MS)
      // Demos mount on intersection. captureBeyondViewport renders the full
      // height but never fires the observer, so without this pass every demo
      // below the fold captures as "Loading demo…" — a broken-looking page that
      // is entirely an artefact of the capture. Verified: tabs goes 5 stuck -> 0.
      const pageHeight = JSON.parse(await evaluate(client, 'JSON.stringify(document.body.scrollHeight)'))
      for (let y = 0; y < pageHeight; y += 700) {
        await evaluate(client, `window.scrollTo(0, ${y})`)
        await delay(250)
      }
      await evaluate(client, 'window.scrollTo(0, 0)')
      await delay(1200)
      await applyTheme(client)
      await delay(400)

      const state = await evaluate(client, `(() => {
        const body = document.body?.innerText || ''
        return JSON.stringify({
          chars: body.length,
          notFound: /404|not found|页面不存在/i.test(body.slice(0, 400)),
          stuckDemos: (body.match(/Loading demo/gi) || []).length,
          text: body,
        })
      })()`)
      const parsed = JSON.parse(state)
      const label = `${slug}-${VIEWPORT.name}-${THEME}`
      await screenshot(client, label, outDir, { captureBeyondViewport: true })
      await writeFile(path.join(outDir, `${label}.txt`), parsed.text ?? '', 'utf8')
      const stuck = parsed.stuckDemos ? ` ${parsed.stuckDemos} STUCK DEMO(S)` : ''
      console.log(`${slug} → ${parsed.notFound ? 'NOT FOUND' : 'ok'} ${parsed.chars} chars${stuck}`)
    }
    finally {
      client.close?.()
      await closeTarget(target.id)
    }
  }

  console.log(`\nScreenshots: ${outDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
