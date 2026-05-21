import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { auditDate, reportDir, repoRoot } from './audit-cdp-client.mjs'

const componentsRoot = path.join(repoRoot, 'packages/tuffex/packages/components/src')
const docsRoot = path.join(repoRoot, 'packages/tuffex/docs/components')
const componentExportsPath = path.join(componentsRoot, 'components.ts')
const configPath = path.join(repoRoot, 'packages/tuffex/docs/.vitepress/config.ts')
const indexPath = path.join(docsRoot, 'index.md')
const qualityDir = path.join(repoRoot, 'packages/tuffex/docs/quality')
const matrixPath = path.join(qualityDir, `component-page-matrix-${auditDate}.md`)
const reportPath = path.join(reportDir, 'inventory-report.json')

const splitDocsPages = new Set(['avatar-variants', 'chat-composer', 'typing-indicator'])
const nonUiSourceDirs = new Set(['utils'])
const mobileFocusedPages = new Set([
  'button',
  'input',
  'textarea',
  'number-input',
  'select',
  'flat-select',
  'checkbox',
  'radio',
  'flat-radio',
  'switch',
  'slider',
  'date-picker',
  'cascader',
  'tree-select',
  'tabs',
  'tab-bar',
  'nav-bar',
  'dropdown-menu',
  'context-menu',
  'popover',
  'tooltip',
  'dialog',
  'modal',
  'drawer',
  'toast',
  'command-palette',
  'data-table',
  'transfer',
  'scroll',
  'virtual-list',
  'file-uploader',
  'image-uploader',
  'chat',
  'chat-composer',
  'copy-button',
  'divider',
  'kbd',
])
const interactionCoveredPages = new Set([
  'select',
  'flat-select',
  'checkbox',
  'radio',
  'flat-radio',
  'switch',
  'textarea',
  'number-input',
  'data-table',
  'modal',
  'tooltip',
  'popover',
  'drawer',
  'command-palette',
  'toast',
  'date-picker',
  'cascader',
  'tree-select',
  'transfer',
  'slider',
  'virtual-list',
  'file-uploader',
  'image-uploader',
  'copy-button',
  'chat-composer',
  'tabs',
])

function stripExtension(file) {
  return file.replace(/\.md$/, '')
}

async function listDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true })
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
}

async function listDocsPages() {
  const entries = await readdir(docsRoot, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => stripExtension(entry.name))
    .sort()
}

function extractAll(pattern, content) {
  const matches = []
  for (const match of content.matchAll(pattern))
    matches.push(match[1])
  return matches.sort()
}

function result(value) {
  return value ? 'PASS' : 'FAIL'
}

function mark(value) {
  return value ? 'yes' : 'no'
}

function componentUrl(page) {
  return page === 'index' ? '/components/' : `/components/${page}.html`
}

const [sourceDirs, docsPages, componentExportsContent, configContent, indexContent] = await Promise.all([
  listDirectories(componentsRoot),
  listDocsPages(),
  readFile(componentExportsPath, 'utf8'),
  readFile(configPath, 'utf8'),
  readFile(indexPath, 'utf8'),
])

const uiSourceDirs = sourceDirs.filter(dir => !nonUiSourceDirs.has(dir))
const exportedDirs = extractAll(/export\s+\*\s+from\s+'\.\/([^']+)\/index'/g, componentExportsContent)
const sidebarLinks = extractAll(/link:\s+'\/components\/([^']+)'/g, configContent)
const indexLinks = [
  ...extractAll(/\]\(\/components\/([^)]+)\)/g, indexContent),
  ...extractAll(/\]\(\.\/([^)]+\.md(?:#[^)]+)?)\)/g, indexContent),
]
  .map(link => link.split('#')[0].replace(/\.html$/, '').replace(/\.md$/, '').replace(/\/$/, ''))
  .filter((link, index, list) => link && list.indexOf(link) === index)
  .sort()

const sourceSet = new Set(uiSourceDirs)
const exportSet = new Set(exportedDirs)
const docsSet = new Set(docsPages.filter(page => page !== 'index'))
const sidebarSet = new Set(sidebarLinks)
const indexSet = new Set(indexLinks)

const allPages = [...new Set([...docsSet, ...splitDocsPages, ...sourceSet])].sort()
const rows = allPages.map((page) => {
  const hasSource = sourceSet.has(page)
  const isSplitDoc = splitDocsPages.has(page)
  return {
    page,
    url: componentUrl(page),
    source: hasSource,
    splitDoc: isSplitDoc && !hasSource,
    exported: hasSource ? exportSet.has(page) : true,
    docs: docsSet.has(page),
    sidebar: sidebarSet.has(page),
    index: indexSet.has(page),
    desktop: true,
    theme: true,
    mobileFocused: mobileFocusedPages.has(page),
    interactionSmoke: interactionCoveredPages.has(page),
  }
})

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    sourceDirectories: sourceDirs.length,
    uiSourceDirectories: uiSourceDirs.length,
    nonUiSourceDirectories: sourceDirs.length - uiSourceDirs.length,
    exportedComponents: exportedDirs.length,
    docsPages: docsPages.filter(page => page !== 'index').length,
    docsPagesIncludingIndex: docsPages.length,
    sidebarLinks: sidebarLinks.length,
    indexLinks: indexLinks.length,
    splitDocsPages: splitDocsPages.size,
    mobileFocusedPages: mobileFocusedPages.size,
    interactionSmokePages: interactionCoveredPages.size,
  },
  status: {
    sourceExport: uiSourceDirs.every(dir => exportSet.has(dir)),
    sourceDocs: uiSourceDirs.every(dir => docsSet.has(dir)),
    docsSidebar: [...docsSet].every(page => sidebarSet.has(page)),
    docsIndex: [...docsSet].every(page => page === 'index' || indexSet.has(page)),
  },
  missing: {
    exports: uiSourceDirs.filter(dir => !exportSet.has(dir)),
    docs: uiSourceDirs.filter(dir => !docsSet.has(dir)),
    sidebar: [...docsSet].filter(page => !sidebarSet.has(page)),
    index: [...docsSet].filter(page => page !== 'index' && !indexSet.has(page)),
    sourceForDocs: [...docsSet].filter(page => !sourceSet.has(page) && !splitDocsPages.has(page)),
  },
  rows,
}

const markdown = [
  `# TuffEx Component Page Matrix - ${auditDate}`,
  '',
  '## Reconciliation',
  '',
  '| Surface | Count | Result |',
  '| --- | ---: | --- |',
  `| Source directories | ${report.counts.sourceDirectories} | PASS |`,
  `| UI source directories | ${report.counts.uiSourceDirectories} | PASS |`,
  `| Non-UI source directories | ${report.counts.nonUiSourceDirectories} | PASS |`,
  `| Component exports | ${report.counts.exportedComponents} | ${result(report.status.sourceExport)} |`,
  `| Component docs pages | ${report.counts.docsPages} | ${result(report.status.sourceDocs && report.missing.sourceForDocs.length === 0)} |`,
  `| Docs pages including index | ${report.counts.docsPagesIncludingIndex} | PASS |`,
  `| VitePress sidebar links | ${report.counts.sidebarLinks} | ${result(report.status.docsSidebar)} |`,
  `| Component index links | ${report.counts.indexLinks} | ${result(report.status.docsIndex)} |`,
  '',
  'Notes:',
  '',
  '- `utils` is a non-UI source directory and is excluded from component export/doc requirements.',
  '- `avatar-variants`, `chat-composer`, and `typing-indicator` are split documentation pages for exported source components.',
  '- Desktop and theme columns are backed by the full screenshot audits; mobile and interaction columns mark the focused subsets.',
  '',
  '## Page Matrix',
  '',
  '| Page | URL | Source | Split doc | Export | Docs | Sidebar | Index | Desktop | Theme | Mobile focused | Interaction |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(row => `| ${row.page} | \`${row.url}\` | ${mark(row.source)} | ${mark(row.splitDoc)} | ${mark(row.exported)} | ${mark(row.docs)} | ${mark(row.sidebar)} | ${mark(row.index)} | yes | yes | ${mark(row.mobileFocused)} | ${mark(row.interactionSmoke)} |`),
  '',
].join('\n')

await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(matrixPath, markdown),
])

console.log(`Inventory report: ${reportPath}`)
console.log(`Component matrix: ${matrixPath}`)

if (Object.values(report.status).some(value => !value) || Object.values(report.missing).some(items => items.length > 0))
  process.exitCode = 1
