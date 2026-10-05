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
// A live Comet Native change keeps its requirement record here until Runtime archives it, which
// moves the whole directory under docs/comet/archive/. Phase and acceptance state belong to Runtime
// (comet-state.yaml); this verifier reads the brief's content and never the change's state.
const LIVE_BRIEF = /^docs\/comet\/changes\/[^/]+\/brief\.md$/
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
    liveBriefs: sorted.filter(file => LIVE_BRIEF.test(file)),
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

const PLACEHOLDER = /\b(?:TBD|TODO\s*:\s*(?:fill|complete|determine)|to be determined|\[placeholder\])\b|<evidence>|待定|待填写|待补充|占位符|请填写/gi
// `matchAll` requires the global flag; `test` is broken by it. A /g regex advances lastIndex on
// every `test`, so the same string alternates true/false across calls -- a section whose only
// content is TBD reads as substantive on the second look. Worse, `matchAll` inherits whatever
// lastIndex the previous `test` left behind, so it can skip the first placeholder in a string.
// One source, two objects, no shared cursor.
const PLACEHOLDER_TEST = new RegExp(PLACEHOLDER.source, 'i')
// "None" is a real answer for what a change will not do, and no answer at all for what it is, what
// it covers, or how it will be accepted. Comet Native draws the same line for its own briefs.
const EXPLICIT_NONE = /^(?:none|n\/a|not applicable|nothing|无|暂无|没有|不适用)[.!。；;：:，,、\s-]*$/iu

/**
 * The four sections every Comet Native brief carries, as Comet 0.4.4 writes them in either artifact
 * language. Acceptance examples is the load-bearing one: Runtime derives the change's acceptance
 * items from it, so a brief that leaves it empty is a change nobody can verify.
 */
const BRIEF_SECTIONS = Object.freeze([
  { name: 'Outcome', headings: ['outcome', '目标'], noneAllowed: false },
  { name: 'Scope', headings: ['scope', '范围'], noneAllowed: false },
  { name: 'Non-goals', headings: ['non-goals', '非目标'], noneAllowed: true },
  { name: 'Acceptance examples', headings: ['acceptance examples', '验收示例'], noneAllowed: false },
])

function headingTitle(heading) {
  const parts = []
  walk(heading, (node) => {
    if (node.type === 'text')
      parts.push(node.value)
  })
  return parts.join('').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Top-level H1 sections in order; each runs to the next H1, so its subsections belong to it. */
function briefSections(tree) {
  const nodes = tree.children ?? []
  const sections = []
  for (let index = 0; index < nodes.length; index += 1) {
    const heading = nodes[index]
    if (heading.type !== 'heading' || heading.depth !== 1)
      continue
    let end = index + 1
    while (end < nodes.length && !(nodes[end].type === 'heading' && nodes[end].depth === 1)) end += 1
    sections.push({ heading, title: headingTitle(heading), body: nodes.slice(index + 1, end) })
  }
  return sections
}

/**
 * Prose a reader can act on. Headings, fenced code and HTML comments never count: a section holding
 * only a subsection title, a template fence or a commented-out draft says nothing. Inline code is
 * not a text node and does not count either.
 */
function sectionHasSubstantiveContent(nodes, noneAllowed) {
  const texts = []
  for (const node of nodes) {
    if (node.type === 'heading' || node.type === 'code')
      continue
    walk(node, (child) => {
      if (child.type === 'text')
        texts.push(child.value)
    })
  }
  if (!texts.some(value => /[\p{L}\p{N}]/u.test(value) && !PLACEHOLDER_TEST.test(value)))
    return false
  return noneAllowed || !EXPLICIT_NONE.test(texts.join(' ').replace(/\s+/g, ' ').trim())
}

/**
 * The requirement record of every live Comet change has its four sections filled and no unresolved
 * placeholder. This is the old active-PRD rule moved to the record that replaced the PRD: nothing
 * reads Comet state, phase or acceptance results, which Runtime alone writes, and nothing is
 * allowlisted -- a placeholder that is meant literally goes in inline code. Archived changes,
 * specs, verification reports and historical handoffs are not live briefs and stay in ordinary
 * Markdown and link scope only.
 */
export function checkLiveBriefs(repoRoot, scope) {
  const diagnostics = []
  for (const file of scope.liveBriefs) {
    const text = readRepositoryText(repoRoot, file, diagnostics)
    if (text === undefined)
      continue
    let tree
    try {
      tree = parseMarkdown(text)
    }
    catch (error) {
      diagnostics.push(diagnostic('DOC-BRIEF-PARSE', file, null, error.message))
      continue
    }
    const sections = briefSections(tree)
    for (const required of BRIEF_SECTIONS) {
      const matches = sections.filter(section => required.headings.includes(section.title))
      if (matches.length === 0)
        diagnostics.push(diagnostic('DOC-BRIEF-MISSING-SECTION', file, null, `missing required section "# ${required.name}" (zh-CN "# ${required.headings[1]}")`))
      for (const section of matches) {
        if (!sectionHasSubstantiveContent(section.body, required.noneAllowed))
          diagnostics.push(diagnostic('DOC-BRIEF-EMPTY-SECTION', file, section.heading.position?.start, `required section "${required.name}" has no substantive content`))
      }
    }
    walk(tree, (node) => {
      if (node.type !== 'text' && node.type !== 'html')
        return
      for (const match of node.value.matchAll(new RegExp(PLACEHOLDER.source, 'gi')))
        diagnostics.push(diagnostic('DOC-BRIEF-PLACEHOLDER', file, node.position?.start, `unresolved placeholder ${match[0]}`))
    })
  }
  return diagnostics
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
    ...checkLiveBriefs(repoRoot, scope),
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
