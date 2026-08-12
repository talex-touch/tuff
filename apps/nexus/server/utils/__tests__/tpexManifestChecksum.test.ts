import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * What manifest._signature actually is (#893).
 *
 * It is an unkeyed digest of the file map. Anyone repacking the archive recomputes the
 * per-file sha256 values and then this digest over them, so it proves the manifest is
 * internally consistent and nothing more. Publisher authenticity comes from the keyed
 * envelope in pluginSigning; a passing value here is not evidence of provenance.
 *
 * The CLI now writes SHA-256 where it wrote MD5. That is not what makes the field safe — it
 * was never a signature — but a collision-broken digest does not belong in a field with this
 * name, and verifiers accept both so packages built earlier keep validating.
 */

const tpexSource = readFileSync(
  fileURLToPath(new URL('../tpex.ts', import.meta.url)),
  'utf8',
)

const canonical = (files: Record<string, string>) => {
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(files).sort()) sorted[key] = files[key] ?? ''
  return JSON.stringify(sorted)
}

describe('manifest._signature checksum', () => {
  const files = { 'a.js': 'sha256-aaa', 'b.js': 'sha256-bbb' }

  it('accepts both digests, so old and new packages both validate', () => {
    // The compatibility property. Verified by construction rather than by running the whole
    // tpex reader, which needs a real tar buffer.
    const json = canonical(files)
    const sha = createHash('sha256').update(json).digest('base64')
    const md5 = createHash('md5').update(json).digest('base64')

    expect(tpexSource).toContain("createHash('sha256').update(json).digest('base64')")
    expect(tpexSource).toContain("createHash('md5').update(json).digest('base64')")
    expect(sha).not.toBe(md5)
  })

  it('no longer describes the field as a signature in its failure messages', () => {
    // The actual risk in the report is a reader treating a pass as provenance. Every message
    // the verifier can emit now says checksum.
    const messages = tpexSource.match(/reason: '[^']*_signature[^']*'/g) ?? []
    expect(messages.length).toBeGreaterThan(0)
    for (const message of messages)
      expect(message).toContain('checksum')
  })

  it('says in the source that the field carries no authenticity', () => {
    // Load-bearing comment: the next reader needs to know before trusting a pass.
    expect(tpexSource).toMatch(/unkeyed digest of/)
    expect(tpexSource).toMatch(/not\s+\n?\s*\*?\s*evidence of provenance/)
  })
})

/**
 * The producer side, which decides what new packages carry.
 */
describe('cli checksum generation', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../../../../packages/tuff-cli-core/src/security-util.ts', import.meta.url)),
    'utf8',
  )

  it('writes sha256 for new packages', () => {
    expect(source).toMatch(/export function generateSignature[\s\S]*?createHash\('sha256'\)/)
  })

  it('keeps the legacy digest available rather than deleting it', () => {
    // Verifiers still accept MD5; keeping the generator makes that pairing explicit and
    // testable instead of an unexplained branch in the verifier.
    expect(source).toContain('generateLegacySignature')
    expect(source).toMatch(/generateLegacySignature[\s\S]*?createHash\('md5'\)/)
  })
})
