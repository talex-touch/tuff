import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { auditDate, reportDir, repoRoot } from './audit-cdp-client.mjs'

const docsRoot = path.join(repoRoot, 'packages/tuffex/docs/components')
const qualityDir = path.join(repoRoot, 'packages/tuffex/docs/quality')
const reportPath = path.join(reportDir, 'coverage-report.json')
const matrixPath = path.join(qualityDir, `component-coverage-matrix-${auditDate}.md`)

const focusedCoverage = [
  {
    page: 'button',
    checks: {
      basic: ['基础', 'Appearance'],
      disabled: ['disabled', '禁用'],
      loading: ['loading', '加载'],
      variants: ['variant', 'Primary', 'Danger'],
      interaction: ['@click', 'handleClick'],
    },
  },
  {
    page: 'input',
    checks: {
      basic: ['基础用法'],
      disabled: ['disabled', '禁用'],
      readonly: ['readonly', '只读'],
      clearable: ['clearable', '可清空'],
      affix: ['prefix', 'suffix', 'Affix slots'],
    },
  },
  {
    page: 'select',
    checks: {
      basic: ['基础用法'],
      disabled: ['禁用状态', 'disabled'],
      disabledOption: ['禁用选项'],
      searchable: ['可搜索', 'searchable'],
      remote: ['远程搜索', 'remote'],
      scrollable: ['滚动面板', 'dropdown-max-height'],
    },
  },
  {
    page: 'checkbox',
    checks: {
      basic: ['基础用法'],
      checked: ['basicChecked'],
      disabled: ['禁用状态', 'disabled'],
      noLabel: ['无文案', 'aria-label'],
      slot: ['使用插槽'],
    },
  },
  {
    page: 'radio',
    checks: {
      standard: ['标准单选形式'],
      card: ['卡片单选形式'],
      buttonGroup: ['按钮组形式'],
      disabled: ['禁用状态'],
      keyboard: ['ArrowRight', 'Home / End'],
      playground: ['Playground'],
    },
  },
  {
    page: 'switch',
    checks: {
      basic: ['Basic Usage'],
      disabled: ['Disabled', 'disabled'],
      sizes: ['Sizes', 'size='],
      interaction: ['v-model', 'change'],
    },
  },
  {
    page: 'tabs',
    checks: {
      basic: ['基础用法'],
      placement: ['布局方向', 'placement'],
      dynamic: ['动态内容尺寸'],
      disabled: ['disabled', '禁用'],
      animation: ['关闭动画', 'animation'],
    },
  },
  {
    page: 'dialog',
    checks: {
      basic: ['基础用法'],
      buttonTypes: ['按钮类型', 'warning', 'error'],
      loading: ['加载状态', 'loading'],
      variants: ['BottomDialog', 'BlowDialog', 'PopperDialog', 'TouchTip'],
      accessibility: ['ESC 键', 'role="dialog"'],
    },
  },
  {
    page: 'modal',
    checks: {
      basic: ['Basic Usage'],
      footer: ['#footer', 'Cancel', 'Confirm'],
      width: ['width'],
      dismissal: ['Escape', 'close-button'],
      accessibility: ['role="dialog"', 'aria-modal'],
    },
  },
  {
    page: 'popover',
    checks: {
      basic: ['基础用法'],
      hover: ['hover', 'trigger'],
      disabled: ['disabled', '禁用'],
      placement: ['placement'],
      visual: ['visual effects', 'panelBackground'],
    },
  },
  {
    page: 'toast',
    checks: {
      basic: ['基础用法'],
      variants: ['success', 'warning', 'danger'],
      duration: ['duration', '自动关闭'],
      dismiss: ['dismissToast', 'Dismiss notification'],
      replace: ['相同 `id`', '替换'],
    },
  },
  {
    page: 'data-table',
    checks: {
      basic: ['Basic Usage'],
      selection: ['Row Selection', 'selectable'],
      sorting: ['sortable', 'sortChange'],
      loading: ['loading', 'Show loading overlay'],
      empty: ['emptyText', 'empty'],
      customCell: ['cell-{columnKey}', 'Custom cell'],
    },
  },
]

function hasAll(content, needles) {
  return needles.every(needle => content.toLowerCase().includes(needle.toLowerCase()))
}

function decodeHtmlEntities(input) {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', '\'')
}

function extractTitle(attributes) {
  const directTitle = attributes.match(/(?:^|\s)title=(["'])(.*?)\1/)
  if (directTitle)
    return directTitle[2]

  const boundTitle = attributes.match(/(?:^|\s):title=(["'])(.*?)\1/)
  if (boundTitle)
    return boundTitle[2]

  return ''
}

function extractRawCodeBinding(attributes) {
  return attributes.match(/(?:^|\s):code=(["'])(.*?)\1/)?.[2] || ''
}

async function resolveRawImports(content, filePath) {
  const imports = new Map()
  const importPattern = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+\.vue)\?raw['"]/g
  for (const match of content.matchAll(importPattern)) {
    const [, binding, specifier] = match
    const importPath = path.resolve(path.dirname(filePath), specifier)
    imports.set(binding, await readFile(importPath, 'utf8'))
  }
  return imports
}

function headingPathBefore(content, index) {
  const headings = [...content.slice(0, index).matchAll(/^(#{2,3})\s+(.+)$/gm)]
  const path = []
  for (const heading of headings) {
    const level = heading[1].length
    const title = heading[2].replace(/<[^>]+>/g, '').trim()
    if (level === 2)
      path.splice(0, path.length, title)
    else if (level === 3)
      path[1] = title
  }
  return path.join(' / ')
}

function extractNamedSlot(block, slotName) {
  const pattern = new RegExp(`<template\\s+#${slotName}[^>]*>([\\s\\S]*?)<\\/template>`, 'i')
  return decodeHtmlEntities(block.match(pattern)?.[1] || '')
}

function stripApiSections(content) {
  return content.replace(/^##\s+API\b[\s\S]*$/m, '')
}

function stripHiddenExamples(content) {
  return content
    .replace(/::: details[\s\S]*?:::/g, '')
    .replace(/```[\s\S]*?```/g, '')
}

async function extractDemoEvidence(content, filePath) {
  const rawImports = await resolveRawImports(content, filePath)
  const evidence = []
  const demoPattern = /<DemoBlock\b([^>]*)>([\s\S]*?)<\/DemoBlock>/g

  for (const match of content.matchAll(demoPattern)) {
    const [, attributes, block] = match
    const rawBinding = extractRawCodeBinding(attributes)
    const rawCode = rawBinding ? rawImports.get(rawBinding) || '' : ''
    evidence.push([
      headingPathBefore(content, match.index),
      extractTitle(attributes),
      extractNamedSlot(block, 'preview'),
      extractNamedSlot(block, 'code'),
      rawCode,
    ].filter(Boolean).join('\n'))
  }

  return evidence.join('\n\n--- demo ---\n\n')
}

const results = []
for (const entry of focusedCoverage) {
  const filePath = path.join(docsRoot, `${entry.page}.md`)
  const content = await readFile(filePath, 'utf8')
  const visibleContent = stripHiddenExamples(stripApiSections(content))
  const evidence = [
    visibleContent.match(/^##\s+[^#].*$/gm)?.join('\n') || '',
    visibleContent,
    await extractDemoEvidence(content, filePath),
  ].filter(Boolean).join('\n\n')
  const checks = Object.entries(entry.checks).map(([name, needles]) => ({
    name,
    needles,
    passed: hasAll(evidence, needles),
  }))

  results.push({
    page: entry.page,
    file: filePath,
    passed: checks.every(check => check.passed),
    checks,
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter(result => result.passed).length,
  failed: results.filter(result => !result.passed).length,
  results,
}

const checkNames = [...new Set(focusedCoverage.flatMap(entry => Object.keys(entry.checks)))]
const markdown = [
  `# TuffEx Focused Coverage Matrix - ${auditDate}`,
  '',
  'This matrix tracks the plan-prioritized high-frequency components and their required docs/demo states.',
  '',
  '| Page | Result | Missing |',
  '| --- | --- | --- |',
  ...results.map((result) => {
    const missing = result.checks.filter(check => !check.passed).map(check => check.name)
    return `| ${result.page} | ${result.passed ? 'PASS' : 'FAIL'} | ${missing.length > 0 ? missing.join(', ') : '-'} |`
  }),
  '',
  '## Detailed Checks',
  '',
  `| Page | ${checkNames.join(' | ')} |`,
  `| --- | ${checkNames.map(() => '---').join(' | ')} |`,
  ...results.map((result) => {
    const state = new Map(result.checks.map(check => [check.name, check.passed]))
    return `| ${result.page} | ${checkNames.map(name => state.has(name) ? (state.get(name) ? 'yes' : 'no') : '-').join(' | ')} |`
  }),
  '',
].join('\n')

await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(matrixPath, markdown),
])

console.log(`Coverage report: ${reportPath}`)
console.log(`Coverage matrix: ${matrixPath}`)

if (report.failed > 0)
  process.exitCode = 1
