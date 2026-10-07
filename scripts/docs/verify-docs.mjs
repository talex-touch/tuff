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
import { parseRetiredTaskIndex, RETIRED_TASK_INDEX_PATH } from '../lib/retired-task-index.mjs'
import { MARKDOWNLINT_CONFIG, MARKDOWNLINT_CUSTOM_RULES } from './markdownlint-config.mjs'

const DEFAULT_CAP = 100
const POSIX = value => value.split(path.sep).join('/')
const MARKDOWN = /\.(?:md|mdc)$/i
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Z-]+(?:\.[0-9A-Z-]+)*)?(?:\+[0-9A-Z-]+(?:\.[0-9A-Z-]+)*)?$/i
// execFileSync's default buffer (1 MiB) is within reach of `git ls-files -z` for this tree.
// Overflowing throws in the middle of the listing, which reads as a broken tool, not a finding.
const GIT_LIST_MAX_BUFFER = 64 * 1024 * 1024

// Every documentation exclusion is declared here, once, and applies to all Markdown rules.
export const MARKDOWN_SCOPE_EXCLUSIONS = Object.freeze([
  { reason: 'agent-or-platform-instructions', test: file => /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|COPILOT|CODEX)\.md$/i.test(file) || /^\.(?:agents|claude|codex|github|omp)\//.test(file) },
  { reason: 'raw-evidence-or-report', test: file => /^(?:evidence|reports?|raw)(?:\/|$)/i.test(file) || /^docs\/(?:report|engineering\/reports)\//.test(file) },
  { reason: 'generated-build-cache-dependency-runtime', test: file => /^(?:dist|build|coverage|\.cache|cache|node_modules|vendor|runtime|generated)(?:\/|$)/.test(file) },
  { reason: 'design-fixture', test: file => /\.pen$/i.test(file) || /^scripts\/docs\/fixtures\//.test(file) || /^apps\/nexus\/examples\//.test(file) },
])

function diagnostic(ruleId, file, point, message) {
  return { ruleId, file: POSIX(file), line: point?.line ?? 0, column: point?.column ?? 0, message }
}

function excludedMarkdownScope(file) {
  return MARKDOWN_SCOPE_EXCLUSIONS.find(entry => entry.test(file))?.reason ?? null
}

function gitListFiles(repoRoot, args) {
  return execFileSync('git', ['ls-files', '-z', ...args], { cwd: repoRoot, encoding: 'buffer', maxBuffer: GIT_LIST_MAX_BUFFER })
    .toString()
    .split('\0')
    .filter(Boolean)
    .map(POSIX)
}

/**
 * The files someone reading this checkout would find: everything in the index, plus untracked
 * files git does not ignore, minus index entries already deleted from the working tree.
 *
 * Index-only scope was wrong in both directions for a local run. A document written but not yet
 * added was invisible, so a link to it failed and the document itself was never checked; a file
 * deleted but not yet staged was still "present", so links to it passed and reading it failed.
 * Neither needs the index changed to see -- this only reads, it never stages anyone's work. In a
 * clean CI checkout both extra lists are empty and the scope is exactly the commit.
 */
export function repositoryFiles(repoRoot) {
  const deleted = new Set(gitListFiles(repoRoot, ['--deleted']))
  const listed = [...gitListFiles(repoRoot, []), ...gitListFiles(repoRoot, ['--others', '--exclude-standard'])]
  return [...new Set(listed)].filter(file => !deleted.has(file)).sort()
}

export function scopeRegistry(repoRoot, files = repositoryFiles(repoRoot)) {
  const sorted = [...new Set(files.map(POSIX))].sort()
  return {
    repoRoot,
    files: sorted,
    present: new Set(sorted),
    markdownFiles: sorted.filter(file => MARKDOWN.test(file)),
    lintDocuments: sorted.filter(file => MARKDOWN.test(file) && !excludedMarkdownScope(file)),
    excludedMarkdown: sorted.filter(file => MARKDOWN.test(file) && excludedMarkdownScope(file)),
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

function presentTarget(scope, target) {
  return [target, `${target}/README.md`, `${target}/README.mdc`, `${target}/index.md`, `${target}/index.mdc`]
    .find(candidate => scope.present.has(candidate)) ?? null
}
function walk(node, visitor) {
  visitor(node)
  for (const child of node.children ?? []) walk(child, visitor)
}
function parseMarkdown(text) {
  return unified().use(remarkParse).use(remarkMdc).parse(text)
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
    const matched = presentTarget(scope, result.target)
    if (!matched)
      diagnostics.push(diagnostic('DOC-LINK-UNTRACKED', file, node.position?.start, `${url}: resolved ${result.target} is not an exact repository file or README/index form`))
  })
  return diagnostics
}

function readRepositoryText(repoRoot, file, diagnostics) {
  try {
    return fs.readFileSync(path.join(repoRoot, file), 'utf8')
  }
  catch {
    // The scope comes from git and the read from the working tree, so the two can disagree for a
    // moment: a move staged in halves, an interrupted rebase, a file removed while this runs.
    // Throwing would take the whole run down and print a Node stack instead of the findings, which
    // reads as a broken tool rather than a tree mid-change.
    diagnostics.push(diagnostic('DOC-FILE-UNREADABLE', file, null, 'repository file could not be read from the working tree'))
    return undefined
  }
}

export function checkMarkdownAndLinks(repoRoot, scope) {
  const diagnostics = []
  for (const file of scope.lintDocuments) {
    const text = readRepositoryText(repoRoot, file, diagnostics)
    if (text === undefined)
      continue
    diagnostics.push(...markdownDiagnostics(file, text))
    try {
      diagnostics.push(...linkDiagnostics(file, parseMarkdown(text), scope))
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
      if (!scope.present.has(note))
        diagnostics.push(diagnostic('DOC-RELEASE-UNTRACKED', note, null, `required ${locale} release note is not a repository file`))
    }
  }
  for (const error of result.validation?.errors ?? []) {
    const note = POSIX(path.relative(repoRoot, result.paths[error.locale] ?? result.paths.zh))
    diagnostics.push(diagnostic(`DOC-RELEASE-${error.code}`, note, null, error.message))
  }
  return diagnostics
}

export function checkAiDocs(repoRoot, scope, options = {}) {
  if (options.skipAiDocs === true)
    return []
  return verifyAiDocs(repoRoot).map(failure => diagnostic('DOC-AI-CONTRACT', failure.file, null, failure.message))
}

const TASK_INDEX_RULES = Object.freeze({
  json: 'DOC-TASK-INDEX-JSON',
  shape: 'DOC-TASK-INDEX-SHAPE',
  duplicate: 'DOC-TASK-INDEX-DUPLICATE',
})

/**
 * The retired task registry is the identity source for every historical task reference, so it is
 * required, not optional: without it the audit-claims gate has nothing to check citations against.
 * Shape rules live in the shared reader; what only a repository can answer -- that each declared
 * handoff survived into the file set -- is checked here.
 */
export function checkRetiredTaskIndex(repoRoot, scope) {
  if (!scope.present.has(RETIRED_TASK_INDEX_PATH))
    return [diagnostic('DOC-TASK-INDEX-MISSING', RETIRED_TASK_INDEX_PATH, null, 'retired task registry is not a repository file; historical task identities have no source')]
  const diagnostics = []
  const text = readRepositoryText(repoRoot, RETIRED_TASK_INDEX_PATH, diagnostics)
  if (text === undefined)
    return diagnostics
  const { tasks, issues } = parseRetiredTaskIndex(text)
  for (const issue of issues)
    diagnostics.push(diagnostic(TASK_INDEX_RULES[issue.code], RETIRED_TASK_INDEX_PATH, null, issue.message))
  tasks.forEach((task, index) => {
    if (task.handoff !== undefined && !scope.present.has(task.handoff))
      diagnostics.push(diagnostic('DOC-TASK-INDEX-HANDOFF', RETIRED_TASK_INDEX_PATH, null, `tasks[${index}].handoff: ${task.handoff} (${task.slug}) is not a repository file`))
  })
  return diagnostics
}

function sortDiagnostics(diagnostics) {
  return diagnostics.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.message.localeCompare(b.message))
}

/**
 * The whole verifier. `files` replaces the git-derived scope (fixtures pass their declared list);
 * `skipAiDocs` is for fixtures that carry no AI documentation contract.
 */
export function verifyDocs(repoRoot, options = {}) {
  const scope = scopeRegistry(repoRoot, options.files)
  return sortDiagnostics([
    ...checkMarkdownAndLinks(repoRoot, scope),
    ...checkReleaseNotes(repoRoot, scope),
    ...checkAiDocs(repoRoot, scope, { skipAiDocs: options.skipAiDocs === true }),
    ...checkRetiredTaskIndex(repoRoot, scope),
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
