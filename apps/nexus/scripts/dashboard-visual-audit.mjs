/**
 * Screenshots the authenticated dashboard pages so their design can be compared
 * against the tuffex component language.
 *
 * The dashboard is auth-gated and every real sign-in path is unavailable
 * locally (email dispatch 503s, passkeys need a seeded token row, OAuth needs a
 * third-party round-trip). Local dev deliberately allow-lists a known
 * AUTH_SECRET (nuxt.config.ts + server/utils/runtimeCredentialPolicy.ts), and
 * sessions are next-auth JWE cookies, so a session is minted here instead. The
 * token carries only an email — the server auto-provisions a plain `user` role
 * account — so this never impersonates a real account.
 *
 * Usage:
 *   pnpm -C apps/nexus dev                       # localhost:3200, needs CF bindings
 *   chrome --headless=new --remote-debugging-port=9224 --user-data-dir=/tmp/...
 *   node apps/nexus/scripts/dashboard-visual-audit.mjs [route ...]
 *
 * NEXUS_AUDIT_THROTTLE=1 adds latency to every request. Local dev against a
 * local D1 answers faster than a page can paint, so without it a "mid-load"
 * capture is either blank or already settled — there is no window to see.
 * NEXUS_AUDIT_SETTLE=<ms> shortens the post-hydration wait (default 4000) so a
 * capture lands mid-fetch — that is how you see what a page claims before its
 * data arrives, which is a different picture from the settled one.
 * NEXUS_AUDIT_VIEWPORT=mobile|tablet|desktop picks the width (desktop default).
 * NEXUS_AUDIT_THEME=dark captures the dark palette instead (light is the
 * default). Theme is applied the same way scripts/tuffex-visual-smoke.mjs does
 * it — emulated media plus the class/attr/localStorage the app itself reads —
 * because the media query alone does not move @nuxtjs/color-mode.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
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

const require = createRequire(import.meta.url)

const BASE_URL = process.env.NEXUS_DASHBOARD_URL || 'http://localhost:3200'
const AUTH_SECRET = process.env.AUTH_SECRET || 'tuff-dev-secret'
const SESSION_EMAIL = process.env.NEXUS_AUDIT_EMAIL || 'ui-audit-bot@local.test'

const DEFAULT_ROUTES = [
  '/dashboard/overview',
  '/dashboard/devices',
  '/dashboard/storage',
  '/dashboard/api-keys',
  '/dashboard/privacy',
  '/dashboard/updates',
]

// Same matrix scripts/tuffex-visual-smoke.mjs uses, so captures are comparable.
const ALL_VIEWPORTS = {
  mobile: { name: 'mobile', width: 375, height: 812 },
  tablet: { name: 'tablet', width: 768, height: 900 },
  desktop: { name: 'desktop', width: 1440, height: 1000 },
}
const VIEWPORTS = [ALL_VIEWPORTS[process.env.NEXUS_AUDIT_VIEWPORT] ?? ALL_VIEWPORTS.desktop]

const THEME = process.env.NEXUS_AUDIT_THEME === 'dark' ? 'dark' : 'light'
const SETTLE_MS = Number(process.env.NEXUS_AUDIT_SETTLE ?? 4000)
const THROTTLE = process.env.NEXUS_AUDIT_THROTTLE === '1'

async function emulateTheme(client) {
  await client.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: THEME },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  })
}

// Only valid on a real origin — about:blank has no localStorage.
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

async function mintSessionToken() {
  const { encode } = require('next-auth/jwt')
  return await encode({
    secret: AUTH_SECRET,
    maxAge: 2592000,
    token: { email: SESSION_EMAIL, name: 'UI Audit Bot' },
  })
}

async function main() {
  const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES
  const outDir = path.resolve(repoRoot, `output/playwright/nexus-dashboard-audit/${auditDate}`)
  await mkdir(outDir, { recursive: true })

  const token = await mintSessionToken()
  const results = []

  for (const route of routes) {
    for (const viewport of VIEWPORTS) {
      const target = await createTarget('about:blank')
      const client = createClient(target.webSocketDebuggerUrl)
      try {
        await client.ready
        await client.send('Page.enable')
        await client.send('Runtime.enable')
        await setViewport(client, viewport)
        // Host-bound cookie: AUTH_ORIGIN pins localhost, and a 127.0.0.1
        // session would neither share the cookie nor survive a redirect.
        await client.send('Network.enable')
        if (THROTTLE) {
          await client.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: 900,
            downloadThroughput: 200 * 1024,
            uploadThroughput: 200 * 1024,
          })
        }
        await client.send('Network.setCookie', {
          name: 'next-auth.session-token',
          value: token,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
        })

        await emulateTheme(client)
        await client.send('Page.navigate', { url: `${BASE_URL}${route}` })
        // The shared waitForPage waits on `.vp-doc`, which only the docs site
        // renders; the app shell is the dashboard's equivalent ready signal.
        await waitFor(
          client,
          `document.readyState === 'complete' && !!document.querySelector('#__nuxt')`,
          20000,
        )
        // Nuxt hydrates, then the dashboard fetches; no single deterministic
        // signal covers both, so settle on a fixed beat.
        await delay(SETTLE_MS)
        // Re-applied post-hydration: color-mode writes the class on mount and
        // would otherwise overwrite what was set on the blank page.
        await applyTheme(client)
        await delay(Math.min(400, SETTLE_MS))

        const state = await evaluate(client, `(() => {
          const body = document.body?.innerText || ''
          return JSON.stringify({
            url: location.pathname,
            redirected: location.pathname.includes('sign-in'),
            chars: body.length,
            head: body.slice(0, 160),
          })
        })()`)
        const parsed = JSON.parse(state)
        const label = `${route.replace(/\//g, '_').replace(/^_/, '')}-${viewport.name}-${THEME}${SETTLE_MS === 4000 ? '' : `-${SETTLE_MS}ms`}${THROTTLE ? '-slow' : ''}`
        await screenshot(client, label, outDir, { captureBeyondViewport: true })
        results.push({ route, ...parsed })
        console.log(`${route} → ${parsed.redirected ? 'REDIRECTED(sign-in)' : 'ok'} ${parsed.chars} chars`)
      }
      finally {
        client.close?.()
        await closeTarget(target.id)
      }
    }
  }

  console.log(`\nScreenshots: ${outDir}`)
  const blocked = results.filter(r => r.redirected)
  if (blocked.length)
    console.log(`WARNING: ${blocked.length}/${results.length} routes redirected to sign-in — session not accepted.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
