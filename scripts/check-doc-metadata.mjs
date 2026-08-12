#!/usr/bin/env node
/**
 * Guards the entry-point documentation against drifting from the machine-readable sources.
 *
 * `LICENSE`, the root and CoreApp manifests, `.node-version` and the Volta pin are the truth;
 * the READMEs are a rendering of it. Both READMEs currently avoid restating volatile versions
 * and point at the manifests instead, which is the shape this check defends: a wrong license or
 * a hardcoded Node/toolchain claim that contradicts the manifests must fail, rather than sit
 * there misleading contributors, packagers and licence scanners.
 *
 * Read-only. Nothing here rewrites a file.
 *
 * `--self-test` runs the fixtures instead: mismatched license, Node and homepage inputs must all
 * be rejected, which is what stops this from silently degrading into a no-op.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const READMES = ['README.md', 'README.zh-CN.md']

function readJson(file) {
  return JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
}

/** `MPL-2.0 license` and `MPL-2.0` mean the same thing; compare the identifier only. */
export function normalizeLicenseId(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+licen[cs]e$/i, '')
    .toUpperCase()
}

/** The SPDX id implied by the LICENSE file's own heading. */
export function licenseIdFromText(licenseText) {
  const heading = licenseText.split('\n', 1)[0].trim()
  if (/^Mozilla Public License Version 2\.0$/i.test(heading))
    return 'MPL-2.0'
  if (/^MIT License$/i.test(heading))
    return 'MIT'
  if (/^Apache License$/i.test(heading))
    return 'APACHE-2.0'
  return null
}

/**
 * Version-like claims that would contradict the manifests if hardcoded. Matches a prose
 * statement such as "requires Node >= 22" but not a link or a changelog entry.
 */
const HARDCODED_CLAIM_PATTERNS = [
  { label: 'Node version', pattern: /\bnode(?:\.js)?\s*(?:(?:>=?|≥|v)\s*)?(\d{2})(?:\.\d+)*/gi },
  { label: 'Electron version', pattern: /\belectron\s*(?:(?:>=?|≥|v)\s*)?(\d{2})(?:\.\d+)*/gi },
  { label: 'pnpm version', pattern: /\bpnpm\s*(?:(?:>=?|≥|v)\s*)?(\d+)(?:\.\d+)+/gi },
]

export function collectProblems(sources) {
  const { licenseText, rootManifest, coreAppManifest, nodeVersionFile, readmes } = sources
  const problems = []

  // --- license ---------------------------------------------------------------
  const licenseId = licenseIdFromText(licenseText)
  if (!licenseId) {
    problems.push('LICENSE heading is not a recognised licence; teach this script the new one.')
  }

  for (const [name, manifest] of [['root', rootManifest], ['apps/core-app', coreAppManifest]]) {
    const declared = normalizeLicenseId(manifest.license)
    if (licenseId && declared !== licenseId) {
      problems.push(`${name} package.json declares license "${manifest.license}" but LICENSE is ${licenseId}.`)
    }
  }

  for (const { file, text } of readmes) {
    if (licenseId && !text.includes(licenseId)) {
      problems.push(`${file} never states the ${licenseId} licence.`)
    }
    for (const other of ['MIT', 'Apache-2.0', 'GPL-3.0']) {
      if (other !== licenseId && new RegExp(`\\b${other}\\b`).test(text)) {
        problems.push(`${file} mentions ${other} while the project is ${licenseId}.`)
      }
    }
  }

  // --- runtime ---------------------------------------------------------------
  const enginesNode = rootManifest.engines?.node
  const voltaNode = rootManifest.volta?.node
  const pinnedNode = nodeVersionFile.trim()
  const enginesMajor = enginesNode?.match(/(\d+)/)?.[1]
  const pinnedMajor = pinnedNode.match(/^(\d+)/)?.[1]
  const voltaMajor = voltaNode?.match(/^(\d+)/)?.[1]

  if (enginesMajor && pinnedMajor && enginesMajor !== pinnedMajor) {
    problems.push(`engines.node (${enginesNode}) and .node-version (${pinnedNode}) disagree on the major version.`)
  }
  if (voltaMajor && pinnedMajor && voltaMajor !== pinnedMajor) {
    problems.push(`volta.node (${voltaNode}) and .node-version (${pinnedNode}) disagree.`)
  }

  // A README must not restate a version that the manifests could move underneath it.
  for (const { file, text } of readmes) {
    for (const { label, pattern } of HARDCODED_CLAIM_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of text.matchAll(pattern)) {
        const claimed = match[1]
        const expected = label === 'Node version' ? pinnedMajor : null
        if (expected && claimed !== expected) {
          problems.push(`${file} hardcodes ${label} "${match[0].trim()}", which contradicts .node-version (${pinnedNode}). Point at the manifest instead of restating it.`)
        }
        else if (!expected) {
          problems.push(`${file} hardcodes ${label} "${match[0].trim()}". Manifests move; link to them instead.`)
        }
      }
    }
  }

  // --- homepage --------------------------------------------------------------
  // The root manifest is the source of truth: sync-core-package.mjs copies homepage down into
  // CoreApp, and it skips fields the root leaves undefined. A missing root homepage therefore
  // does not break the sync — it silently makes CoreApp's value unowned, which is how the two
  // drifted apart in the first place (#306).
  const stripSlash = value => String(value).replace(/\/$/, '')
  if (!rootManifest.homepage) {
    problems.push('Root package.json declares no homepage, so nothing owns the canonical value that sync-core-package.mjs propagates.')
  }
  else if (coreAppManifest.homepage && stripSlash(rootManifest.homepage) !== stripSlash(coreAppManifest.homepage)) {
    problems.push(`Manifests disagree on homepage: ${stripSlash(rootManifest.homepage)} (root) vs ${stripSlash(coreAppManifest.homepage)} (apps/core-app). Run sync-core-package.mjs.`)
  }

  // --- links -----------------------------------------------------------------
  for (const { file, text, dir } of readmes) {
    const targets = new Set([...text.matchAll(/\]\((\.[^)#]+)(?:#[^)]*)?\)/g)].map(match => match[1]))
    for (const target of targets) {
      if (!existsSync(path.resolve(dir, target))) {
        problems.push(`${file} links to ${target}, which does not exist.`)
      }
    }
  }

  return problems
}

function loadSources() {
  return {
    licenseText: readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'),
    rootManifest: readJson('package.json'),
    coreAppManifest: readJson('apps/core-app/package.json'),
    nodeVersionFile: readFileSync(path.join(ROOT, '.node-version'), 'utf8'),
    readmes: READMES.map(file => ({
      file,
      text: readFileSync(path.join(ROOT, file), 'utf8'),
      dir: ROOT,
    })),
  }
}

function selfTest() {
  const base = loadSources()
  const cases = [
    {
      name: 'mismatched license in a manifest',
      mutate: sources => ({ ...sources, rootManifest: { ...sources.rootManifest, license: 'MIT' } }),
      expect: /declares license "MIT"/,
    },
    {
      name: 'a README claiming the wrong licence',
      mutate: sources => ({
        ...sources,
        readmes: sources.readmes.map((entry, index) =>
          index === 0 ? { ...entry, text: `${entry.text}\n\nReleased under the MIT license.\n` } : entry,
        ),
      }),
      expect: /mentions MIT while the project is MPL-2\.0/,
    },
    {
      name: 'a README hardcoding a stale Node version',
      mutate: sources => ({
        ...sources,
        readmes: sources.readmes.map((entry, index) =>
          index === 0 ? { ...entry, text: `${entry.text}\n\nRequires Node >= 22.\n` } : entry,
        ),
      }),
      expect: /hardcodes Node version/,
    },
    {
      name: 'manifests disagreeing on homepage',
      mutate: sources => ({
        ...sources,
        rootManifest: { ...sources.rootManifest, homepage: 'https://example.invalid' },
      }),
      expect: /disagree on homepage/,
    },
    {
      name: 'no root homepage to own the canonical value',
      mutate: (sources) => {
        const rootManifest = { ...sources.rootManifest }
        delete rootManifest.homepage
        return { ...sources, rootManifest }
      },
      expect: /declares no homepage/,
    },
    {
      name: 'engines and .node-version disagreeing',
      mutate: sources => ({ ...sources, nodeVersionFile: '22.11.0\n' }),
      expect: /disagree on the major version/,
    },
    {
      name: 'a README link that does not resolve',
      mutate: sources => ({
        ...sources,
        readmes: sources.readmes.map((entry, index) =>
          index === 0 ? { ...entry, text: `${entry.text}\n\n[gone](./this-file-does-not-exist.md)\n` } : entry,
        ),
      }),
      expect: /does not exist/,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const problems = collectProblems(testCase.mutate(base))
    const matched = problems.some(problem => testCase.expect.test(problem))
    console.log(`${matched ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!matched) {
      failures += 1
      console.log(`     expected a problem matching ${testCase.expect}, got: ${JSON.stringify(problems)}`)
    }
  }

  const clean = collectProblems(base)
  console.log(`${clean.length === 0 ? 'ok  ' : 'FAIL'} the real tree is clean`)
  if (clean.length > 0) {
    failures += 1
    for (const problem of clean) console.log(`     ${problem}`)
  }

  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const problems = collectProblems(loadSources())
if (problems.length > 0) {
  console.error('[doc-metadata] entry documentation disagrees with the machine-readable sources:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error(`\n${problems.length} problem(s).`)
  process.exit(1)
}

console.log('[doc-metadata] README licence, runtime and links match LICENSE and the manifests')
