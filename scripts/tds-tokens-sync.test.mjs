import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  compositeOver,
  contrastRatioRgb,
  formatMarkdownReport,
  RELATIVE_PATHS,
  resolveColorExpression,
  verifyTdsTokensSync,
} from './tds-tokens-sync.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI_PATH = path.join(REPO_ROOT, 'scripts/tds-tokens-sync.mjs')

const tempDirs = []

function createTempFixtureRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tds-tokens-sync-fixture-'))
  tempDirs.push(dir)

  for (const key of [
    'tokensJson',
    'corePrimitivesMd',
    'shellTokensScss',
    'tuffexVariablesScss',
    'buiTokensScss',
    'baseSurfaceVue',
    'themePresetsTs',
  ]) {
    const src = path.join(REPO_ROOT, RELATIVE_PATHS[key])
    const dst = path.join(dir, RELATIVE_PATHS[key])
    mkdirSync(path.dirname(dst), { recursive: true })
    cpSync(src, dst)
  }

  const catalog = JSON.parse(readFileSync(path.join(REPO_ROOT, RELATIVE_PATHS.tokensJson), 'utf8'))
  for (const mod of catalog.corePrimitives.modules) {
    const entry = path.join(dir, RELATIVE_PATHS.tuffexComponentsSrc, mod, 'index.ts')
    mkdirSync(path.dirname(entry), { recursive: true })
    writeFileSync(entry, 'export {}\n', 'utf8')
  }

  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('scripts/tds-tokens-sync.mjs', () => {
  it('passes cleanly on the live repository and produces a compact markdown parity report', () => {
    const result = verifyTdsTokensSync({ rootDir: REPO_ROOT })

    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.summary.corePrimitives.foundOnDisk).toBe(36)
    expect(result.summary.corePrimitives.documented).toBe(36)
    expect(result.summary.themePacks).toHaveLength(8)
    expect(result.summary.themePacks.every(row => row.passed)).toBe(true)

    const report = formatMarkdownReport(result)
    expect(report).toContain('# TDS Token Parity & Contrast Report')
    expect(report).toContain('Status: **PASS**')
    expect(report).toContain('`tds-apple-neutral`')
    expect(report).toContain('`tds-graphite-emerald`')
  })

  it('catches shell-tokens.scss value drift deterministically', () => {
    const shellSource = readFileSync(path.join(REPO_ROOT, RELATIVE_PATHS.shellTokensScss), 'utf8')
    const driftedShell = shellSource.replace('--shell-bg: #141414;', '--shell-bg: #101010;')

    const result = verifyTdsTokensSync({
      rootDir: REPO_ROOT,
      overrides: { shellTokensScss: driftedShell },
    })

    expect(result.ok).toBe(false)
    expect(result.errors.some(err => err.scope === 'shell-sync' && err.token === '--shell-bg')).toBe(true)
    expect(result.errors.some(err => err.scope === 'tuffex-convergence' && err.token === '--tx-bg-color')).toBe(true)
  })

  it('catches TuffEx variables.scss dark neutral #141414 or missing mapped token drift', () => {
    const txSource = readFileSync(path.join(REPO_ROOT, RELATIVE_PATHS.tuffexVariablesScss), 'utf8')
    const driftedTx = txSource
      .replace('--tx-bg-color: #141414;', '--tx-bg-color: #0e0e0e;')
      .replace('--tx-color-success: #4ade80;', '')

    const result = verifyTdsTokensSync({
      rootDir: REPO_ROOT,
      overrides: { tuffexVariablesScss: driftedTx },
    })

    expect(result.ok).toBe(false)
    expect(result.errors.some(err => err.token === '--tx-bg-color' && /#141414/.test(err.message))).toBe(true)
    expect(result.errors.some(err => err.token === '--tx-color-success' && /missing from variables\.scss \.dark/.test(err.message))).toBe(true)
  })

  it('catches missing Core 36 primitive modules on disk or in core-primitives.md', () => {
    const catalog = JSON.parse(readFileSync(path.join(REPO_ROOT, RELATIVE_PATHS.tokensJson), 'utf8'))
    const existingWithoutApproval = catalog.corePrimitives.modules.filter(m => m !== 'approval-card')
    const docWithoutTable = readFileSync(
      path.join(REPO_ROOT, RELATIVE_PATHS.corePrimitivesMd),
      'utf8',
    ).replace('`data-table`', '`removed-table`')

    const result = verifyTdsTokensSync({
      rootDir: REPO_ROOT,
      overrides: {
        existingModules: existingWithoutApproval,
        corePrimitivesMd: docWithoutTable,
      },
    })

    expect(result.ok).toBe(false)
    expect(result.errors.some(err => err.scope === 'core-primitives' && err.module === 'approval-card')).toBe(true)
    expect(result.errors.some(err => err.scope === 'core-primitives' && err.module === 'data-table')).toBe(true)
    expect(result.errors.some(err => err.scope === 'core-primitives' && err.module === 'removed-table')).toBe(true)
  })

  it('catches WCAG AA contrast regression and invisible alpha text in built-in theme packs', () => {
    const presetsSource = readFileSync(path.join(REPO_ROOT, RELATIVE_PATHS.themePresetsTs), 'utf8')
    const lowContrastPresets = presetsSource.replace('textRegular: \'#334155\'', 'textRegular: \'#cbd5e1\'')

    const result = verifyTdsTokensSync({
      rootDir: REPO_ROOT,
      overrides: { themePresetsTs: lowContrastPresets },
    })

    expect(result.ok).toBe(false)
    expect(
      result.errors.some(err => err.scope === 'theme-pack-contrast' && err.packId === 'tds-obsidian-cobalt'),
    ).toBe(true)

    // Translucent zero-alpha text (#33415500) must composite to 1:1 contrast and fail WCAG AA
    const invisibleTextPresets = presetsSource.replace('textRegular: \'#334155\'', 'textRegular: \'#33415500\'')
    const invisibleResult = verifyTdsTokensSync({
      rootDir: REPO_ROOT,
      overrides: { themePresetsTs: invisibleTextPresets },
    })
    expect(invisibleResult.ok).toBe(false)
    expect(
      invisibleResult.errors.some(
        err =>
          err.scope === 'theme-pack-contrast'
          && err.packId === 'tds-obsidian-cobalt'
          && err.pair === 'textRegular/bg'
          && err.actual === 1,
      ),
    ).toBe(true)
  })

  it('premultiplies alpha per CSS Color 5 when resolving color-mix(in srgb, ...)', () => {
    const mixed = resolveColorExpression('color-mix(in srgb, #00000000 50%, #ffffff)', {})
    expect(mixed[0]).toBeCloseTo(255, 4)
    expect(mixed[1]).toBeCloseTo(255, 4)
    expect(mixed[2]).toBeCloseTo(255, 4)
    expect(mixed[3]).toBeCloseTo(0.5, 4)

    const overBlack = compositeOver(mixed, [0, 0, 0])
    const whiteContrast = contrastRatioRgb([255, 255, 255], overBlack)
    expect(whiteContrast).toBeCloseTo(3.98, 2)
    expect(whiteContrast).toBeLessThan(4.5)
  })

  it('exits 0 on clean CLI --check / --report and exits 1 with per-token diff on drifted fixture', () => {
    const checkOut = execFileSync(process.execPath, [CLI_PATH, '--check'], { encoding: 'utf8' })
    expect(checkOut).toContain('[tds-tokens-sync] OK:')

    const reportOut = execFileSync(process.execPath, [CLI_PATH, '--report'], { encoding: 'utf8' })
    expect(reportOut).toContain('## 2. Convergence Mappings')
    expect(reportOut).toContain('## 4. Built-in Theme Packs')

    const fixtureDir = createTempFixtureRepo()
    const fixtureShellPath = path.join(fixtureDir, RELATIVE_PATHS.shellTokensScss)
    const drifted = readFileSync(fixtureShellPath, 'utf8').replace(
      '--shell-primary: #2b7fd9;',
      '--shell-primary: #112233;',
    )
    writeFileSync(fixtureShellPath, drifted, 'utf8')

    let exitCode = 0
    let stderrText = ''
    try {
      execFileSync(process.execPath, [CLI_PATH, '--check', '--root', fixtureDir], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }
    catch (error) {
      exitCode = error.status ?? 1
      stderrText = String(error.stderr ?? '')
    }

    expect(exitCode).toBe(1)
    expect(stderrText).toContain('[tds-tokens-sync] FAIL:')
    expect(stderrText).toContain('--shell-primary')
    expect(stderrText).toContain('#2b7fd9')
    expect(stderrText).toContain('#112233')
  })
})
