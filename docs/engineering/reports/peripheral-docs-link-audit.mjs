/**
 * One-off Batch C link inventory helper.
 *
 * This preserves the reviewed audit contract for Batch D handoff; it is not a
 * permanent local/CI gate. Run it from a temporary directory containing the
 * parser versions listed in the inventory document.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import process from 'node:process'

import remarkMdc from 'remark-mdc'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const repoRoot = resolve(process.argv[2] ?? process.cwd())

const includePrefixes = ['.github/docs/', 'apps/', 'docs/', 'packages/', 'plugins/']
const exactExclusions = new Set([
  'README.md',
  'README.zh-CN.md',
  'docs/plan-prd/TODO.md',
  'docs/plan-prd/01-project/CHANGES.md',
  'docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md',
  'docs/plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md',
  'docs/plan-prd/04-implementation/Evidence-Matrix-Release-Integrity-2026-06-21.md'
])
const excludedPrefixes = [
  '.agents/',
  '.opencode/',
  '.trellis/',
  'notes/',
  'docs/engineering/reports/',
  'docs/engineering/reports/cross-platform-audit-2026-06/'
]
const excludedSegments = new Set([
  '.nuxt',
  '.output',
  'archive',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'raw',
  'vendor'
])
const instructionNames = new Set(['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'GEMINI.md'])

function gitFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .sort()
}

function isDocument(path) {
  return path.endsWith('.md') || path.endsWith('.mdc')
}

function isInScope(path) {
  if (!isDocument(path) || !includePrefixes.some((prefix) => path.startsWith(prefix))) {
    return false
  }
  if (exactExclusions.has(path) || excludedPrefixes.some((prefix) => path.startsWith(prefix))) {
    return false
  }
  const parts = path.split('/')
  if (instructionNames.has(parts.at(-1)) || parts.some((part) => excludedSegments.has(part))) {
    return false
  }
  return true
}

function visit(node, callback) {
  callback(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) visit(child, callback)
  }
}

function positionOf(node) {
  return {
    line: node.position?.start?.line ?? 0,
    column: node.position?.start?.column ?? 0,
    offset: node.position?.start?.offset ?? 0
  }
}

function candidateFrom(rawUrl, source) {
  const url = rawUrl.trim()
  if (!url || url.startsWith('#') || url.startsWith('?') || url.startsWith('/') || url.startsWith('//')) {
    return { skipped: true }
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(url)) return { skipped: true }

  const pathname = url.split(/[?#]/, 1)[0]
  if (!pathname) return { skipped: true }

  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return { reason: 'invalid-percent-encoding', resolvedTarget: null }
  }
  if (!decoded || decoded.includes('\0') || isAbsolute(decoded)) {
    return { reason: 'invalid-relative-path', resolvedTarget: null }
  }

  const absoluteTarget = resolve(repoRoot, dirname(source), decoded)
  const repoRelative = relative(repoRoot, absoluteTarget)
  if (repoRelative === '..' || repoRelative.startsWith(`..${sep}`) || isAbsolute(repoRelative)) {
    return { reason: 'repository-escape', resolvedTarget: repoRelative.replaceAll(sep, '/') }
  }
  return { resolvedTarget: repoRelative.replaceAll(sep, '/') }
}

const trackedFiles = gitFiles()
const trackedSet = new Set(trackedFiles)
const sourceFiles = trackedFiles.filter(isInScope)
const parser = unified().use(remarkParse).use(remarkMdc)
const findings = []
let inspectedLinks = 0
let skippedLinks = 0

for (const source of sourceFiles) {
  const tree = parser.parse(readFileSync(resolve(repoRoot, source), 'utf8'))
  const definitions = new Map()
  visit(tree, (node) => {
    if (node.type === 'definition') definitions.set(node.identifier, node.url)
  })

  visit(tree, (node) => {
    let url
    let kind
    if (node.type === 'link' || node.type === 'image') {
      url = node.url
      kind = node.type
    } else if (node.type === 'linkReference' || node.type === 'imageReference') {
      url = definitions.get(node.identifier)
      kind = node.type
    }
    if (typeof url !== 'string') return

    const candidate = candidateFrom(url, source)
    if (candidate.skipped) {
      skippedLinks += 1
      return
    }
    inspectedLinks += 1

    const target = candidate.resolvedTarget
    const trackedDirectory = target
      ? trackedFiles.some((path) => path.startsWith(`${target.replace(/\/$/, '')}/`))
      : false
    if (candidate.reason || !target || (!trackedSet.has(target) && !trackedDirectory)) {
      findings.push({
        source,
        ...positionOf(node),
        kind,
        url,
        resolvedTarget: target,
        reason: candidate.reason ?? 'missing-tracked-target'
      })
    }
  })
}

findings.sort((a, b) =>
  a.source.localeCompare(b.source) ||
  a.line - b.line ||
  a.column - b.column ||
  a.url.localeCompare(b.url) ||
  a.kind.localeCompare(b.kind)
)

const output = {
  schemaVersion: 1,
  sourceEnumeration: "git ls-files -z, filtered to tracked '*.md' and '*.mdc' product documents",
  scope: {
    includePrefixes,
    exactExclusions: [...exactExclusions].sort(),
    excludedPrefixes,
    excludedSegments: [...excludedSegments].sort(),
    instructionNames: [...instructionNames].sort()
  },
  resolution: {
    parser: ['unified@11.0.5', 'remark-parse@11.0.0', 'remark-mdc@3.11.1'],
    nodes: ['link', 'image', 'linkReference', 'imageReference'],
    skip: ['external schemes', 'absolute/root URLs', 'fragment-only links', 'query-only links'],
    lookup: 'strip query/fragment, percent-decode, resolve from source, reject repository escape, require exact tracked file or tracked directory content'
  },
  counts: {
    trackedDocuments: trackedFiles.filter(isDocument).length,
    sourceDocuments: sourceFiles.length,
    inspectedRelativeLinks: inspectedLinks,
    skippedLinks,
    findings: findings.length
  },
  findings
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
