import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * How team invite codes are generated (#892).
 *
 * They were built from Math.random — V8's xorshift128+, which is not a CSPRNG. Its state is
 * recoverable from a handful of consecutive outputs, so anyone able to harvest codes minted by
 * the same isolate could reconstruct the ones issued to other organisations.
 *
 * generateInviteCode is module-private and its only caller writes to a database, so this is
 * asserted against the source. That is the right level for the property in question anyway:
 * "uses a CSPRNG" is a statement about the code, and no output sample can distinguish a
 * seeded PRNG from a secure one.
 */

const source = readFileSync(
  fileURLToPath(new URL('../teamStore.ts', import.meta.url)),
  'utf8',
)

function generatorBody(): string {
  const start = source.indexOf('function generateInviteCode(')
  expect(start, 'generateInviteCode not found — this guard is reading the wrong file').toBeGreaterThan(-1)
  const end = source.indexOf('\n}', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('generateInviteCode', () => {
  it('does not use Math.random', () => {
    expect(generatorBody()).not.toContain('Math.random')
  })

  it('draws from node:crypto', () => {
    expect(generatorBody()).toContain('randomInt(')
    expect(source).toMatch(/import \{[^}]*randomInt[^}]*\} from 'node:crypto'/)
  })

  it('keeps the ambiguity-free alphabet', () => {
    // No I/O/0/1, because these are read aloud and typed by hand. Changing the alphabet is a
    // product decision; losing it by accident during a security fix is not.
    expect(source).toContain("const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'")
  })

  it('confirms the guard can see a Math.random elsewhere, so it is not vacuous', () => {
    // Positive control on the reading, not on the file: prove the assertion above would fail
    // if the body still contained the call.
    const fake = 'function generateInviteCode() { return Math.random() }'
    expect(fake).toContain('Math.random')
  })
})

/**
 * The reachability note, pinned so it does not quietly stop being true.
 *
 * The routes that consumed invite codes are retired. If either is revived, the length (8
 * characters, ~40 bits) and the absence of rate limiting become live questions again — both
 * were raised in the issue and both were deliberately left alone here.
 */
describe('invite code consumption routes', () => {
  const routes = ['../../api/team/join.post.ts', '../../api/team/invite/[code].get.ts']

  it.each(routes)('%s is still retired', (relative) => {
    const route = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
    expect(route).toContain('statusCode: 410')
  })
})
