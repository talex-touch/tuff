import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { lint } from 'markdownlint/sync'
import remarkMdc from 'remark-mdc'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { verifyAiDocs } from '../ai-docs/verify-ai-docs.mjs'
import { validateReleaseNotesAtRepo } from '../lib/release-notes-contract.mjs'
import { MARKDOWNLINT_CONFIG, MARKDOWNLINT_CUSTOM_RULES } from './markdownlint-config.mjs'

const DEFAULT_CAP = 100
const POSIX = value => value.split(path.sep).join('/')
const TASK_JSON = /^\.trellis\/(?:tasks\/archive\/\d{4}-\d{2}|tasks)\/([^/]+)\/task\.json$/
const MARKDOWN = /\.(?:md|mdc)$/i
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Z-]+(?:\.[0-9A-Z-]+)*)?(?:\+[0-9A-Z-]+(?:\.[0-9A-Z-]+)*)?$/i

// Every documentation exclusion is declared here, once, and applies to all Markdown rules.
export const MARKDOWN_SCOPE_EXCLUSIONS = Object.freeze([
  { reason: 'agent-or-platform-instructions', test: file => /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|COPILOT|CODEX)\.md$/i.test(file) || /^\.(?:agents|codex|github)\//.test(file) },
  { reason: 'trellis-prose', test: file => /^\.trellis\//.test(file) },
  { reason: 'raw-evidence-or-report', test: file => /^(?:evidence|reports?|raw)(?:\/|$)/i.test(file) || /^docs\/(?:report|engineering\/reports)\//.test(file) },
  { reason: 'generated-build-cache-dependency-runtime', test: file => /^(?:dist|build|coverage|\.cache|cache|node_modules|vendor|runtime|generated)(?:\/|$)/.test(file) },
  { reason: 'design-fixture', test: file => /\.pen$/i.test(file) || /^scripts\/docs\/fixtures\//.test(file) || /^apps\/nexus\/examples\//.test(file) },
])

// Exact protected metadata exception; every other task remains strict.
export const TASK_RULE_ALLOWLIST = Object.freeze([
  {
    path: '.trellis/tasks/07-17-unify-ota-update-flow/task.json',
    rule: 'DOC-TASK-META',
    rationale: 'Concurrent owner retains this OTA parent lifecycle metadata until its child acceptance closes.',
  },
])
// No unresolved product PRD content is exempted at the reviewed baseline.
export const PLACEHOLDER_ALLOWLIST = Object.freeze([])

function diagnostic(ruleId, file, point, message) {
  return { ruleId, file: POSIX(file), line: point?.line ?? 0, column: point?.column ?? 0, message }
}

function excludedMarkdownScope(file) {
  return MARKDOWN_SCOPE_EXCLUSIONS.find(entry => entry.test(file))?.reason ?? null
}

export function trackedFiles(repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'buffer' })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map(POSIX)
    .sort()
}

export function scopeRegistry(repoRoot, tracked = trackedFiles(repoRoot)) {
  const files = [...new Set(tracked.map(POSIX))].sort()
  const taskFiles = files.filter(file => TASK_JSON.test(file))
  return {
    repoRoot,
    files,
    tracked: new Set(files),
    markdownFiles: files.filter(file => MARKDOWN.test(file)),
    lintDocuments: files.filter(file => MARKDOWN.test(file) && !excludedMarkdownScope(file)),
    excludedMarkdown: files.filter(file => MARKDOWN.test(file) && excludedMarkdownScope(file)),
    activeTasks: taskFiles.filter(file => !file.startsWith('.trellis/tasks/archive/')),
    archivedTasks: taskFiles.filter(file => file.startsWith('.trellis/tasks/archive/')),
    activePrds: files.filter(file => /^\.trellis\/tasks\/[^/]+\/prd\.md$/.test(file)),
  }
}

function resolveRelative(source, rawUrl) {
  const rawPath = rawUrl.split(/[?#]/, 1)[0]
  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  }
  catch {
    return { error: 'invalid URL encoding' }
  }
  if (!decoded || decoded.startsWith('#') || decoded.startsWith('/') || decoded.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(decoded))
    return null
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded)).replace(/\/$/, '')
  return target === '..' || target.startsWith('../') ? { error: 'repository escape', target } : { target }
}

function trackedTarget(scope, target) {
  return [target, `${target}/README.md`, `${target}/README.mdc`, `${target}/index.md`, `${target}/index.mdc`]
    .find(candidate => scope.tracked.has(candidate)) ?? null
}
function walk(node, visitor) {
  visitor(node)
  for (const child of node.children ?? []) walk(child, visitor)
}
function markdownDiagnostics(file, text) {
  const result = lint({ strings: { [file]: text }, config: MARKDOWNLINT_CONFIG, customRules: MARKDOWNLINT_CUSTOM_RULES, markdownItFactory: options => new MarkdownIt(options) })
  return (result[file] ?? []).filter(error => error.ruleNames.includes('MD900')).map(error => diagnostic(`DOC-MARKDOWN-${error.ruleNames[0]}`, file, { line: error.lineNumber, column: error.errorRange?.[0] ?? 1 }, error.ruleDescription))
}

function linkDiagnostics(file, tree, scope) {
  const diagnostics = []
  const definitions = new Map()
  walk(tree, (node) => {
    if (node.type === 'definition')
      definitions.set(String(node.identifier).toLowerCase(), node)
  })
  walk(tree, (node) => {
    const referenced = /^(?:link|image)Reference$/.test(node.type) ? definitions.get(String(node.identifier).toLowerCase()) : null
    const url = node.url ?? referenced?.url
    if (!url)
      return
    const result = resolveRelative(file, url)
    if (result?.error) {
      diagnostics.push(diagnostic('DOC-LINK-INVALID', file, node.position?.start, `${url}: ${result.error}; resolved ${result.target ?? 'n/a'}`))
      return
    }
    if (!result)
      return
    const matched = trackedTarget(scope, result.target)
    if (!matched)
      diagnostics.push(diagnostic('DOC-LINK-UNTRACKED', file, node.position?.start, `${url}: resolved ${result.target} is not an exact tracked file or README/index form`))
  })
  return diagnostics
}

export function checkMarkdownAndLinks(repoRoot, scope) {
  const diagnostics = []
  for (const file of scope.lintDocuments) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    diagnostics.push(...markdownDiagnostics(file, text))
    try {
      const tree = unified().use(remarkParse).use(remarkMdc).parse(text)
      diagnostics.push(...linkDiagnostics(file, tree, scope))
    }
    catch (error) { diagnostics.push(diagnostic('DOC-MARKDOWN-PARSE', file, null, error.message)) }
  }
  return diagnostics
}

export function checkReleaseNotes(repoRoot, scope = scopeRegistry(repoRoot)) {
  const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version
  const core = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/core-app/package.json'), 'utf8')).version
  const diagnostics = []
  if (!SEMVER.test(root))
    diagnostics.push(diagnostic('DOC-RELEASE-SEMVER', 'package.json', null, `root version ${root} is not valid semver`))
  if (!SEMVER.test(core))
    diagnostics.push(diagnostic('DOC-RELEASE-SEMVER', 'apps/core-app/package.json', null, `CoreApp version ${core} is not valid semver`))
  if (root !== core)
    diagnostics.push(diagnostic('DOC-RELEASE-VERSION', 'package.json', null, `root ${root} does not match CoreApp ${core}`))
  if (diagnostics.length)
    return diagnostics
  let result
  try {
    result = validateReleaseNotesAtRepo({ repoRoot, version: root })
  }
  catch (error) {
    return [diagnostic('DOC-RELEASE-CONFIG', 'notes/release-notes.config.json', null, error.message)]
  }
  if (result.enforcement.enforced) {
    for (const locale of ['zh', 'en']) {
      const note = POSIX(path.relative(repoRoot, result.paths[locale]))
      if (!scope.tracked.has(note))
        diagnostics.push(diagnostic('DOC-RELEASE-UNTRACKED', note, null, `required ${locale} release note is not tracked`))
    }
  }
  for (const error of result.validation?.errors ?? []) {
    const note = POSIX(path.relative(repoRoot, result.paths[error.locale] ?? result.paths.zh))
    diagnostics.push(diagnostic(`DOC-RELEASE-${error.code}`, note, null, error.message))
  }
  return diagnostics
}

function taskLocation(file) {
  return TASK_JSON.exec(file)?.[1]?.replace(/^\d\d-\d\d-/, '') ?? null
}
function taskReference(file) {
  return TASK_JSON.exec(file)?.[1] ?? ''
}
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}
function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function readTask(repoRoot, file, diagnostics) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
  }
  catch {
    diagnostics.push(diagnostic('DOC-TASK-JSON', file, null, 'invalid JSON'))
    return null
  }
}
function validTaskShape(task, file, archive, diagnostics) {
  if (!plainObject(task)) {
    diagnostics.push(diagnostic('DOC-TASK-TYPE', file, null, 'task JSON root must be an object'))
    return false
  }
  const valid = [
    ['id', typeof task.id === 'string'],
    ['status', typeof task.status === 'string'],
    ['assignee', typeof task.assignee === 'string'],
    ['children', Array.isArray(task.children) && task.children.every(child => typeof child === 'string')],
    ['meta', archive ? task.meta == null || plainObject(task.meta) : plainObject(task.meta)],
    ['completedAt', !archive || typeof task.completedAt === 'string'],
  ]
  for (const [field, validField] of valid) {
    if (!validField)
      diagnostics.push(diagnostic('DOC-TASK-TYPE', file, null, `${field} has an invalid type`))
  }
  return valid.every(([, validField]) => validField)
}
function taskRuleAllowed(file, ruleId) {
  return TASK_RULE_ALLOWLIST.some(entry => entry.path === file && entry.rule === ruleId && nonEmptyString(entry.rationale))
}

export function checkTasks(repoRoot, scope) {
  const diagnostics = []
  const records = []
  for (const file of [...scope.activeTasks, ...scope.archivedTasks].sort()) {
    const task = readTask(repoRoot, file, diagnostics)
    const archive = scope.archivedTasks.includes(file)
    if (task !== null && validTaskShape(task, file, archive, diagnostics))
      records.push({ file, archive, task, pathRef: taskReference(file), pathId: taskLocation(file) })
  }
  const aliases = record => [record.task.id, record.pathRef, record.pathId].filter(nonEmptyString)
  const byReference = new Map()
  for (const record of records) {
    for (const reference of aliases(record)) {
      if (byReference.has(reference) && byReference.get(reference) !== record)
        diagnostics.push(diagnostic('DOC-TASK-DUPLICATE-ID', record.file, null, `duplicate task reference ${reference} also appears in ${byReference.get(reference).file}`))
      else byReference.set(reference, record)
    }
  }
  for (const record of records) {
    const { file, archive, task, pathId } = record
    if (!nonEmptyString(task.id) || task.id !== pathId)
      diagnostics.push(diagnostic('DOC-TASK-IDENTITY', file, null, `task id must equal path identity ${pathId}`))
    if (archive ? task.status !== 'completed' : task.status === 'completed')
      diagnostics.push(diagnostic(archive ? 'DOC-TASK-ARCHIVE-NONCOMPLETED' : 'DOC-TASK-ACTIVE-COMPLETED', file, null, archive ? 'archived task must be completed' : 'completed task is active'))
    if (archive) {
      if (!nonEmptyString(task.assignee) || !nonEmptyString(task.completedAt))
        diagnostics.push(diagnostic('DOC-TASK-ARCHIVE-META', file, null, 'archived task requires non-empty assignee and completedAt'))
    }
    else if (!taskRuleAllowed(file, 'DOC-TASK-META')) {
      if (!nonEmptyString(task.assignee))
        diagnostics.push(diagnostic('DOC-TASK-META', file, null, 'assignee must be a non-empty string'))
      for (const key of ['nextAction', 'blocker', 'evidence']) {
        if (!nonEmptyString(task.meta[key]))
          diagnostics.push(diagnostic('DOC-TASK-META', file, null, `meta.${key} must be a non-empty string`))
      }
    }
  }
  for (const record of records) {
    const { file, task } = record
    if (task.parent) {
      const parent = byReference.get(task.parent)
      if (!parent)
        diagnostics.push(diagnostic('DOC-TASK-PARENT', file, null, `parent ${task.parent} does not exist`))
      else if (!parent.task.children.some(child => aliases(record).includes(child)))
        diagnostics.push(diagnostic('DOC-TASK-GRAPH', file, null, `parent ${task.parent} does not list child ${task.id}`))
    }
    for (const childId of task.children) {
      const child = byReference.get(childId)
      if (!child)
        diagnostics.push(diagnostic('DOC-TASK-CHILDREN', file, null, `child ${childId} does not exist`))
      else if (!aliases(record).includes(child.task.parent))
        diagnostics.push(diagnostic('DOC-TASK-GRAPH', file, null, `child ${childId} does not point to ${task.id}`))
    }
  }
  for (const entry of TASK_RULE_ALLOWLIST) {
    const record = records.find(candidate => candidate.file === entry.path)
    const hasMissingMeta = record && (!nonEmptyString(record.task.assignee) || ['nextAction', 'blocker', 'evidence'].some(key => !nonEmptyString(record.task.meta[key])))
    if (!scope.tracked.has(entry.path) || entry.rule !== 'DOC-TASK-META' || !nonEmptyString(entry.rationale) || !hasMissingMeta)
      diagnostics.push(diagnostic('DOC-TASK-ALLOWLIST', entry.path ?? 'scripts/docs/verify-docs.mjs', null, 'allowlist entry must be exact, supported, justified, and match a current metadata violation'))
  }
  const todo = 'docs/plan-prd/TODO.md'
  if (scope.tracked.has(todo)) {
    const todoText = fs.readFileSync(path.join(repoRoot, todo), 'utf8')
    try {
      const todoTree = unified().use(remarkParse).use(remarkMdc).parse(todoText)
      walk(todoTree, (node) => {
        if (node.type !== 'link')
          return
        const resolved = resolveRelative(todo, node.url)
        if (!resolved?.target || !/^\.trellis\/tasks\/[^/]+\/prd\.md$/.test(resolved.target))
          return
        const referenced = records.find(record => record.file === resolved.target.replace(/\/prd\.md$/, '/task.json'))
        if (!referenced || referenced.archive || referenced.task.status === 'completed')
          diagnostics.push(diagnostic('DOC-TODO-TASK-REFERENCE', todo, node.position?.start, `${node.url} does not reference an active non-completed task`))
      })
    }
    catch (error) {
      diagnostics.push(diagnostic('DOC-TODO-TASK-REFERENCE', todo, null, error.message))
    }
  }
  return diagnostics
}

const PLACEHOLDER = /\b(?:TBD|TODO\s*:\s*(?:fill|complete|determine)|to be determined|\[placeholder\])\b|<evidence>|待定|待填写|待补充|占位符|请填写/gi
const REQUIRED_PRD_SECTION = /^(?:goal|objective|acceptance criteria|evidence|目标|验收标准|证据)$/i
function sectionHasSubstantiveContent(nodes) {
  return nodes.some((node) => {
    if (node.type === 'code' || node.type === 'inlineCode')
      return false
    let substantive = false
    walk(node, (child) => {
      if (child.type === 'text' && /[\p{L}\p{N}]/u.test(child.value) && !PLACEHOLDER.test(child.value))
        substantive = true
    })
    return substantive
  })
}
function emptyRequiredSections(tree) {
  const diagnostics = []
  const nodes = tree.children ?? []
  for (let index = 0; index < nodes.length; index += 1) {
    const heading = nodes[index]
    if (heading.type !== 'heading' || !REQUIRED_PRD_SECTION.test(heading.children?.map(child => child.value ?? '').join('')))
      continue
    let end = index + 1
    while (end < nodes.length && (nodes[end].type !== 'heading' || nodes[end].depth > heading.depth)) end += 1
    if (!sectionHasSubstantiveContent(nodes.slice(index + 1, end)))
      diagnostics.push(heading)
  }
  return diagnostics
}
function placeholderAllowed(file, token) {
  return PLACEHOLDER_ALLOWLIST.some(entry => entry.path === file && entry.rule === 'DOC-PRD-PLACEHOLDER' && entry.token === token && nonEmptyString(entry.rationale))
}

export function checkPlaceholders(repoRoot, scope) {
  const diagnostics = []
  for (const file of scope.activePrds) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    let tree
    try {
      tree = unified().use(remarkParse).use(remarkMdc).parse(text)
    }
    catch {
      continue
    }
    for (const heading of emptyRequiredSections(tree)) diagnostics.push(diagnostic('DOC-PRD-EMPTY-SECTION', file, heading.position?.start, 'required template section has no substantive content'))
    walk(tree, (node) => {
      if (node.type !== 'text' && node.type !== 'html')
        return
      for (const match of node.value.matchAll(PLACEHOLDER)) {
        const token = match[0]
        if (!placeholderAllowed(file, token))
          diagnostics.push(diagnostic('DOC-PRD-PLACEHOLDER', file, node.position?.start, `unresolved placeholder ${token}`))
      }
    })
  }
  for (const entry of PLACEHOLDER_ALLOWLIST) {
    if (!scope.tracked.has(entry.path) || entry.rule !== 'DOC-PRD-PLACEHOLDER' || !nonEmptyString(entry.token) || !nonEmptyString(entry.rationale))
      diagnostics.push(diagnostic('DOC-PRD-ALLOWLIST', entry.path ?? 'scripts/docs/verify-docs.mjs', null, 'allowlist entries require exact tracked path, rule, token, and rationale'))
  }
  return diagnostics
}
export function checkAiDocs(repoRoot, scope, options = {}) {
  if (options.skipAiDocs === true)
    return []
  return verifyAiDocs(repoRoot).map(failure => diagnostic('DOC-AI-CONTRACT', failure.file, null, failure.message))
}

function sortDiagnostics(diagnostics) {
  return diagnostics.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.message.localeCompare(b.message))
}

export function verifyDocs(repoRoot) {
  const scope = scopeRegistry(repoRoot)
  return sortDiagnostics([
    ...checkMarkdownAndLinks(repoRoot, scope),
    ...checkTasks(repoRoot, scope),
    ...checkReleaseNotes(repoRoot, scope),
    ...checkAiDocs(repoRoot, scope),
    ...checkPlaceholders(repoRoot, scope),
  ])
}

export function renderDiagnostics(diagnostics, cap = DEFAULT_CAP) {
  if (!diagnostics.length)
    return 'docs:verify passed\n'
  const groups = new Map()
  for (const item of sortDiagnostics([...diagnostics])) groups.set(item.ruleId, [...(groups.get(item.ruleId) ?? []), item])
  const ruleIds = [...groups.keys()].sort()
  const shown = []
  while (shown.length < cap && ruleIds.some(ruleId => groups.get(ruleId).length)) {
    for (const ruleId of ruleIds) {
      if (shown.length < cap && groups.get(ruleId).length)
        shown.push(groups.get(ruleId).shift())
    }
  }
  const totals = ruleIds.map(ruleId => `${ruleId}=${groups.get(ruleId).length + shown.filter(item => item.ruleId === ruleId).length}`).join(', ')
  return `${shown.map(item => `${item.ruleId} ${item.file}:${item.line}:${item.column} ${item.message}`).join('\n')}\ndocs:verify failed: shown ${shown.length}/${diagnostics.length}; totals ${totals}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const diagnostics = verifyDocs(process.cwd())
  process.stdout.write(renderDiagnostics(diagnostics))
  process.exitCode = diagnostics.length ? 1 : 0
}
