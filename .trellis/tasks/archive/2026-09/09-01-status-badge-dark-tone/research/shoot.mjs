// Screenshot the gallery cells in the semantic-token blast radius and dump the
// computed colours of the StatusBadge / Badge / Tag / Alert specimens.
//
//   TUFFEX_CDP_URL=http://127.0.0.1:9229 MODE=dark OUT=before node shoot.mjs
//
// MODE  dark | light           (default dark)
// OUT   subdirectory name      (default MODE)  → research/<OUT>/<MODE>/*.png
// CELLS comma-separated cell labels to restrict the run (default: full list)
//
// Adapted from ../../09-01-tuffex-gallery-visual-polish/research/shoot.mjs.
// Clip rects are document coordinates + captureBeyondViewport, otherwise the
// capture is a solid-colour PNG while getComputedStyle looks perfectly fine.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeTarget, createClient, createTarget, delay, evaluate, setViewport } from '/Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/nexus/scripts/audit-cdp-client.mjs'

const MODE = process.env.MODE || 'dark'
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.env.OUT || MODE, MODE)
mkdirSync(OUT, { recursive: true })
const URL = process.env.TUFFEX_GALLERY_URL || 'http://localhost:3200/zh/docs/dev/components'

// Every gallery cell whose component directory reads --tx-color-(success|warning|danger).
// progress-bar and chat (TypingIndicator) are being redesigned concurrently; they are
// shot for the record but signed off at parent integration.
const DEFAULT_CELLS = [
  'StatusBadge', 'Badge', 'Tag', 'Alert', 'Toast', 'Button', 'Steps', 'Timeline', 'StatCard', 'VersionCapsule',
  'AiElements', 'AttachmentTray', 'ChainOfThought', 'Chat', 'TypingIndicator', 'ContextIndicator', 'ContextMenu',
  'DropdownMenu', 'ErrorState', 'FlatInput', 'Form', 'Icon', 'Input', 'MessageActions', 'ProgressBar', 'Select',
  'StreamMarkdown', 'TabBar', 'Textarea', 'ToolCallCard', 'ToolConfirmation',
]
const CELLS = process.env.CELLS ? process.env.CELLS.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_CELLS

const target = await createTarget('about:blank')
const client = createClient(target.webSocketDebuggerUrl)
await client.send('Page.enable')
await client.send('Runtime.enable')
await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: MODE }] })
await client.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('nuxt-color-mode', '${MODE}') } catch {}`,
})
await setViewport(client, { width: 1280, height: 900, deviceScaleFactor: 2 })
await client.send('Page.navigate', { url: URL })
const start = Date.now()
while (Date.now() - start < 90000) {
  const ok = await evaluate(client, `Boolean(document.readyState === 'complete' && document.querySelector('.docs-gallery .tx-status-badge'))`)
  if (ok)
    break
  await delay(250)
}
await delay(1500)
await evaluate(client, MODE === 'dark' ? `document.documentElement.classList.add('dark')` : `document.documentElement.classList.remove('dark')`)
await delay(800)

// Labels render as `${en} ${zh}` on the zh page; match on `${en} ` so `Tag` does not hit `TagInput`.
const cellSel = label => `[...document.querySelectorAll('.docs-gallery__cell')].find(c => (c.querySelector('.docs-gallery__label')?.textContent.trim() + ' ').startsWith('${label} '))`

async function cellRect(label) {
  return await evaluate(client, `(() => { const c = ${cellSel(label)}; if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
}

async function shootCell(label, name = label) {
  const found = await evaluate(client, `(() => { const c = ${cellSel(label)}; if (!c) return false; c.scrollIntoView({ block: 'center' }); return true })()`)
  if (!found) {
    console.log('cell not found', label)
    return null
  }
  await delay(500)
  const rect = await cellRect(label)
  const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 2 }, captureBeyondViewport: true })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.data, 'base64'))
  console.log('wrote', name, JSON.stringify(rect))
  return rect
}

// Positive control: a full-viewport capture proves the page painted at all.
{
  const shot = await client.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/_viewport.png`, Buffer.from(shot.data, 'base64'))
}

for (const label of CELLS)
  await shootCell(label)

// DropdownMenu: the danger item is only visible with the menu open.
if (CELLS.includes('DropdownMenu')) {
  const opened = await evaluate(client, `(() => { const c = ${cellSel('DropdownMenu')}; if (!c) return false; c.scrollIntoView({ block: 'center' }); const b = c.querySelector('button, .tx-button'); if (!b) return false; b.click(); return true })()`)
  if (opened) {
    await delay(700)
    const rect = await cellRect('DropdownMenu')
    // Panels teleport to body and hang below the trigger; widen the clip downwards.
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, height: rect.height + 120, scale: 2 }, captureBeyondViewport: true })
    writeFileSync(`${OUT}/DropdownMenu-open.png`, Buffer.from(shot.data, 'base64'))
    console.log('wrote DropdownMenu-open')
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' })
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' })
    await delay(300)
  }
}

// Computed colour dump for the pill family (StatusBadge / Badge / Tag / Alert) + tokens.
const metrics = await evaluate(client, `(() => {
  const pick = (el, props) => { const cs = getComputedStyle(el); const o = {}; for (const p of props) o[p] = cs[p]; return o }
  const rectOf = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) } }
  const statusBadges = [...document.querySelectorAll('.docs-gallery .tx-status-badge')].map((el) => {
    const icon = el.querySelector('.tx-status-badge__icon')
    return {
      text: el.textContent.trim(),
      rect: rectOf(el),
      ...pick(el, ['color', 'backgroundColor', 'borderTopColor', 'borderRadius', 'fontSize', 'fontWeight', 'padding', 'gap']),
      iconClass: icon && icon.className,
      iconFontSize: icon && getComputedStyle(icon).fontSize,
      iconRect: icon && rectOf(icon),
    }
  })
  const badges = [...document.querySelectorAll('.docs-gallery .tx-badge, .docs-gallery [class*="tx-badge"]')].slice(0, 6).map(el => ({ cls: el.className, text: el.textContent.trim(), ...pick(el, ['color', 'backgroundColor', 'borderTopColor']) }))
  const tags = [...document.querySelectorAll('.docs-gallery .tx-tag')].map(el => ({ text: el.textContent.trim(), ...pick(el, ['color', 'backgroundColor', 'borderTopColor']) }))
  const alerts = [...document.querySelectorAll('.docs-gallery .tx-alert')].map(el => ({ cls: el.className, ...pick(el, ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor']) }))
  const stepIcons = [...document.querySelectorAll('.docs-gallery .tx-step__icon')].map(el => ({ cls: el.className, ...pick(el, ['color', 'backgroundColor', 'borderTopColor']) }))
  const timelineDots = [...document.querySelectorAll('.docs-gallery [class*="tx-timeline-item__dot"]')].map(el => ({ cls: el.className, ...pick(el, ['backgroundColor']) }))
  const tabBadges = [...document.querySelectorAll('.docs-gallery .tx-tab-bar__badge')].map(el => ({ text: el.textContent.trim(), ...pick(el, ['color', 'backgroundColor']) }))
  const stage = document.querySelector('.docs-gallery__stage')
  const root = getComputedStyle(document.documentElement)
  const token = n => root.getPropertyValue(n).trim()
  return {
    htmlClass: document.documentElement.className,
    stageBg: getComputedStyle(stage).backgroundColor,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    pageBg: getComputedStyle(document.querySelector('.docs-gallery') || document.body).backgroundColor,
    tokens: {
      success: token('--tx-color-success'), warning: token('--tx-color-warning'), danger: token('--tx-color-danger'),
      successRgb: token('--tx-color-success-rgb'), warningRgb: token('--tx-color-warning-rgb'), dangerRgb: token('--tx-color-danger-rgb'),
      dangerLight5: token('--tx-color-danger-light-5'), dangerLight9: token('--tx-color-danger-light-9'),
      primary: token('--tx-color-primary'), bg: token('--tx-bg-color'), overlay: token('--tx-bg-color-overlay'), textSecondary: token('--tx-text-color-secondary'),
    },
    statusBadges, badges, tags, alerts, stepIcons, timelineDots, tabBadges,
  }
})()`)
writeFileSync(`${OUT}/_metrics.json`, JSON.stringify(metrics, null, 2))
console.log('METRICS', JSON.stringify(metrics, null, 1))

client.close()
await closeTarget(target.id)
console.log('done', OUT)
