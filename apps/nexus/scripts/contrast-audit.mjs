/**
 * Measures text contrast on the authenticated dashboard against WCAG AA.
 *
 * Screenshots cannot answer this. Two rounds of reading dashboard captures by
 * eye found nothing, while the ratios below have been failing on every page the
 * whole time — a 3:1 grey looks perfectly fine next to a 4.5:1 grey until you
 * measure it.
 *
 * Usage:
 *   pnpm -C apps/nexus dev                       # localhost:3200
 *   chrome --headless=new --remote-debugging-port=9224 --user-data-dir=/tmp/...
 *   node apps/nexus/scripts/contrast-audit.mjs /dashboard/overview ...
 *   node apps/nexus/scripts/contrast-audit.mjs --self-test
 *
 * CONTRAST_THEME=dark measures the dark palette (light is the default).
 * CONTRAST_INJECT=1 adds a known-failing element, which is how you confirm the
 * probe still works against a page that reports nothing.
 *
 * Session minting matches scripts/dashboard-visual-audit.mjs: the token carries
 * only an email, so the server auto-provisions a plain `user` account and this
 * never impersonates a real one.
 */
import { createRequire } from 'node:module'
import process from 'node:process'
import {
  closeTarget,
  createClient,
  createTarget,
  delay,
  evaluate,
  setViewport,
  waitFor,
} from './audit-cdp-client.mjs'

const require = createRequire(import.meta.url)
const BASE_URL = process.env.CONTRAST_URL || 'http://localhost:3200'
const AUTH_SECRET = process.env.AUTH_SECRET || 'tuff-dev-secret'
const THEME = process.env.CONTRAST_THEME === 'dark' ? 'dark' : 'light'
const INJECT = process.env.CONTRAST_INJECT === '1'

/**
 * `rgb()` carries 0-255 while CSS Color 4 (`color(srgb 0.89 0.91 0.95 / 0.92)`)
 * carries 0-1. Reading both as 0-255 collapses every modern colour to near
 * black, which makes foreground and background agree and reports every ratio as
 * exactly 1.00 — a number that looks like a catastrophic finding and is only a
 * parser bug. This app emits the `color()` form, so a probe validated against
 * `rgb()` alone proves nothing.
 */
export function parseColor(value) {
  if (!value) return null
  const parts = value.match(/[\d.]+/g)
  if (!parts) return null
  const nums = parts.slice(0, 4).map(Number)
  if (value.startsWith('color(')) {
    const [r, g, b, a] = nums
    return [r * 255, g * 255, b * 255, a === undefined ? 1 : a]
  }
  return [nums[0], nums[1], nums[2], nums[3] === undefined ? 1 : nums[3]]
}

export function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(foreground, background) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const PROBE = `(() => {
  // Serialised by name, not aliased: contrastRatio's body calls
  // relativeLuminance, so renaming it here leaves a ReferenceError that only
  // shows up in the browser — the node-side self-test passes either way.
  const parseColor = ${parseColor.toString()}
  const relativeLuminance = ${relativeLuminance.toString()}
  const contrastRatio = ${contrastRatio.toString()}
  // Backgrounds have to be composited, not searched. The dashboard paints its
  // surfaces with translucent layers over a base that html and body both leave
  // transparent, so "walk up until something is opaque" runs off the top and
  // lands on whatever the fallback guesses. Guessing black scored black-on-white
  // at 1.00 on every light page; guessing white then scored white-on-dark at
  // 1.00 on every dark one. Both readings were the fallback, not the page.
  const over = (top, bottom) => {
    const a = top[3]
    return [
      top[0] * a + bottom[0] * (1 - a),
      top[1] * a + bottom[1] * (1 - a),
      top[2] * a + bottom[2] * (1 - a),
      1,
    ]
  }
  const themeBase = document.documentElement.classList.contains('dark')
    ? [0, 0, 0, 1]
    : [255, 255, 255, 1]
  const bgOf = (el) => {
    const layers = []
    let node = el
    while (node) {
      const colour = parseColor(getComputedStyle(node).backgroundColor)
      if (colour && colour[3] > 0.004) {
        layers.push(colour)
        if (colour[3] > 0.995) break
      }
      node = node.parentElement
    }
    let result = themeBase
    for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i], result)
    return result
  }
  const failures = []
  const undetermined = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length) continue
    const text = (el.textContent || '').trim()
    if (!text || text.length > 120) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.35) continue
    const fg = parseColor(style.color)
    if (!fg || fg[3] < 0.5) continue
    const size = parseFloat(style.fontSize)
    const weight = Number(style.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const required = large ? 3 : 4.5
    const measured = contrastRatio(fg.slice(0, 3), bgOf(el).slice(0, 3))
    // A ratio of exactly 1 means the foreground and the background resolved to
    // the same colour, which text never does. It is the probe failing to find a
    // background, and reporting it as a finding is how three rounds of
    // fabricated results got believed.
    if (Math.abs(measured - 1) < 0.005) {
      undetermined.push(text.slice(0, 46))
      continue
    }
    if (measured < required)
      failures.push({ measured: Number(measured.toFixed(2)), required, colour: style.color, size, text: text.slice(0, 46) })
  }
  failures.sort((a, b) => a.measured - b.measured)
  return JSON.stringify({ failures: failures.slice(0, 8), undetermined: undetermined.length })
})()`

function selfTest() {
  let failed = 0
  const expect = (label, actual, wanted) => {
    const ok = Math.abs(actual - wanted) < 0.02
    if (!ok) {
      failed += 1
      console.error(`  FAIL ${label}: expected ~${wanted}, got ${actual.toFixed(2)}`)
    }
  }
  // Hand-checked: #909399 has luminance 0.2909, so (1.05)/(0.3409) = 3.08.
  expect('#909399 on white', contrastRatio([144, 147, 153], [255, 255, 255]), 3.08)
  expect('black on white', contrastRatio([0, 0, 0], [255, 255, 255]), 21)
  expect('white on white', contrastRatio([255, 255, 255], [255, 255, 255]), 1)
  // The parser trap: the same colour in both notations must measure the same.
  const asRgb = parseColor('rgb(144, 147, 153)')
  const asColor4 = parseColor('color(srgb 0.564706 0.576471 0.6)')
  expect(
    'color(srgb ...) matches rgb()',
    contrastRatio(asColor4.slice(0, 3), [255, 255, 255]),
    contrastRatio(asRgb.slice(0, 3), [255, 255, 255]),
  )
  console.log(failed ? `\ncontrast self-test: ${failed} case(s) failed` : 'contrast self-test: 4 cases pass')
  return failed
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

async function main() {
  const routes = process.argv.slice(2)
  if (!routes.length) {
    console.error('usage: node contrast-audit.mjs <route> [route ...]   (or --self-test)')
    process.exit(1)
  }
  const { encode } = require('next-auth/jwt')
  const token = await encode({
    secret: AUTH_SECRET,
    maxAge: 2592000,
    token: { email: 'ui-audit-bot@local.test', name: 'UI Audit Bot' },
  })

  let total = 0
  for (const route of routes) {
    const target = await createTarget('about:blank')
    const client = createClient(target.webSocketDebuggerUrl)
    try {
      await client.ready
      await client.send('Page.enable')
      await client.send('Runtime.enable')
      await client.send('Network.enable')
      await setViewport(client, { width: 1440, height: 1000 })
      await client.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: THEME }],
      })
      await client.send('Network.setCookie', {
        name: 'next-auth.session-token',
        value: token,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
      })
      await client.send('Page.navigate', { url: `${BASE_URL}${route}` })
      await waitFor(client, `document.readyState === 'complete' && !!document.querySelector('#__nuxt')`, 30000)
      await delay(4500)
      await evaluate(client, `(() => {
        const theme = ${JSON.stringify(THEME)}
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('color-mode', theme)
      })()`)
      await delay(700)
      if (INJECT) {
        await evaluate(client, `(() => {
          const el = document.createElement('div')
          el.textContent = 'CONTRAST CONTROL — must be reported'
          el.style.cssText = 'color:color(srgb 0.33 0.33 0.33);background:color(srgb 0.29 0.29 0.29);font-size:14px;padding:4px'
          document.body.appendChild(el)
        })()`)
        await delay(200)
      }
      const { failures, undetermined } = JSON.parse(await evaluate(client, PROBE))
      total += failures.length
      const unknown = undetermined ? `  (${undetermined} undetermined)` : ''
      console.log(`${route.padEnd(26)} ${failures.length ? `${failures.length} below AA` : 'ok'}${unknown}`)
      for (const failure of failures)
        console.log(`     ${failure.measured} (need ${failure.required})  ${failure.colour} @${failure.size}px  "${failure.text}"`)
    }
    finally {
      client.close?.()
      await closeTarget(target.id)
    }
  }
  console.log(`\n${THEME}: ${total} text run(s) below WCAG AA across ${routes.length} route(s).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
