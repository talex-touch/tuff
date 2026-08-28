import { describe, expect, it } from 'vitest'
import en from '../../i18n/locales/en'
import zh from '../../i18n/locales/zh'
import dashboardEn from '../../i18n/locales/route/en/dashboard'
import landingEn from '../../i18n/locales/route/en/landing'
import dashboardZh from '../../i18n/locales/route/zh/dashboard'
import landingZh from '../../i18n/locales/route/zh/landing'
import { historicalFixtures, loadHistoricalFixture } from './helpers/fixtures'
import { stripCommentsAndStrings } from './helpers/js-text'
import { maskInertRegions } from './helpers/sfc'
import { fileExists, formatViolations, lineAt, loadSources, readSource } from './helpers/repo'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 5 — a translation key used in code exists in both locales, and an
 * inline fallback agrees with what that key actually says.
 *
 * `t('a.b.c', 'Some text')` renders the fallback whenever the key is missing,
 * so a typo'd or deleted key produces a plausible-looking screen instead of an
 * error: English builds render Chinese, or the risk console renders
 * "Analytics Dashboard" because its heading reached for
 * `dashboard.sections.analytics.title`.
 *
 * The second half matters as much as the first. A wrong-but-existing key passes
 * every existence check ever written; only the disagreement between the
 * fallback and the resolved value exposes it.
 */

const RULE_MISSING = 'i18n-missing-key'
const RULE_FALLBACK = 'i18n-fallback-mismatch'

/**
 * `$t('a.b')`, `t('a.b')`, `t('a.b', 'fallback')`, plus any local alias found by
 * `findTranslationAliases`. Template literals are skipped on purpose: a key
 * assembled at runtime cannot be checked statically, and the coverage test below
 * reports how much of the surface that is.
 */
function buildTranslationCallPattern(aliases: string[]): RegExp {
  // Longest first, so `tt(` is matched as `tt` rather than as `t` followed by a
  // failed `(`.
  const names = [...aliases].sort((left, right) => right.length - left.length)
  return new RegExp(
    String.raw`(?<![\w$.])(?:${[...names, String.raw`\$?t`].join('|')})\(\s*'([^'\\\n]+)'\s*(?:,\s*'([^'\\\n]*)')?`,
    'g',
  )
}

function buildDynamicCallPattern(aliases: string[]): RegExp {
  const names = [...aliases].sort((left, right) => right.length - left.length)
  return new RegExp(String.raw`(?<![\w$.])(?:${[...names, String.raw`\$?t`].join('|')})\(\s*\``, 'g')
}

/** `const name = (...) => …` or `function name(...) { … }`, with the body span. */
const FUNCTION_DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s+)?\(([^)]*)\)\s*(?::[^=\n]+)?=>|\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g

/** Reads forward from `start` to the end of the initializer or block. */
function bodySpan(code: string, start: number): string {
  let depth = 0
  for (let index = start; index < code.length; index += 1) {
    const char = code[index]
    if (char === '(' || char === '[' || char === '{')
      depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1
      if (depth < 0)
        return code.slice(start, index)
    }
    else if (char === '\n' && depth === 0)
      return code.slice(start, index)
  }
  return code.slice(start)
}

function firstParameterName(parameterList: string): string {
  const first = parameterList.split(',')[0] ?? ''
  return first.split(':')[0]!.replace(/[={[\]}.]/g, '').trim()
}

/**
 * Local functions that stand in for `t()`.
 *
 * `governance.vue` declares
 * `const tt = (key: string, fallback: string) => te(key) ? t(key) : fallback`
 * and then calls `tt(...)` 359 times. A pattern anchored on `t(` cannot see any
 * of them — in `tt(`, the character before the matching `t` is another `t`, so
 * the `(?<![\w$.])` lookbehind rejects it — which made 332 unresolved keys
 * invisible to this guard and to `i18n-cjk-fallback-coverage.test.ts` alike.
 *
 * An alias qualifies only when its first parameter is handed straight to `t` or
 * `te`, so a helper that merely happens to call `t()` with a computed key is not
 * mistaken for a key-taking proxy.
 */
export function findTranslationAliases(content: string): string[] {
  const stripped = stripCommentsAndStrings(content)
  const aliases = new Set<string>()

  for (const match of stripped.matchAll(FUNCTION_DECLARATION)) {
    const name = match[1] ?? match[3]
    const parameterList = match[2] ?? match[4]
    if (!name || parameterList === undefined || name === 't')
      continue
    const parameter = firstParameterName(parameterList)
    if (!parameter)
      continue

    const body = bodySpan(stripped, (match.index ?? 0) + match[0].length)
    const forwardsKey = new RegExp(String.raw`(?<![\w$.])\$?te?\s*\(\s*${parameter}\b`)
    if (forwardsKey.test(body))
      aliases.add(name)
  }

  return [...aliases]
}

export type LocaleMessages = Record<string, unknown>

export function flattenLocale(messages: LocaleMessages, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string')
      out.set(path, value)
    else if (value && typeof value === 'object' && !Array.isArray(value))
      flattenLocale(value as LocaleMessages, path, out)
    else if (value !== undefined)
      out.set(path, String(value))
  }
  return out
}

export interface TranslationUsage {
  file: string
  line: number
  key: string
  fallback?: string
}

export function collectTranslationUsages(files: SourceFile[], includeAliases = true): TranslationUsage[] {
  const usages: TranslationUsage[] = []
  for (const file of files) {
    const stripped = maskInertRegions(file.content, file.path)
    const aliases = includeAliases ? findTranslationAliases(file.content) : []
    for (const match of file.content.matchAll(buildTranslationCallPattern(aliases))) {
      const offset = match.index ?? 0
      // The key itself is blanked by the stripper, but the callee is not —
      // unless the whole call sits inside a comment.
      if (stripped.slice(offset, offset + 2).trim().length === 0)
        continue
      usages.push({
        file: file.path,
        line: lineAt(file.content, offset),
        key: match[1]!,
        fallback: match[2],
      })
    }
  }
  return usages
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function characterBigrams(value: string): Set<string> {
  const normalized = normalizeText(value)
  const grams = new Set<string>()
  for (let index = 0; index < normalized.length - 1; index += 1)
    grams.add(normalized.slice(index, index + 2))
  return grams
}

/** Dice coefficient over character bigrams; works for Latin and CJK alike. */
function similarity(left: string, right: string): number {
  const leftGrams = characterBigrams(left)
  const rightGrams = characterBigrams(right)
  if (leftGrams.size === 0 || rightGrams.size === 0)
    return normalizeText(left) === normalizeText(right) ? 1 : 0
  let shared = 0
  for (const gram of leftGrams) {
    if (rightGrams.has(gram))
      shared += 1
  }
  return (2 * shared) / (leftGrams.size + rightGrams.size)
}

/**
 * Below this, the fallback and the message it reads share almost no text, which
 * means the call site is pointing at a different concept rather than carrying a
 * stale wording.
 *
 * Measured, not guessed. Across the dashboard surface the shipped risk-console
 * bug (`'Risk Control'` vs "Analytics Dashboard") scores 0.000; every fallback
 * that is merely out of date with a renamed message scores 0.239 or higher.
 * 0.20 sits in the empty band between the two populations.
 */
const UNRELATED_FALLBACK_THRESHOLD = 0.2

export interface I18nScanOptions {
  english: Map<string, string>
  chinese: Map<string, string>
}

export function scanTranslationUsages(files: SourceFile[], options: I18nScanOptions): Violation[] {
  const violations: Violation[] = []

  for (const usage of collectTranslationUsages(files)) {
    // Keys are dotted paths; anything else is a different `t()`.
    if (!/^[\w$-]+(?:\.[\w$-]+)+$/.test(usage.key))
      continue

    const inEnglish = options.english.has(usage.key)
    const inChinese = options.chinese.has(usage.key)

    if (!inEnglish || !inChinese) {
      const missingIn = [!inEnglish && 'en', !inChinese && 'zh'].filter(Boolean).join(' and ')
      violations.push({
        file: usage.file,
        line: usage.line,
        rule: RULE_MISSING,
        message: `t('${usage.key}') has no entry in i18n/locales/${missingIn}.ts. `
          + (usage.fallback === undefined
            ? `vue-i18n renders the key path itself.`
            : `vue-i18n silently renders the inline fallback "${usage.fallback}" instead, so the screen looks `
              + `finished while one locale is wrong. `)
          + `Fix: add the key to both locale files, or delete the call.`,
      })
      continue
    }

    if (usage.fallback === undefined || usage.fallback === '')
      continue
    // Interpolated fallbacks cannot be compared against a raw message.
    if (usage.fallback.includes('{'))
      continue

    const englishValue = options.english.get(usage.key)!
    const chineseValue = options.chinese.get(usage.key)!
    if (englishValue.includes('{') || chineseValue.includes('{'))
      continue

    // Call sites write the fallback in whichever language they were authored
    // in — usually Chinese. Resembling *either* locale means the call site is
    // pointing at the message it thinks it is.
    const closeness = Math.max(
      similarity(usage.fallback, englishValue),
      similarity(usage.fallback, chineseValue),
    )
    if (closeness >= UNRELATED_FALLBACK_THRESHOLD)
      continue

    violations.push({
      file: usage.file,
      line: usage.line,
      rule: RULE_FALLBACK,
      message: `t('${usage.key}', '${usage.fallback}') reads a key that says something else: en says `
        + `"${englishValue}", zh says "${chineseValue}" (similarity ${closeness.toFixed(2)}). The fallback only `
        + `renders when the key is missing, so this call site displays one of those two, not what it reads like. `
        + `Fix: point at the intended key — this is how the risk console ended up titled "Analytics Dashboard".`,
    })
  }

  return violations
}

/**
 * The full message set a page can see.
 *
 * `i18n.config.ts` only registers `i18n/locales/{en,zh}.ts`. Everything under
 * `dashboard.` and `landing.` arrives later, lazily, from
 * `i18n/locales/route/<locale>/<chunk>.ts` — `useRouteLocaleChunks` merges each
 * chunk under its own name via `mergeLocaleMessage(locale, { [chunk]: … })`.
 *
 * Loading only the two base files makes 98% of dashboard keys look missing.
 * `loads every message source` below is the control that keeps this honest.
 */
function buildLocale(base: LocaleMessages, chunks: Record<string, LocaleMessages>): Map<string, string> {
  const flattened = flattenLocale(base)
  for (const [chunk, messages] of Object.entries(chunks))
    flattenLocale(messages, chunk, flattened)
  return flattened
}

const english = buildLocale(en as LocaleMessages, {
  dashboard: dashboardEn as LocaleMessages,
  landing: landingEn as LocaleMessages,
})
const chinese = buildLocale(zh as LocaleMessages, {
  dashboard: dashboardZh as LocaleMessages,
  landing: landingZh as LocaleMessages,
})
const scanOptions: I18nScanOptions = { english, chinese }

/** Admin surface: the pages and components the audit covered. */
function loadAdminSources(): SourceFile[] {
  return [
    ...loadSources('app/pages/dashboard', ['.vue']),
    ...loadSources('app/components/dashboard', ['.vue']),
  ].filter(file => !file.path.includes('.test.'))
}

/**
 * Wrong-key call sites that predate this guard, each owned by another
 * workstream. Matched by file and key rather than by line, so unrelated edits
 * do not disturb them, and `no waiver has gone stale` fails as soon as one is
 * fixed. Every entry names what the screen actually renders today.
 */
interface KnownWrongKey {
  file: string
  key: string
  renders: string
}

/** Empty: the per-key missing-key rule is fully enforced. Add here only with a reason. */
const KNOWN_MISSING_KEYS: KnownWrongKey[] = []

/**
 * One holistic waiver, not 300 individual ones.
 *
 * `governance.vue` renders the entire data-governance console through a local
 * `tt()` proxy against `dashboard.governance.*`, and **none** of those keys
 * exist in either locale — so the console renders its hardcoded English
 * fallbacks to Chinese and English users alike. Re-pointing the prefix is not
 * the fix: `dashboard.sections.governance.*` does exist, but only 20 of the 332
 * keys line up with it, leaving 312 that genuinely have no translation yet.
 *
 * Owner: the governance agent owns the page, nav-ia owns the locale files.
 * Waived as a block so the rest of the guard stays usable in CI, with a ceiling
 * rather than a blanket exemption — adding new untranslated governance keys
 * still fails.
 */
const GOVERNANCE_PENDING_TRANSLATION = {
  file: 'app/pages/dashboard/admin/governance.vue',
  keyPrefix: 'dashboard.governance.',
  /**
   * Distinct untranslated keys when this was recorded (2026-08-27), across 348
   * call sites. Counted per key rather than per call site so that extracting or
   * duplicating a label does not move the number. Lower it as translations land.
   */
  keyCeiling: 332,
}

function isGovernancePendingTranslation(violation: Violation): boolean {
  return violation.rule === RULE_MISSING
    && violation.file === GOVERNANCE_PENDING_TRANSLATION.file
    && violation.message.includes(`t('${GOVERNANCE_PENDING_TRANSLATION.keyPrefix}`)
}

const KNOWN_WRONG_KEYS: KnownWrongKey[] = [
  {
    file: 'app/pages/dashboard/account.vue',
    key: 'auth.githubLogin',
    renders: 'the GitHub *bind* button is labelled "Continue with GitHub" / "使用 GitHub 登录" instead of "绑定"',
  },
  {
    file: 'app/pages/dashboard/account.vue',
    key: 'auth.passkeyFailed',
    renders: 'a failed passkey *bind* reports "Passkey login failed." instead of "绑定失败"',
  },
  {
    file: 'app/pages/dashboard/devices.vue',
    key: 'dashboard.devices.activeSessions',
    renders: 'the device list heading renders "Active sessions" / "活跃会话" instead of "设备列表"',
  },
  {
    file: 'app/pages/dashboard/devices.vue',
    key: 'dashboard.devices.revoke',
    renders: 'the kick-out action renders "Revoke" / "撤销" instead of "踢出"',
  },
  {
    file: 'app/pages/dashboard/images.vue',
    key: 'dashboard.sections.images.errors.unknown',
    renders: 'upload and delete failures both render the generic "Something went wrong while managing resources."',
  },
]

const ALL_WAIVERS: Array<KnownWrongKey & { rule: string }> = [
  ...KNOWN_MISSING_KEYS.map(waiver => ({ ...waiver, rule: RULE_MISSING })),
  ...KNOWN_WRONG_KEYS.map(waiver => ({ ...waiver, rule: RULE_FALLBACK })),
]

function matchesWaiver(violation: Violation, waiver: KnownWrongKey & { rule: string }): boolean {
  return violation.rule === waiver.rule
    && violation.file === waiver.file
    && violation.message.includes(`t('${waiver.key}'`)
}

function isWaived(violation: Violation): boolean {
  return ALL_WAIVERS.some(waiver => matchesWaiver(violation, waiver)) || isGovernancePendingTranslation(violation)
}

describe('guard: translation keys exist and inline fallbacks tell the truth', () => {
  it('loads every message source', () => {
    // Positive control for the loader, with one probe per source. Checking only
    // a base-file key passed while the two route chunks were missing entirely,
    // which turned 1301 healthy call sites into confident false positives.
    const probes = [
      ['nav.dashboard', 'i18n/locales/<locale>.ts'],
      ['dashboard.sections.menu.risk', 'i18n/locales/route/<locale>/dashboard.ts'],
      ['dashboard.providerRegistry.title', 'i18n/locales/route/<locale>/dashboard.ts'],
    ] as const
    const missing = probes.flatMap(([key, source]) => [
      ...(english.has(key) ? [] : [`en is missing ${key} — ${source} did not load`]),
      ...(chinese.has(key) ? [] : [`zh is missing ${key} — ${source} did not load`]),
    ])
    expect(missing.join('\n')).toBe('')
    expect(english.size).toBeGreaterThan(2000)
    expect(chinese.size).toBeGreaterThan(2000)
  })

  it('sees keys reached through a local t() alias', () => {
    // Positive control for alias detection, stated as before/after: the pattern
    // anchored on `t(` finds nothing here, because the character before the
    // matching `t` in `tt(` is another `t`.
    const proxy: SourceFile = {
      path: 'test/guards/synthetic/alias.vue',
      content: [
        '<script setup lang="ts">',
        'const { t, te } = useI18n()',
        'const tt = (key: string, fallback: string) => te(key) ? t(key) : fallback',
        '</script>',
        '<template>{{ tt(\'guard.probe.aliased.absent\', \'Probe\') }}</template>',
      ].join('\n'),
    }

    expect(findTranslationAliases(proxy.content)).toEqual(['tt'])
    expect(collectTranslationUsages([proxy], false), 'the t(-anchored pattern must miss this').toHaveLength(0)
    expect(collectTranslationUsages([proxy]).map(usage => usage.key)).toEqual(['guard.probe.aliased.absent'])
  })

  it('sees calls written inside a double-quoted attribute binding', () => {
    // Regression control. Masking the file with JavaScript string rules treats a
    // template attribute's own double quotes as a string delimiter and erases
    // the expression inside it, which hid 257 calls across the admin surface —
    // including 11 governance keys — behind a guard that reported success.
    const binding: SourceFile = {
      path: 'test/guards/synthetic/attribute-binding.vue',
      content: [
        '<template>',
        '  <TxButton :text="ready ? t(\'guard.probe.bound.absent\', \'Yes\') : \'No\'" />',
        '  <!-- {{ t(\'guard.probe.commented.absent\', \'Ignored\') }} -->',
        '</template>',
      ].join('\n'),
    }
    const keys = collectTranslationUsages([binding]).map(usage => usage.key)
    expect(keys).toContain('guard.probe.bound.absent')
    expect(keys, 'a call inside an HTML comment is still inert').not.toContain('guard.probe.commented.absent')
  })

  it('does not mistake an ordinary helper for a translation alias', () => {
    // Negative control: the alias rule requires the first parameter to be handed
    // straight to t()/te(), so a helper that merely calls t() with a computed
    // key does not turn its own arguments into keys.
    const helpers = [
      'const label = (row: Row) => t(\'a.b.\' + row.kind)',
      'const fmt = (value: number) => new Intl.NumberFormat().format(value)',
      'function classFor(tone: string) { return tone === \'ok\' ? \'green\' : \'red\' }',
    ].join('\n')
    expect(findTranslationAliases(helpers)).toEqual([])
  })

  it('catches the governance console through its tt() proxy', () => {
    // The real instance, and the reason the alias rule exists: 332 distinct keys
    // that neither this guard nor i18n-cjk-fallback-coverage.test.ts could see.
    const governance = 'app/pages/dashboard/admin/governance.vue'
    if (!fileExists(governance))
      return
    const source = readSource(governance)

    expect(findTranslationAliases(source.content)).toContain('tt')

    const beforeAliases = collectTranslationUsages([source], false)
      .filter(usage => usage.key.startsWith(GOVERNANCE_PENDING_TRANSLATION.keyPrefix))
    const afterAliases = collectTranslationUsages([source])
      .filter(usage => usage.key.startsWith(GOVERNANCE_PENDING_TRANSLATION.keyPrefix))

    expect(beforeAliases, 'the t(-anchored pattern saw none of these').toHaveLength(0)
    expect(afterAliases.length, 'alias-aware extraction must reach the governance keys').toBeGreaterThan(300)

    const unresolved = scanTranslationUsages([source], scanOptions).filter(violation => violation.rule === RULE_MISSING)
    expect(unresolved.length, 'every governance key is missing from both locales').toBeGreaterThan(300)
  })

  it('detects a key that does not exist', () => {
    // Positive control for the scanner, using a key that cannot ever exist.
    const synthetic: SourceFile = {
      path: 'test/guards/synthetic/missing-key.vue',
      content: '<template>{{ t(\'guard.probe.definitely.absent\', \'Probe\') }}</template>',
    }
    const violations = scanTranslationUsages([synthetic], scanOptions)
    expect(violations).toHaveLength(1)
    expect(violations[0]!.rule).toBe(RULE_MISSING)
    expect(violations[0]!.message).toContain('guard.probe.definitely.absent')
  })

  it('flags the shipped wrong-key heading on the risk console', () => {
    // The key existed, so no existence check could have caught this: the risk
    // console's H1 read the analytics dashboard title.
    const entry = historicalFixtures.i18nFallbackMismatch
    const violations = scanTranslationUsages([loadHistoricalFixture(entry)], scanOptions)
      .filter(violation => violation.rule === RULE_FALLBACK)
    expect(violations.length, entry.expectation).toBeGreaterThan(0)
    const heading = violations.find(violation => violation.line === 146)
    expect(heading, 'the mismatched H1 at risk.vue:146 must be reported').toBeTruthy()
    expect(heading!.message).toContain('dashboard.sections.analytics.title')
  })

  it('clears the corrected heading', () => {
    const fixed = 'app/pages/dashboard/admin/risk.vue'
    if (!fileExists(fixed))
      return
    expect(formatViolations(scanTranslationUsages([readSource(fixed)], scanOptions))).toBe('')
  })

  it('reports how much of the admin surface is statically checkable', () => {
    // Coverage is stated rather than assumed: a guard that silently checks 3%
    // of call sites is indistinguishable from one that works.
    const sources = loadAdminSources()
    const literal = collectTranslationUsages(sources).length
    const dynamic = sources.reduce(
      (total, file) => total + [...file.content.matchAll(buildDynamicCallPattern(findTranslationAliases(file.content)))].length,
      0,
    )
    console.info(
      `[i18n guard] ${sources.length} admin files, ${literal} literal t() keys checked, `
      + `${dynamic} template-literal keys unavoidably skipped.`,
    )
    expect(literal).toBeGreaterThan(200)
  })

  it('reports no missing keys on the dashboard surface', () => {
    const violations = scanTranslationUsages(loadAdminSources(), scanOptions)
      .filter(violation => violation.rule === RULE_MISSING && !isWaived(violation))
    expect(formatViolations(violations)).toBe('')
  })

  it('reports no fallback that contradicts the key it reads', () => {
    const violations = scanTranslationUsages(loadAdminSources(), scanOptions)
      .filter(violation => violation.rule === RULE_FALLBACK && !isWaived(violation))
    expect(formatViolations(violations)).toBe('')
  })

  it('keeps the governance translation debt from growing', () => {
    // The block waiver above is a ceiling, not an exemption: new untranslated
    // dashboard.governance.* keys still fail here.
    const violations = scanTranslationUsages(loadAdminSources(), scanOptions).filter(isGovernancePendingTranslation)
    const distinctKeys = new Set(violations.map(violation => violation.message.match(/t\('([^']+)'/)?.[1] ?? ''))
    console.info(
      `[i18n guard] ${distinctKeys.size} untranslated ${GOVERNANCE_PENDING_TRANSLATION.keyPrefix}* keys across `
      + `${violations.length} call sites in ${GOVERNANCE_PENDING_TRANSLATION.file} `
      + `(ceiling ${GOVERNANCE_PENDING_TRANSLATION.keyCeiling}). `
      + `Owner: governance agent (page) / nav-ia (locale files).`,
    )
    expect(
      distinctKeys.size,
      `governance.vue now reaches ${distinctKeys.size} untranslated keys, above the recorded `
      + `${GOVERNANCE_PENDING_TRANSLATION.keyCeiling}. Add the new keys to `
      + `i18n/locales/route/{en,zh}/dashboard.ts rather than raising the ceiling.`,
    ).toBeLessThanOrEqual(GOVERNANCE_PENDING_TRANSLATION.keyCeiling)
  })

  it('has no waiver that has gone stale', () => {
    const violations = scanTranslationUsages(loadAdminSources(), scanOptions)
    const stale = ALL_WAIVERS.filter(waiver => !violations.some(violation => matchesWaiver(violation, waiver)))
    expect(
      stale
        .map(waiver => `${waiver.file} no longer trips ${waiver.rule} on ${waiver.key} — delete its waiver entry`)
        .join('\n'),
    ).toBe('')
  })
})
