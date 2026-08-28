import { describe, expect, it } from 'vitest'
import { isFeatureFlagEnabled } from '#shared/utils/feature-flags'
import { historicalFixtures, loadHistoricalFixture } from './helpers/fixtures'
import { maskInertRegions } from './helpers/sfc'
import { fileExists, formatViolations, lineAt, loadSources, readSource } from './helpers/repo'
import type { SourceFile, Violation } from './helpers/repo'

/**
 * Guard 3 — boolean-ish runtime config is never read with a strict comparison.
 *
 * A deployment sets `NUXT_PUBLIC_RISK_CONTROL_ENABLED=1`. Nitro's env override
 * coerces that to the *number* 1 before it reaches `runtimeConfig`, so
 * `runtimeConfig.public?.riskControl?.enabled === true` is false while the
 * server's normalizing reader says the feature is on. The API served risk
 * control and the client middleware redirected the operator away from it.
 *
 * Every boolean-ish runtime config read goes through
 * `shared/utils/feature-flags.ts`'s `isFeatureFlagEnabled`, and the truth table
 * below is what both sides are held to.
 */

const RULE = 'feature-flag-coercion'
const FLAG_HELPER = 'isFeatureFlagEnabled from #shared/utils/feature-flags'

const CONFIG_ROOTS = String.raw`useRuntimeConfig\(\)|runtimeConfig|config\.public|publicRuntimeConfig`
const ACCESSOR_CHAIN = String.raw`(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\s*\[\s*['"][^'"]*['"]\s*\])+`

const STRICT_COMPARISON = new RegExp(
  String.raw`\b(?:${CONFIG_ROOTS})(${ACCESSOR_CHAIN})\s*(===|!==)\s*(true|false|1|0|'true'|'false'|"true"|"false")`,
  'g',
)

const TRUTHY_COERCION = new RegExp(
  String.raw`(?:!!|\bBoolean\s*\(\s*)(?:${CONFIG_ROOTS})(${ACCESSOR_CHAIN})`,
  'g',
)

/** Property tails that name a switch rather than a value. */
const FLAG_SHAPED_TAIL = /^(?:enabled|disabled|debug|(?:\w*(?:Enabled|Disabled))|(?:is|has|allow|require|force|should)[A-Z]\w*)$/

function tailProperty(accessorChain: string): string {
  const parts = accessorChain.split('.').map(part => part.trim()).filter(Boolean)
  const last = parts.at(-1) ?? ''
  return last.replace(/\[.*$/, '').replace(/['"\]]/g, '')
}

/** True when the match sits inside a comment or a string body. */
function isInertText(stripped: string, offset: number, length: number): boolean {
  return stripped.slice(offset, offset + length).trim().length === 0
}

export function scanFeatureFlagReads(files: SourceFile[]): Violation[] {
  const violations: Violation[] = []

  for (const file of files) {
    const stripped = maskInertRegions(file.content, file.path)

    for (const match of file.content.matchAll(STRICT_COMPARISON)) {
      const offset = match.index ?? 0
      if (isInertText(stripped, offset, match[0].length))
        continue
      violations.push({
        file: file.path,
        line: lineAt(file.content, offset),
        rule: RULE,
        message: `\`${match[0].trim()}\` compares runtime config against a literal. Nitro's env override turns `
          + `NUXT_PUBLIC_*=1 into the number 1 and =true into the boolean true, so this reader disagrees with `
          + `whichever side normalizes. Fix: use ${FLAG_HELPER}.`,
      })
    }

    for (const match of file.content.matchAll(TRUTHY_COERCION)) {
      const offset = match.index ?? 0
      if (isInertText(stripped, offset, match[0].length))
        continue
      if (!FLAG_SHAPED_TAIL.test(tailProperty(match[1] ?? '')))
        continue
      violations.push({
        file: file.path,
        line: lineAt(file.content, offset),
        rule: RULE,
        message: `\`${match[0].trim()}\` coerces a runtime config flag with truthiness. The string "0" and the `
          + `string "false" are both truthy, so a disabled deployment reads as enabled. `
          + `Fix: use ${FLAG_HELPER}.`,
      })
    }
  }

  return violations
}

function loadScannedSources(): SourceFile[] {
  return [
    ...loadSources('app', ['.ts', '.vue']),
    ...loadSources('server', ['.ts']),
    ...loadSources('shared', ['.ts']),
  ].filter(file => !file.path.includes('.test.') && !file.path.startsWith('test/'))
}

/**
 * Violations that predate this guard and are owned by another workstream.
 *
 * This is a ratchet, not an exemption: `no waiver has gone stale` below fails
 * the moment a waived read is fixed or moved, so a waiver cannot outlive the
 * problem it describes. Both entries fail *open* — the switch reads as ON when
 * an operator turns it off — which is why they are recorded rather than
 * quietly dropped from the scan.
 */
interface KnownUnfixed {
  file: string
  property: string
  hazard: string
}

const KNOWN_UNFIXED: KnownUnfixed[] = [
  {
    file: 'server/api/admin/emergency/verify.post.ts',
    property: 'breakglassEnabled',
    hazard: 'NUXT_ADMIN_CONTROL_BREAKGLASS_ENABLED=0 arrives as the number 0, so neither `=== false` nor '
      + '`String(0) === \'false\'` matches and admin break-glass stays enabled after an operator disables it.',
  },
  {
    file: 'server/utils/releaseDownloadSignature.ts',
    property: 'allowUnsignedFallback',
    hazard: 'NUXT_RELEASE_DOWNLOAD_ALLOW_UNSIGNED_FALLBACK=0 arrives as the number 0, so `!== false` is true and '
      + 'unsigned release downloads keep working after an operator turns the fallback off.',
  },
]

function isWaived(violation: Violation): boolean {
  return KNOWN_UNFIXED.some(waiver => waiver.file === violation.file && violation.message.includes(waiver.property))
}

describe('guard: boolean runtime config is read through isFeatureFlagEnabled', () => {
  it('normalizes every shape a deployment can produce', () => {
    const table: Array<[unknown, boolean]> = [
      [true, true],
      [false, false],
      // Nitro's env override produces these two from NUXT_PUBLIC_X=1 / =0.
      [1, true],
      [0, false],
      ['1', true],
      ['0', false],
      ['true', true],
      ['false', false],
      ['TRUE', true],
      [' true ', true],
      ['yes', true],
      ['no', false],
      ['on', true],
      ['off', false],
      [undefined, false],
      [null, false],
      ['', false],
      ['maybe', false],
      [2, false],
    ]
    const wrong = table
      .filter(([value, expected]) => isFeatureFlagEnabled(value) !== expected)
      .map(([value, expected]) => `isFeatureFlagEnabled(${JSON.stringify(value)}) should be ${expected}`)
    expect(wrong.join('\n')).toBe('')
  })

  it('honours the fallback for values it cannot interpret', () => {
    expect(isFeatureFlagEnabled(undefined, true)).toBe(true)
    expect(isFeatureFlagEnabled('maybe', true)).toBe(true)
    expect(isFeatureFlagEnabled({}, true)).toBe(true)
    // An explicit off value always wins over the fallback.
    expect(isFeatureFlagEnabled('0', true)).toBe(false)
    expect(isFeatureFlagEnabled(false, true)).toBe(false)
  })

  it('disagrees with the strict reader exactly where the outage happened', () => {
    // Positive control for the table above: the retired reader was
    // `value === true`. If someone "simplifies" isFeatureFlagEnabled back to
    // that, these are the inputs that must start failing.
    const retiredStrictReader = (value: unknown): boolean => value === true
    const deployedValues: unknown[] = [1, '1', 'true', 'on', 'yes']
    for (const value of deployedValues) {
      expect(isFeatureFlagEnabled(value), `deployment value ${JSON.stringify(value)} must read as enabled`).toBe(true)
      expect(retiredStrictReader(value)).toBe(false)
    }
  })

  it('flags the shipped strict comparison in the risk-route middleware', () => {
    const entry = historicalFixtures.featureFlagCoercion
    const violations = scanFeatureFlagReads([loadHistoricalFixture(entry)])
    expect(violations, entry.expectation).toHaveLength(1)
    expect(violations[0]!.line).toBe(13)
    expect(violations[0]!.message).toContain('isFeatureFlagEnabled')
  })

  it('clears the fixed middleware', () => {
    const fixed = 'app/middleware/feature-gates.global.ts'
    if (!fileExists(fixed))
      return
    expect(formatViolations(scanFeatureFlagReads([readSource(fixed)]))).toBe('')
  })

  it('keeps the build-time env reader in nuxt.config.ts on the same truth table', () => {
    // nuxt.config.ts cannot import from #shared, so it carries its own
    // `isEnvFlagEnabled`. Duplicated truth tables drift; this pins them together.
    const config = readSource('nuxt.config.ts').content
    const body = config.match(/function isEnvFlagEnabled[\s\S]*?\n}/)?.[0]
    expect(body, 'isEnvFlagEnabled no longer exists in nuxt.config.ts — re-point this check').toBeTruthy()
    const accepted = [...body!.matchAll(/normalized === '([^']+)'/g)].map(match => match[1]!)
    expect(accepted.length, 'no accepted values parsed out of isEnvFlagEnabled').toBeGreaterThan(0)
    const disagreements = accepted.filter(value => !isFeatureFlagEnabled(value))
    expect(
      disagreements.map(value => `nuxt.config.ts treats "${value}" as enabled but isFeatureFlagEnabled does not`).join('\n'),
    ).toBe('')
  })

  it('reports no strict runtime-config flag reads in app/, server/ or shared/', () => {
    const violations = scanFeatureFlagReads(loadScannedSources()).filter(violation => !isWaived(violation))
    expect(formatViolations(violations)).toBe('')
  })

  it('has no waiver that has gone stale', () => {
    // A waiver that no longer matches anything means the read was fixed or
    // moved. Deleting the entry is the required follow-up, so this fails loudly
    // rather than letting the exemption list rot into a blanket exemption.
    const violations = scanFeatureFlagReads(loadScannedSources())
    const stale = KNOWN_UNFIXED.filter(waiver =>
      !violations.some(violation => violation.file === waiver.file && violation.message.includes(waiver.property)),
    )
    expect(
      stale
        .map(waiver => `${waiver.file} no longer reads ${waiver.property} unsafely — delete its KNOWN_UNFIXED entry`)
        .join('\n'),
    ).toBe('')
  })
})
