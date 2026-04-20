#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { getArgValue, hasFlag, toBool } from './lib/argv-utils.mjs'

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function parseUpdateDate(text) {
  const match = text.match(/更新时间[：:]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)
  return match?.[1] ?? null
}

function parsePilotImageBranches(workflowText) {
  const match = workflowText.match(/push:\s*\n\s*branches:\s*\n((?:\s*-\s*[^\n]+\n)+)/m)
  if (!match)
    return []
  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean)
}

function parseBranchDefaultFromDeployReadme(text) {
  const line = text
    .split('\n')
    .find(item => item.includes('PILOT_WEBHOOK_ALLOWED_BRANCH'))
  if (!line)
    return null

  const ticks = [...line.matchAll(/`([^`]+)`/g)].map(match => match[1])
  return ticks[ticks.length - 1] ?? null
}

const repoRoot = process.cwd()
const argv = process.argv
const strict = toBool(getArgValue(argv, '--strict', hasFlag(argv, '--strict')))
const jsonOutput = hasFlag(argv, '--json')

const mainDocs = [
  'docs/INDEX.md',
  'docs/plan-prd/README.md',
  'docs/plan-prd/TODO.md',
  'docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md',
  'docs/plan-prd/01-project/CHANGES.md',
  'docs/plan-prd/docs/PRD-QUALITY-BASELINE.md',
]
const nextActionDocs = [
  'docs/INDEX.md',
  'docs/plan-prd/README.md',
  'docs/plan-prd/TODO.md',
  'docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md',
  'docs/plan-prd/01-project/CHANGES.md',
]
const activeDocsForStaleCheck = [...new Set([...mainDocs, '.github/workflows/README.md', 'apps/pilot/deploy/README.md', 'apps/pilot/deploy/README.zh-CN.md'])]

const checks = []
function pushCheck(name, status, detail, meta = {}) {
  checks.push({ name, status, detail, ...meta })
}

try {
  const textByFile = new Map()
  for (const relativePath of activeDocsForStaleCheck) {
    const absPath = path.join(repoRoot, relativePath)
    if (!fs.existsSync(absPath)) {
      pushCheck('file-exists', 'fail', `Missing required file: ${relativePath}`)
      continue
    }
    textByFile.set(relativePath, readText(absPath))
  }

  // 1) Main-doc update date consistency
  const updateDates = {}
  for (const relativePath of mainDocs) {
    const text = textByFile.get(relativePath) ?? readText(path.join(repoRoot, relativePath))
    const date = parseUpdateDate(text)
    updateDates[relativePath] = date
  }
  const missingDateFiles = Object.entries(updateDates).filter(([, date]) => !date).map(([file]) => file)
  if (missingDateFiles.length > 0) {
    pushCheck('main-doc-dates', 'fail', 'Some main docs are missing update date.', { missingDateFiles, updateDates })
  }
  else {
    const uniqueDates = Array.from(new Set(Object.values(updateDates)))
    if (uniqueDates.length === 1) {
      pushCheck('main-doc-dates', 'pass', `Main-doc update dates are consistent: ${uniqueDates[0]}.`, { updateDates })
    }
    else {
      pushCheck('main-doc-dates', 'fail', 'Main-doc update dates are not consistent.', { updateDates, uniqueDates })
    }
  }

  // 2) Next-action consistency
  const nextActionKeyword = 'CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配'
  const missingNextAction = nextActionDocs.filter((file) => {
    const text = textByFile.get(file) ?? ''
    return !text.includes(nextActionKeyword)
  })
  if (missingNextAction.length === 0) {
    pushCheck('next-action', 'pass', `All main docs include next action keyword: ${nextActionKeyword}.`)
  }
  else {
    pushCheck('next-action', 'fail', 'Some docs do not include unified next action keyword.', {
      keyword: nextActionKeyword,
      missingNextAction,
    })
  }

  // 3) TODO live statistics consistency
  {
    const todoPath = 'docs/plan-prd/TODO.md'
    const todoText = textByFile.get(todoPath) ?? readText(path.join(repoRoot, todoPath))

    const doneActual = (todoText.match(/^- \[x\]/gmi) || []).length
    const todoActual = (todoText.match(/^- \[ \]/gmi) || []).length
    const totalActual = doneActual + todoActual
    const pctActual = totalActual > 0 ? Math.round((doneActual / totalActual) * 100) : 0

    const doneDeclared = Number((todoText.match(/\|\s*已完成\s*\(`- \[x\]`\)\s*\|\s*(\d+)\s*\|/) || [])[1])
    const todoDeclared = Number((todoText.match(/\|\s*未完成\s*\(`- \[ \]`\)\s*\|\s*(\d+)\s*\|/) || [])[1])
    const totalDeclared = Number((todoText.match(/\|\s*总计\s*\|\s*(\d+)\s*\|/) || [])[1])
    const pctDeclared = Number((todoText.match(/\|\s*完成率\s*\|\s*(\d+)%\s*\|/) || [])[1])

    const declaredMissing = [doneDeclared, todoDeclared, totalDeclared, pctDeclared].some(Number.isNaN)
    if (declaredMissing) {
      pushCheck('todo-stats', 'fail', 'TODO statistics table is missing one or more declared values.')
    }
    else if (doneActual === doneDeclared && todoActual === todoDeclared && totalActual === totalDeclared && pctActual === pctDeclared) {
      pushCheck('todo-stats', 'pass', 'TODO statistics match live checkbox counts.', {
        actual: { done: doneActual, todo: todoActual, total: totalActual, pct: pctActual },
      })
    }
    else {
      pushCheck('todo-stats', 'fail', 'TODO statistics do not match live checkbox counts.', {
        actual: { done: doneActual, todo: todoActual, total: totalActual, pct: pctActual },
        declared: { done: doneDeclared, todo: todoDeclared, total: totalDeclared, pct: pctDeclared },
      })
    }
  }

  // 4) Known stale phrase checks
  const stalePhrases = [
    '当前下一动作聚焦 `CLI 分包迁移',
    '`CLI 分包迁移收口（core 真迁移 + 文档统一） -> 主文档同步验收`',
    '2.4.8-beta.3',
  ]
  const staleMatches = []
  for (const relativePath of activeDocsForStaleCheck) {
    const text = textByFile.get(relativePath) ?? ''
    for (const phrase of stalePhrases) {
      if (text.includes(phrase)) {
        staleMatches.push({ file: relativePath, phrase })
      }
    }
  }
  if (staleMatches.length === 0) {
    pushCheck('stale-phrases', 'pass', 'No known stale phrase found in active governance docs.')
  }
  else {
    pushCheck('stale-phrases', 'fail', 'Found known stale phrase(s) in active governance docs.', { staleMatches })
  }

  // 5) Workflow/ops doc consistency (branch, token, trigger)
  {
    const workflowPath = '.github/workflows/pilot-image.yml'
    const workflowReadmePath = '.github/workflows/README.md'
    const deployReadmeEnPath = 'apps/pilot/deploy/README.md'
    const deployReadmeZhPath = 'apps/pilot/deploy/README.zh-CN.md'

    const workflowText = readText(path.join(repoRoot, workflowPath))
    const workflowReadme = textByFile.get(workflowReadmePath) ?? ''
    const deployReadmeEn = textByFile.get(deployReadmeEnPath) ?? ''
    const deployReadmeZh = textByFile.get(deployReadmeZhPath) ?? ''

    const branches = parsePilotImageBranches(workflowText)
    const defaultBranch = branches[0] ?? null

    const branchIssues = []
    if (!defaultBranch) {
      branchIssues.push('Unable to parse pilot-image workflow push branch.')
    }
    else {
      if (!workflowReadme.includes(`\`${defaultBranch}\``))
        branchIssues.push(`Workflow README does not mention default branch \`${defaultBranch}\`.`)

      const enDefault = parseBranchDefaultFromDeployReadme(deployReadmeEn)
      const zhDefault = parseBranchDefaultFromDeployReadme(deployReadmeZh)

      if (enDefault && enDefault !== defaultBranch)
        branchIssues.push(`Deploy README (EN) default branch mismatch: ${enDefault} vs ${defaultBranch}.`)
      if (zhDefault && zhDefault !== defaultBranch)
        branchIssues.push(`Deploy README (ZH) default branch mismatch: ${zhDefault} vs ${defaultBranch}.`)
    }

    const requiredTokens = [
      { file: workflowReadmePath, keywords: ['ONEPANEL_WEBHOOK_URL', 'ONEPANEL_WEBHOOK_TOKEN', 'POST /deploy', 'X-Pilot-Token'] },
      { file: deployReadmeEnPath, keywords: ['PILOT_WEBHOOK_TOKEN', 'ONEPANEL_WEBHOOK_TOKEN', 'POST /deploy', 'X-Pilot-Token'] },
      { file: deployReadmeZhPath, keywords: ['PILOT_WEBHOOK_TOKEN', 'ONEPANEL_WEBHOOK_TOKEN', 'POST /deploy', 'X-Pilot-Token'] },
    ]
    const tokenIssues = []
    for (const rule of requiredTokens) {
      const text = textByFile.get(rule.file) ?? ''
      const missingKeywords = rule.keywords.filter(keyword => !text.includes(keyword))
      if (missingKeywords.length > 0) {
        tokenIssues.push({ file: rule.file, missingKeywords })
      }
    }

    if (branchIssues.length === 0 && tokenIssues.length === 0) {
      pushCheck('ops-doc-consistency', 'pass', 'Workflow and pilot deploy docs are consistent for branch/token/trigger fields.', {
        defaultBranch,
        branches,
      })
    }
    else {
      pushCheck('ops-doc-consistency', 'fail', 'Workflow and pilot deploy docs are inconsistent.', {
        defaultBranch,
        branches,
        branchIssues,
        tokenIssues,
      })
    }
  }
}
catch (error) {
  pushCheck('runtime', 'fail', `Doc governance check crashed: ${error instanceof Error ? error.message : String(error)}`)
}

const summary = {
  pass: checks.filter(item => item.status === 'pass').length,
  warn: checks.filter(item => item.status === 'warn').length,
  fail: checks.filter(item => item.status === 'fail').length,
  total: checks.length,
}

let result = 'pass'
if (summary.fail > 0)
  result = 'fail'
else if (summary.warn > 0)
  result = 'warn'

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify({ result, strict, summary, checks }, null, 2)}\n`)
}
else {
  console.log(`[doc-governance] result=${result} strict=${strict}`)
  console.log(`[doc-governance] summary pass=${summary.pass} warn=${summary.warn} fail=${summary.fail} total=${summary.total}`)
  for (const item of checks) {
    console.log(`- [${item.status.toUpperCase()}] ${item.name}: ${item.detail}`)
  }
}

if (strict && (summary.warn > 0 || summary.fail > 0)) {
  process.exit(1)
}

process.exit(0)
