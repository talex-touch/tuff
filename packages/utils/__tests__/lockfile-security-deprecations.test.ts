import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Transitive packages whose own deprecation notice cites a security problem (#589).
 *
 * The root `pnpm.overrides` block exists for exactly this: it pins ~70 transitive packages. But
 * `@ungap/structured-clone@1.3.0` — deprecated with "Potential CWE-502 - Update to 1.3.1 or
 * higher" — was not among them, so every fresh install kept resolving the flagged version.
 *
 * npm's own deprecation text is the signal here, which is narrow: it catches only what a
 * maintainer chose to write into a publish. It is not an audit, and is not a substitute for one.
 * What it does is make this class visible and stop it growing quietly.
 */

const LOCKFILE = path.resolve(__dirname, '../../../pnpm-lock.yaml')

/** Flagged entries that are tracked elsewhere. This list must shrink, never grow. */
const KNOWN = [
  // glob 7/10/11 — tracked in #586 (tuff-cli / tuff-cli-core depend on the old line)
  'glob@10.5.0',
  'glob@11.1.0',
  'glob@7.2.3'
]

const SECURITY_WORDING = /CWE|CVE|vulnerab|security/i

function flaggedPackages(): string[] {
  const lines = readFileSync(LOCKFILE, 'utf8').split('\n')
  const found: string[] = []
  let current: string | null = null

  for (const line of lines) {
    const header = /^ {2}'?([^':]+@[^':]+)'?:\s*$/.exec(line)
    if (header) current = header[1]!
    if (/^\s+deprecated:/.test(line) && SECURITY_WORDING.test(line) && current)
      found.push(current)
  }

  return [...new Set(found)].sort()
}

describe('lockfile security deprecations', () => {
  it('parses the lockfile', () => {
    // Positive control. The assertion below is a set comparison that an unparsed file would
    // satisfy by returning nothing, reading as "all clear".
    const contents = readFileSync(LOCKFILE, 'utf8')

    expect(contents).toContain('lockfileVersion')
    expect(contents.split('\n').filter((line) => /^\s+deprecated:/.test(line)).length)
      .toBeGreaterThan(5)
    expect(SECURITY_WORDING.test('Potential CWE-502 - Update to 1.3.1 or higher')).toBe(true)
  })

  it('has no security-flagged package beyond the ones already tracked', () => {
    expect(flaggedPackages()).toEqual(KNOWN)
  })

  it('keeps @ungap/structured-clone off the flagged list', () => {
    // The specific regression #589 was filed for: without the override the resolver picks 1.3.0,
    // whose published deprecation names CWE-502.
    expect(flaggedPackages().some((entry) => entry.startsWith('@ungap/structured-clone@'))).toBe(
      false
    )
    expect(readFileSync(LOCKFILE, 'utf8')).not.toContain('@ungap/structured-clone@1.3.0')
  })
})
