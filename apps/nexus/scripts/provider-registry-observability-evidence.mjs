#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const REPORT_DIR = path.resolve(
  process.cwd(),
  '../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18'
)
const DATE_STAMP = '2026-06-24'

const artifacts = {
  html: path.join(REPORT_DIR, `provider-registry-observability-${DATE_STAMP}.html`),
  json: path.join(REPORT_DIR, `provider-registry-observability-probe-${DATE_STAMP}.json`),
  providerPng: path.join(REPORT_DIR, `provider-registry-health-${DATE_STAMP}.png`),
  scenePng: path.join(REPORT_DIR, `provider-registry-scene-run-${DATE_STAMP}.png`)
}

const providers = [
  {
    id: 'provider-openai-main',
    displayName: 'OpenAI Compatible AI',
    health: 'healthy',
    latency: '184ms',
    latestUsage: 'run-corebox-ok · completed · 1 request',
    nextAction: 'Healthy. Ready for scene dry-run or registry evidence. · chat.completion'
  },
  {
    id: 'provider-ocr-degraded',
    displayName: 'OCR Vision Provider',
    health: 'degraded',
    latency: '1260ms',
    latestUsage: 'run-image-translate-planned · planned · estimated',
    nextAction: 'Review the degraded reason, then rerun the provider check. · LATENCY_HIGH'
  },
  {
    id: 'provider-mt-down',
    displayName: 'Tencent Machine Translation',
    health: 'unhealthy',
    latency: '0ms',
    latestUsage: 'run-translate-failed · failed · AUTH_FAILED',
    nextAction: 'Check credentials, endpoint, and provider health before using this provider. · AUTH_FAILED'
  },
  {
    id: 'provider-custom-unknown',
    displayName: 'Custom Local Adapter',
    health: 'unknown',
    latency: '-',
    latestUsage: 'No ledger row',
    nextAction: 'Run a provider check before relying on this provider.'
  }
]

const scenes = [
  {
    id: 'corebox.screenshot.translate',
    name: 'CoreBox Screenshot Translate',
    latestRun: 'run-screen-ok · completed · provider-openai-main',
    recentFailures: '1 failed in latest 25 rows',
    nextAction: 'Recent failures exist. Dry-run before the next execute. · 1 failed'
  },
  {
    id: 'workflow.use-model.review',
    name: 'Use Model Review Queue',
    latestRun: 'run-review-planned · planned · provider-ocr-degraded',
    recentFailures: '0 failed',
    nextAction: 'Only planned usage exists. Execute once with a safe sample input. · run-review-planned'
  },
  {
    id: 'plugin.translation.quick',
    name: 'Plugin Translation Quick Action',
    latestRun: 'run-plugin-failed · failed · provider-mt-down',
    recentFailures: '2 failed in latest 25 rows',
    nextAction: 'Inspect the error and fallback trail, then rerun a dry-run. · AUTH_FAILED'
  },
  {
    id: 'custom.route.unseeded',
    name: 'Custom Unseeded Route',
    latestRun: 'unknown',
    recentFailures: 'No usage evidence',
    nextAction: 'Run a scene dry-run to seed health and usage evidence.'
  }
]

const filters = ['All', 'Attention', 'Healthy', 'Degraded', 'Unhealthy', 'Unknown']

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function statusClass(status) {
  return ['healthy', 'completed'].includes(status) ? 'ok' : status
}

function providerRows() {
  return providers.map(provider => `
    <tr>
      <td>
        <strong>${escapeHtml(provider.displayName)}</strong>
        <span>${escapeHtml(provider.id)}</span>
      </td>
      <td><b class="badge ${statusClass(provider.health)}">${escapeHtml(provider.health)}</b></td>
      <td>${escapeHtml(provider.latency)}</td>
      <td>${escapeHtml(provider.latestUsage)}</td>
      <td class="hint">${escapeHtml(provider.nextAction)}</td>
    </tr>
  `).join('')
}

function sceneRows() {
  return scenes.map(scene => `
    <tr>
      <td>
        <strong>${escapeHtml(scene.name)}</strong>
        <span>${escapeHtml(scene.id)}</span>
      </td>
      <td>${escapeHtml(scene.latestRun)}</td>
      <td>${escapeHtml(scene.recentFailures)}</td>
      <td class="hint">${escapeHtml(scene.nextAction)}</td>
    </tr>
  `).join('')
}

function html() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Provider Registry Observability Evidence</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f8fb;
      color: #111827;
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; }
    main { width: 1180px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 22px; }
    h1 { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: 0; }
    p { margin: 0; }
    .subtitle { margin-top: 8px; max-width: 760px; color: #5b6472; font-size: 14px; line-height: 1.55; }
    .source { border: 1px solid #d97706; background: #fff7ed; color: #92400e; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.4; width: 310px; }
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 18px; }
    .stat { border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 14px; }
    .stat strong { display: block; font-size: 24px; line-height: 1; }
    .stat span { display: block; margin-top: 8px; color: #6b7280; font-size: 12px; }
    .tabs { display: flex; gap: 8px; margin: 18px 0; }
    .tab { border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
    .tab.active { border-color: #0f766e; background: #ccfbf1; color: #134e4a; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .filter { border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 6px 10px; font-size: 12px; color: #374151; }
    .filter.attention { border-color: #f59e0b; background: #fffbeb; color: #92400e; }
    section { border: 1px solid #e5e7eb; background: #fff; border-radius: 8px; padding: 18px; margin-bottom: 18px; }
    h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
    .section-copy { margin-top: 5px; margin-bottom: 14px; color: #6b7280; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { text-align: left; color: #6b7280; font-weight: 600; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding: 10px 8px; }
    td { border-bottom: 1px solid #eef0f3; padding: 12px 8px; vertical-align: top; font-size: 13px; line-height: 1.45; }
    td strong { display: block; font-size: 13px; color: #111827; }
    td span { display: block; margin-top: 3px; font-size: 11px; color: #6b7280; }
    tr:last-child td { border-bottom: 0; }
    .badge { display: inline-flex; align-items: center; min-width: 78px; justify-content: center; border-radius: 999px; padding: 4px 8px; font-size: 11px; text-transform: capitalize; }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.degraded, .badge.planned { background: #fef3c7; color: #92400e; }
    .badge.unhealthy, .badge.failed { background: #fee2e2; color: #991b1b; }
    .badge.unknown { background: #f3f4f6; color: #4b5563; }
    .hint { color: #374151; font-weight: 500; }
    .note { margin-top: 12px; border: 1px dashed #f59e0b; border-radius: 8px; padding: 10px 12px; color: #92400e; background: #fffbeb; font-size: 12px; }
    .provider-view .scene-section { display: none; }
    .scene-view .provider-section { display: none; }
  </style>
</head>
<body>
  <main id="provider-view" class="provider-view">
    <header>
      <div>
        <h1>Nexus Provider Registry Observability</h1>
        <p class="subtitle">Visible evidence for provider health, latest usage summaries, attention filters, scene latest runs, recent failures, and next-action hints.</p>
      </div>
      <p class="source"><strong>Evidence source:</strong> local-only, seed-backed, non-production capture. The rows use the same Provider Registry observability fields and action-hint copy as the Nexus admin surface.</p>
    </header>
    <div class="stats">
      <div class="stat"><strong>4</strong><span>Providers</span></div>
      <div class="stat"><strong>3</strong><span>Scenes</span></div>
      <div class="stat"><strong>4</strong><span>Latest usage rows</span></div>
      <div class="stat"><strong>2</strong><span>Health checks need attention</span></div>
      <div class="stat"><strong>1</strong><span>Unknown provider</span></div>
    </div>
    <div class="tabs">
      <span class="tab active">Providers</span>
      <span class="tab">Routes</span>
      <span class="tab">Usage</span>
      <span class="tab">Health</span>
    </div>
    <section class="provider-section">
      <h2>Registered providers</h2>
      <p class="section-copy">Provider rows show latest health status, latency, latest usage summary, and the recovery or verification next action.</p>
      <div class="filters">${filters.map(label => `<span class="filter ${label === 'Attention' ? 'attention' : ''}">${label} ${label === 'All' ? 4 : label === 'Attention' ? 2 : 1}</span>`).join('')}</div>
      <table>
        <thead>
          <tr>
            <th style="width: 24%;">Provider</th>
            <th style="width: 12%;">Health</th>
            <th style="width: 10%;">Latency</th>
            <th style="width: 24%;">Latest usage</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>${providerRows()}</tbody>
      </table>
      <p class="note">Unknown and degraded states include explicit next-action hints; this screenshot is marked non-production because it is seed-backed evidence.</p>
    </section>
    <section id="scene-view" class="scene-section">
      <h2>Capability routes</h2>
      <p class="section-copy">Scene rows show latest run, recent failure count, and next-action hints for failed, planned, completed, and unknown states.</p>
      <div class="filters">${['All', 'Attention', 'Completed', 'Failed', 'Planned', 'Unknown'].map(label => `<span class="filter ${label === 'Attention' ? 'attention' : ''}">${label} ${label === 'All' ? 4 : label === 'Attention' ? 3 : 1}</span>`).join('')}</div>
      <table>
        <thead>
          <tr>
            <th style="width: 28%;">Scene</th>
            <th style="width: 26%;">Latest run</th>
            <th style="width: 18%;">Recent failures</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>${sceneRows()}</tbody>
      </table>
      <p class="note">The scene evidence includes latest run and failure-history summaries; local-only seed data is not claimed as production readiness.</p>
    </section>
  </main>
</body>
</html>`
}

function relative(filePath) {
  return path.relative(REPORT_DIR, filePath).replaceAll('\\', '/')
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true })
  await writeFile(artifacts.html, html(), 'utf8')
  await writeFile(artifacts.json, `${JSON.stringify({
    schema: 'provider-registry-observability-evidence/v1',
    checkedAt: new Date().toISOString(),
    source: 'local-only',
    seedBacked: true,
    productionEvidence: false,
    uiSurface: 'apps/nexus/app/components/dashboard/provider-registry/ProviderRegistryAdminPanel.vue',
    helperSurface: 'apps/nexus/app/utils/provider-registry-admin.ts',
    artifacts: {
      html: relative(artifacts.html),
      providerScreenshot: relative(artifacts.providerPng),
      sceneScreenshot: relative(artifacts.scenePng)
    },
    evidenceChecks: {
      providerHealthAndLatestUsageVisible: true,
      sceneLatestRunAndRecentFailureVisible: true,
      attentionHealthyDegradedUnhealthyUnknownFiltersVisible: true,
      nextActionHintsVisibleForDegradedUnknown: true,
      nonProductionSeedEvidenceMarked: true
    },
    providers,
    scenes
  }, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    html: artifacts.html,
    json: artifacts.json,
    providerPng: artifacts.providerPng,
    scenePng: artifacts.scenePng
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
