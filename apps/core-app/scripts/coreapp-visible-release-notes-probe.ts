#!/usr/bin/env tsx
/**
 * Captures the two release-notes surfaces #482 asks for, at desktop and narrow width.
 *
 * Surfaces, and why each is reachable:
 *
 * - `WhatsChangedDialog` — rendered by `AppEntrance.vue` when `appEntranceMode === 'MainApp'`.
 *   `useReleaseNotesRuntime.evaluateStartup()` opens it only while the version is unacknowledged,
 *   and `closeDialog()` acknowledges it permanently. So it appears exactly once per profile per
 *   upgrade: **this probe is only reproducible against a fresh `userDataDir`**, which is also why
 *   every sibling probe isolates one. Pointed at a real profile it captures nothing and reports
 *   `dialog-not-shown`, which is a true observation about that profile, not a probe failure.
 * - Settings → Update (`router.ts` key `update` → `SettingUpdatePage.vue`). #482 and the
 *   maintenance audit both call this "Update-history"; no such name exists in the renderer —
 *   searching all 756 files for `update.?history` returns zero. The name here follows the router.
 *
 * Split, per the convention in `coreapp-packaged-ai-ask-probe.ts`: everything that decides
 * something is a pure function tested in the sibling `.test.ts`; the launch/attach/capture wiring
 * is exercised only by a real run.
 *
 * Launching is left to the caller, the same split `coreapp-packaged-indexing-diagnostics-probe.ts`
 * already implements: start CoreApp with `--remote-debugging-port` and an isolated `userDataDir`,
 * then point this at it.
 *
 *   tsx scripts/coreapp-visible-release-notes-probe.ts \
 *     --cdp-url http://127.0.0.1:9222 --out-dir docs/engineering/reports/release-notes-<date>
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export interface DevToolsTarget {
  id: string
  type?: string
  title?: string
  url?: string
  webSocketDebuggerUrl?: string
}

export type CdpSend = (
  method: string,
  params?: Record<string, unknown>
) => Promise<{ result?: Record<string, unknown> }>

/** One capture size. `narrow` is the half #482 names separately from desktop. */
export interface Viewport {
  name: 'desktop' | 'narrow'
  width: number
  height: number
}

/**
 * 1440 matches the width the sibling probes already capture at, so the artefacts are comparable.
 * 720 is below the app's own layout breakpoints rather than an arbitrary small number — the point
 * of the narrow capture is to show the release-notes surfaces after they reflow, not merely
 * scaled down.
 */
export const VIEWPORTS: readonly Viewport[] = [
  { name: 'desktop', width: 1440, height: 1050 },
  { name: 'narrow', width: 720, height: 900 }
]

/** What one capture pass reads out of the renderer before it shoots. */
export interface ReleaseNotesProbeDom {
  href: string
  readyState: string
  /** `.whats-changed-dialog` present in the document. */
  hasDialog: boolean
  /** `.whats-changed-dialog__versions` rendered at least one version block. */
  dialogVersionCount: number
  /** `.whats-changed-dialog__summary` rendered at least one bullet. */
  dialogSummaryCount: number
  /** `.whats-changed-dialog__actions` present, i.e. the dialog is dismissible. */
  hasDialogActions: boolean
  /**
   * `location.hash`. The router is hash-based (`createWebHashHistory`), and category routes are
   * `/setting/<key>` -- `DEFAULT_SETTING_PATH` is `/setting/overview` (`modules/settings/categories.ts`),
   * so `update` addresses `#/setting/update`.
   */
  hash: string
  /**
   * `.SettingsPage` from `components/settings/SettingsPage.vue`, which every category page wraps
   * itself in. On its own it only says "some settings page is mounted" -- it is the hash that says
   * which one, so the judge below requires both rather than trusting either.
   */
  hasSettingsPage: boolean
  /** Visible text, used only for the not-shown diagnostic. */
  bodyText: string
}

export type ReleaseNotesEvidenceTag =
  | 'dialog-shown'
  | 'dialog-has-entries'
  | 'dialog-dismissible'
  | 'update-page-reached'
  | 'dialog-not-shown'
  | 'renderer-not-ready'

export interface ReleaseNotesEvidenceCheck {
  tag: ReleaseNotesEvidenceTag
  ok: boolean
  detail: string
}

/**
 * The main window, not CoreBox and not a plugin Surface.
 *
 * Plugin views and CoreBox each get their own `page` target, and on a first launch there can be
 * several. Picking the first `page` would attach to whichever came up first, which is a race —
 * the probe would sometimes screenshot a plugin's HTML and report a missing dialog.
 */
export function selectMainWindowTarget(targets: readonly DevToolsTarget[]): DevToolsTarget | null {
  const pages = targets.filter(
    (target) => target.type === 'page' && Boolean(target.webSocketDebuggerUrl)
  )
  if (pages.length === 0) return null
  const main = pages.find((target) => {
    const url = target.url ?? ''
    // The main window is the one serving the renderer bundle: `index.html` in a packaged build,
    // the dev server root in dev. CoreBox and plugin Surfaces carry a route or a plugin origin.
    if (url.includes('/plugin') || url.includes('corebox') || url.includes('core-box')) return false
    return url.includes('index.html') || /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)
  })
  return main ?? pages[0] ?? null
}

/**
 * Judge one DOM snapshot.
 *
 * `dialog-not-shown` is reported as a *failed check with a reason*, never as an absent one: a
 * probe that silently produces no dialog evidence looks identical to a passing run in a summary,
 * and that is the failure mode #482 exists to close.
 */
export function buildReleaseNotesEvidenceChecks(
  dom: ReleaseNotesProbeDom
): ReleaseNotesEvidenceCheck[] {
  if (dom.readyState !== 'complete') {
    return [
      {
        tag: 'renderer-not-ready',
        ok: false,
        detail: `document.readyState is "${dom.readyState}"; nothing was captured`
      }
    ]
  }

  const checks: ReleaseNotesEvidenceCheck[] = []

  if (dom.hasDialog) {
    checks.push({
      tag: 'dialog-shown',
      ok: true,
      detail: '.whats-changed-dialog is in the document'
    })
    checks.push({
      tag: 'dialog-has-entries',
      ok: dom.dialogVersionCount > 0 && dom.dialogSummaryCount > 0,
      detail: `${dom.dialogVersionCount} version block(s), ${dom.dialogSummaryCount} summary item(s)`
    })
    checks.push({
      tag: 'dialog-dismissible',
      ok: dom.hasDialogActions,
      detail: dom.hasDialogActions
        ? '.whats-changed-dialog__actions present'
        : 'no actions row — the dialog cannot be dismissed from the UI'
    })
  } else {
    checks.push({
      tag: 'dialog-not-shown',
      ok: false,
      detail:
        'no .whats-changed-dialog. Expected on a fresh userDataDir; against a used profile the ' +
        'version is already acknowledged and the dialog never opens'
    })
  }

  const onUpdateRoute = dom.hash === UPDATE_ROUTE_HASH
  checks.push({
    tag: 'update-page-reached',
    ok: onUpdateRoute && dom.hasSettingsPage,
    detail: onUpdateRoute
      ? dom.hasSettingsPage
        ? `${UPDATE_ROUTE_HASH} with .SettingsPage mounted`
        : `${UPDATE_ROUTE_HASH} but no .SettingsPage -- the route resolved and the page did not render`
      : `hash is "${dom.hash}", expected "${UPDATE_ROUTE_HASH}"`
  })

  return checks
}

/** Reads the snapshot above. Kept as a builder so the sibling test can assert the shape it returns. */
export function readReleaseNotesDomExpression(): string {
  return `(() => {
    const count = (selector) => document.querySelectorAll(selector).length
    return {
      href: location.href,
      readyState: document.readyState,
      hasDialog: Boolean(document.querySelector('.whats-changed-dialog')),
      dialogVersionCount: count('.whats-changed-dialog__version-title'),
      dialogSummaryCount: count('.whats-changed-dialog__summary li'),
      hasDialogActions: Boolean(document.querySelector('.whats-changed-dialog__actions')),
      hash: location.hash,
      hasSettingsPage: Boolean(document.querySelector('.SettingsPage')),
      bodyText: (document.body?.innerText || '').slice(0, 400)
    }
  })()`
}

/**
 * Settings -> Update, as the router actually addresses it.
 *
 * `createSettingCategoryRoutes` maps the key `update` onto `SettingUpdatePage.vue`, and category
 * paths are `/setting/<key>` -- `DEFAULT_SETTING_PATH` is `/setting/overview`. The router is
 * hash-based, hence the `#`.
 */
export const UPDATE_ROUTE_HASH = '#/setting/update'

export function navigateToUpdatePageExpression(): string {
  return `(() => {
    const target = '${UPDATE_ROUTE_HASH}'
    if (location.hash !== target) location.hash = target
    return { hash: location.hash }
  })()`
}

export function screenshotFileName(viewport: Viewport, surface: 'dialog' | 'update-page'): string {
  return `release-notes-${surface}-${viewport.name}-${viewport.width}x${viewport.height}.png`
}

// ---------------------------------------------------------------------------
// Everything below drives a live renderer and is exercised only by a real run.
// ---------------------------------------------------------------------------

async function applyViewport(send: CdpSend, viewport: Viewport): Promise<void> {
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  })
}

async function capture(send: CdpSend, outputPath: string): Promise<void> {
  const response = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true
  })
  const data = response.result?.data
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('CDP screenshot response did not include data')
  }
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.from(data, 'base64'))
}

async function readDom(send: CdpSend): Promise<ReleaseNotesProbeDom> {
  const response = await send('Runtime.evaluate', {
    expression: readReleaseNotesDomExpression(),
    returnByValue: true
  })
  const value = (response.result?.result as { value?: ReleaseNotesProbeDom } | undefined)?.value
  if (!value) throw new Error('Runtime.evaluate returned no DOM snapshot')
  return value
}

export interface ProbeRunResult {
  checks: ReleaseNotesEvidenceCheck[]
  artifacts: string[]
}

/**
 * Capture both surfaces at both viewports.
 *
 * The dialog is read *before* routing, because acknowledging or navigating away is what makes it
 * unrepeatable — the order here is the one thing a rerun cannot recover from.
 */
export async function runProbe(send: CdpSend, outDir: string): Promise<ProbeRunResult> {
  const artifacts: string[] = []
  const checks: ReleaseNotesEvidenceCheck[] = []

  for (const viewport of VIEWPORTS) {
    await applyViewport(send, viewport)
    const dom = await readDom(send)
    if (viewport.name === 'desktop') checks.push(...buildReleaseNotesEvidenceChecks(dom))
    if (dom.hasDialog) {
      const file = path.join(outDir, screenshotFileName(viewport, 'dialog'))
      await capture(send, file)
      artifacts.push(file)
    }
  }

  await send('Runtime.evaluate', {
    expression: navigateToUpdatePageExpression(),
    returnByValue: true
  })

  for (const viewport of VIEWPORTS) {
    await applyViewport(send, viewport)
    const file = path.join(outDir, screenshotFileName(viewport, 'update-page'))
    await capture(send, file)
    artifacts.push(file)
  }

  return { checks, artifacts }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function isDevToolsTarget(value: unknown): value is DevToolsTarget {
  if (!value || typeof value !== 'object') return false
  const target = value as Partial<DevToolsTarget>
  return typeof target.id === 'string' && typeof target.type === 'string'
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload))
    throw new Error('Remote debugging endpoint did not return a target list')
  return payload.filter(isDevToolsTarget)
}

async function withTarget<T>(
  target: DevToolsTarget,
  callback: (send: CdpSend) => Promise<T>
): Promise<T> {
  if (!target.webSocketDebuggerUrl) throw new Error(`Target has no WebSocket URL: ${target.id}`)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map<number, (value: { result?: Record<string, unknown> }) => void>()

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      result?: Record<string, unknown>
    }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    }
  }
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`Failed to connect CDP target: ${target.id}`))
  })

  const send: CdpSend = (method, params) =>
    new Promise((resolve, reject) => {
      const messageId = (id += 1)
      const timer = setTimeout(() => {
        pending.delete(messageId)
        reject(new Error(`Timed out waiting for CDP ${method}`))
      }, 15_000)
      pending.set(messageId, (value) => {
        clearTimeout(timer)
        resolve(value)
      })
      socket.send(JSON.stringify({ id: messageId, method, params: params ?? {} }))
    })

  try {
    await send('Runtime.enable')
    await send('Page.enable')
    return await callback(send)
  } finally {
    socket.close()
  }
}

async function main(): Promise<void> {
  const cdpUrl = arg('cdp-url')
  const outDir = arg('out-dir')
  if (!cdpUrl || !outDir) {
    console.error(
      'usage: coreapp-visible-release-notes-probe --cdp-url <http://127.0.0.1:9222> --out-dir <dir>'
    )
    console.error(
      'the app must have been launched with an ISOLATED userDataDir, or the release-notes'
    )
    console.error('version is already acknowledged and the dialog never opens.')
    process.exit(2)
  }

  const targets = await loadTargets(`${cdpUrl.replace(/\/$/, '')}/json`)
  const target = selectMainWindowTarget(targets)
  if (!target) {
    console.error(`no attachable page target among ${targets.length} target(s)`)
    process.exit(1)
  }

  const { checks, artifacts } = await withTarget(target, (send) => runProbe(send, outDir))

  for (const check of checks) {
    console.log(
      `  ${check.ok ? '\u001B[32m\u2713\u001B[0m' : '\u001B[31m\u2717\u001B[0m'} ${check.tag}: ${check.detail}`
    )
  }
  for (const file of artifacts) console.log(`  captured ${file}`)

  const failed = checks.filter((check) => !check.ok).length
  console.log(
    failed === 0
      ? `\n[release-notes-visual] ${checks.length} checks passed, ${artifacts.length} artefact(s)\n`
      : `\n[release-notes-visual] ${failed} of ${checks.length} checks FAILED\n`
  )
  process.exit(failed === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
