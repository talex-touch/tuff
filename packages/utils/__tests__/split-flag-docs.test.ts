import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No doc may claim the search-index split flag defaults off (#633).
 *
 * `DB_SEARCH_SPLIT_ENABLED` flipped to on in cd39bdbf6 on 2026-08-05, together with the 2d.3
 * write-path migration that removed the half-migrated failure mode the flag used to guard. Four
 * ROADMAP claims and one audit report still described it as a default-off safety gate.
 *
 * Both directions of that mistake cost something. An engineer verifying the gate before a release
 * reads "defaults off", ships without checking, and the split topology has been live for every user
 * the whole time. Someone reproducing a bug in the shared-file topology assumes no env var is
 * needed and cannot reproduce it.
 *
 * This lives in packages/utils on purpose: `ci / CI - utils` is a blocking check, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const FLAG = 'TUFF_DB_SEARCH_SPLIT_ENABLED'

/** Phrases that assert the flag is off by default, in either language. */
const DEFAULT_OFF_CLAIMS = [
  /默认\s*\*?\*?off/i,
  /默认关闭/,
  /defaults?\s+\*?\*?off/i,
  /default[- ]off/i
]

const SEARCH_DIRS = ['docs', '.trellis/spec']

/**
 * `docs/engineering/reports/` holds dated maintenance audits. Each records what was true on its own
 * date, and the flag genuinely did default off before 2026-08-05, so rewriting them would falsify
 * the record rather than correct it. They are excluded here and reconciled by hand — the reports
 * dated after the flip repeated the stale finding, which is noted on #633.
 */
const SKIP = new Set(['node_modules', 'dist', '.git', 'archive', 'reports'])

function markdownFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries) {
    if (SKIP.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...markdownFiles(full))
    else if (entry.endsWith('.md')) found.push(full)
  }
  return found
}

const docs = [path.join(REPO_ROOT, 'ROADMAP.md'), ...SEARCH_DIRS.flatMap(
  (dir) => markdownFiles(path.join(REPO_ROOT, dir))
)]

/** Paragraph-ish window around a flag mention, so a nearby unrelated sentence is not blamed. */
function claimsNearFlag(source: string): string[] {
  const found: string[] = []
  for (const block of source.split(/\n{2,}/)) {
    if (!block.includes(FLAG) && !block.includes('DB_SEARCH_SPLIT_ENABLED')) continue
    if (/更正|correction/i.test(block)) continue
    if (DEFAULT_OFF_CLAIMS.some((pattern) => pattern.test(block))) found.push(block.slice(0, 120))
  }
  return found
}

describe('search-index split flag', () => {
  it('is on by default in the code', () => {
    // Positive control, and the fact everything below is measured against. If the default ever goes
    // back to false, this fails first and the doc rule below stops applying.
    const flags = readFileSync(
      path.join(REPO_ROOT, 'apps/core-app/src/main/db/runtime-flags.ts'),
      'utf8'
    )

    expect(flags).toContain(`parseEnvBoolean('${FLAG}', true)`)
  })

  it('scans a plausible set of documents', () => {
    // Second control: the rule below is vacuous against an empty file list, which is what a wrong
    // root produces.
    expect(docs.length).toBeGreaterThan(20)
    expect(docs.some((file) => file.endsWith('ROADMAP.md'))).toBe(true)
  })

  it('is described somewhere, so the scan has something to check', () => {
    const mentioning = docs.filter((file) => readFileSync(file, 'utf8').includes(FLAG)
      || readFileSync(file, 'utf8').includes('DB_SEARCH_SPLIT_ENABLED'))

    expect(mentioning.length).toBeGreaterThan(0)
  })

  it('is not called default-off by any document', () => {
    const offenders = docs.flatMap((file) => {
      const claims = claimsNearFlag(readFileSync(file, 'utf8'))
      return claims.map((claim) => `${path.relative(REPO_ROOT, file)}: ${claim}`)
    })

    expect(offenders).toEqual([])
  })
})
