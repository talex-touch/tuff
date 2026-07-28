import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import remarkMdc from 'remark-mdc'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { validateReleaseNotesAtRepo } from '../lib/release-notes-contract.mjs'

const DEFAULT_CAP = 100
const POSIX = value => value.split(path.sep).join('/')
const productDocument = file => /\.(?:md|mdc)$/i.test(file) && !(/^(?:\.trellis\/|node_modules\/|dist\/|coverage\/|\.github\/|CLAUDE\.md$|apps\/nexus\/examples\/|docs\/engineering\/reports\/|scripts\/docs\/fixtures\/)/.test(file))

export function trackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'buffer' })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map(POSIX)
    .sort()
}

export function scopeRegistry(repoRoot, tracked = trackedFiles(repoRoot)) {
  const files = [...tracked].sort()
  return { files, tracked: new Set(files), productDocs: files.filter(productDocument), activeTasks: files.filter(file => /^\.trellis\/tasks\/[^/]+\/task\.json$/.test(file)), archivedTasks: files.filter(file => /^\.trellis\/archive\//.test(file) && /\/task\.json$/.test(file)), activePrds: files.filter(file => /^\.trellis\/tasks\/[^/]+\/prd\.md$/.test(file)) }
}

function diagnostic(ruleId, file, point, message) {
  return { ruleId, file, line: point?.line ?? 0, column: point?.column ?? 0, message }
}
function resolveRelative(source, url) {
  const raw = url.split(/[?#]/, 1)[0]
  if (!raw || raw.startsWith('#') || raw.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//'))
    return null
  let decoded
  try {
    decoded = decodeURIComponent(raw)
  }
  catch {
    return { error: 'invalid URL encoding' }
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded)).replace(/\/+$/, '')
  return resolved === '..' || resolved.startsWith('../') ? { error: 'repository escape' } : { target: resolved }
}

export function checkMarkdownAndLinks(repoRoot, scope) {
  const diagnostics = []
  for (const file of scope.productDocs) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    let tree
    try {
      tree = unified().use(remarkParse).use(remarkMdc).parse(text)
    }
    catch (error) {
      diagnostics.push(diagnostic('DOC-MARKDOWN-PARSE', file, null, error.message))
      continue
    }
    const visit = (node) => {
      if (node.type === 'link' || node.type === 'image') {
        const result = resolveRelative(file, node.url)
        if (result?.error)
          diagnostics.push(diagnostic('DOC-LINK-INVALID', file, node.position?.start, `${node.url}: ${result.error}`))
        else if (result && !scope.tracked.has(result.target) && !scope.tracked.has(`${result.target}/README.md`) && !scope.tracked.has(`${result.target}/index.md`) && !scope.files.some(tracked => tracked.startsWith(`${result.target}/`)))
          diagnostics.push(diagnostic('DOC-LINK-UNTRACKED', file, node.position?.start, `${node.url}: ${result.target} is not tracked`))
      }
      for (const child of node.children ?? []) visit(child)
    }
    visit(tree)
  }
  return diagnostics
}

export function checkReleaseNotes(repoRoot) {
  const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
  const core = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/core-app/package.json'), 'utf8')).version
  if (root !== core)
    return [diagnostic('DOC-RELEASE-VERSION', 'package.json', null, `root ${root} does not match CoreApp ${core}`)]
  const result = validateReleaseNotesAtRepo({ repoRoot, version: root })
  return (result.validation?.errors ?? []).map(error => diagnostic(`DOC-RELEASE-${error.code}`, POSIX(path.relative(repoRoot, result.paths[error.locale] ?? result.paths.zh)), null, error.message))
}

const ALLOWLIST = new Map([
  ['.trellis/tasks/07-17-unify-ota-update-flow/task.json', new Set(['DOC-TASK-META'])],
  ['.trellis/tasks/07-27-batch-commit-release-v2-4-14-beta-1/prd.md', new Set(['DOC-PRD-PLACEHOLDER'])],
  ['.trellis/tasks/07-27-documentation-quality-gates/prd.md', new Set(['DOC-PRD-PLACEHOLDER'])],
  ['.trellis/tasks/07-27-release-v2-4-14-beta-1/prd.md', new Set(['DOC-PRD-PLACEHOLDER'])],
  ['.trellis/tasks/07-27-sensitive-data-lifecycle-301/prd.md', new Set(['DOC-PRD-PLACEHOLDER'])],
])
function allowed(file, ruleId) {
  return ALLOWLIST.get(file)?.has(ruleId) ?? false
}

export function checkTasks(repoRoot, scope) {
  const diagnostics = []
  for (const file of scope.activeTasks) {
    let task
    try {
      task = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    }
    catch {
      diagnostics.push(diagnostic('DOC-TASK-JSON', file, null, 'invalid JSON'))
      continue
    }
    if (task.status === 'completed')
      diagnostics.push(diagnostic('DOC-TASK-ACTIVE-COMPLETED', file, null, 'completed task is active'))
    for (const key of ['assignee']) {
      if (!task[key])
        diagnostics.push(diagnostic('DOC-TASK-META', file, null, `missing ${key}`))
    }
    for (const key of ['nextAction', 'blocker', 'evidence']) {
      if (!task.meta?.[key])
        diagnostics.push(diagnostic('DOC-TASK-META', file, null, `missing meta.${key}`))
    }
  }
  return diagnostics.filter(item => !allowed(item.file, item.ruleId))
}

export function checkPlaceholders(repoRoot, scope) {
  const diagnostics = []
  const pattern = /\b(?:TBD|TODO:\s*fill)\b|<evidence>/gi
  for (const file of scope.activePrds) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    for (const match of text.matchAll(pattern)) diagnostics.push(diagnostic('DOC-PRD-PLACEHOLDER', file, null, `unresolved placeholder ${match[0]}`))
  }
  return diagnostics.filter(item => !allowed(item.file, item.ruleId))
}

export function verifyDocs(repoRoot) {
  const scope = scopeRegistry(repoRoot)
  const diagnostics = [...checkMarkdownAndLinks(repoRoot, scope), ...checkTasks(repoRoot, scope), ...checkReleaseNotes(repoRoot), ...checkPlaceholders(repoRoot, scope)]
  return diagnostics.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.message.localeCompare(b.message))
}

export function renderDiagnostics(diagnostics, cap = DEFAULT_CAP) {
  if (!diagnostics.length)
    return 'docs:verify passed\n'
  const shown = diagnostics.slice(0, cap)
  return `${shown.map(item => `${item.ruleId} ${item.file}:${item.line}:${item.column} ${item.message}`).join('\n')}\ndocs:verify failed: shown ${shown.length}/${diagnostics.length}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = renderDiagnostics(verifyDocs(process.cwd()))
  process.stdout.write(output)
  process.exitCode = output.startsWith('docs:verify passed') ? 0 : 1
}
