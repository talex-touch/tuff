import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { evaluateWebhookUrl } from '../webhookUrlPolicy'

/**
 * Where a stored webhook may point (#899).
 *
 * The credential store accepted any non-empty string under 2048 characters and the dispatcher
 * passed it straight to the HTTP client. An admin session could set
 * http://169.254.169.254/latest/meta-data/ and every notification became a request to that
 * address; `validateStatus` accepts 100-599, so the delivery record reported the status and
 * worked as a probe oracle. Plain http also sent the body and the X-Tuff-Signature HMAC in
 * cleartext.
 */

const reason = (value: unknown) => {
  const decision = evaluateWebhookUrl(value)
  return decision.allowed ? undefined : decision.reason
}

describe('evaluateWebhookUrl', () => {
  it('allows an ordinary https endpoint', () => {
    // Positive control: a policy that refused everything would satisfy every rejection below
    // while disabling webhook notifications entirely.
    expect(evaluateWebhookUrl('https://hooks.example.test/abc')).toEqual({
      allowed: true,
      url: 'https://hooks.example.test/abc',
    })
  })

  it('allows http on loopback, which is the documented development case', () => {
    // The same carve-out readHttpsRelayEndpoint already makes in the dispatcher.
    for (const url of ['http://localhost:3000/hook', 'http://127.0.0.1:3000/hook'])
      expect(evaluateWebhookUrl(url).allowed, url).toBe(true)
  })

  it('refuses the cloud metadata address', () => {
    // The reason this matters most.
    expect(reason('http://169.254.169.254/latest/meta-data/')).toBe('insecure-scheme')
    expect(reason('https://169.254.169.254/latest/meta-data/')).toBe('private-host')
  })

  it('refuses private IPv4 ranges over https', () => {
    // https alone is not enough — the destination still has to be somewhere sensible.
    for (const host of ['10.0.0.5', '172.16.0.5', '172.31.255.1', '192.168.1.1'])
      expect(reason(`https://${host}/hook`), host).toBe('private-host')
  })

  it('allows public addresses that merely look adjacent to private ones', () => {
    // 172.15 and 172.32 are outside the private block; over-blocking is its own failure.
    for (const host of ['172.15.0.1', '172.32.0.1', '11.0.0.1', '193.168.1.1'])
      expect(evaluateWebhookUrl(`https://${host}/hook`).allowed, host).toBe(true)
  })

  it('refuses IPv6 unique-local and link-local hosts', () => {
    for (const host of ['[fd00::1]', '[fe80::1]'])
      expect(reason(`https://${host}/hook`), host).toBe('private-host')
  })

  it('refuses internal-only hostnames', () => {
    for (const host of ['metadata.google.internal', 'db.local'])
      expect(reason(`https://${host}/hook`), host).toBe('private-host')
  })

  it('refuses plain http to any non-loopback host', () => {
    expect(reason('http://hooks.example.test/abc')).toBe('insecure-scheme')
  })

  it('refuses non-http schemes', () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.test/x', 'gopher://example.test'])
      expect(reason(url), url).toBe('unsupported-scheme')
  })

  it('refuses empty and unparseable input', () => {
    expect(reason('')).toBe('empty')
    expect(reason('   ')).toBe('empty')
    expect(reason(undefined)).toBe('empty')
    expect(reason('not a url')).toBe('unparseable')
  })
})

/**
 * That both the write path and the dispatch path use it.
 *
 * Write-time validation alone leaves credentials stored before it existed, and dispatch-time
 * alone gives the admin no feedback. Both call sites are asserted at source level because the
 * store needs a database and a master key, and the dispatcher needs a live delivery.
 */
describe('webhook url policy wiring', () => {
  const read = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

  it('is applied when the credential is stored', () => {
    const source = read('../notificationCredentialStore.ts')
    expect(source).toContain('evaluateWebhookUrl(url)')
    expect(source).toMatch(/if \(!decision\.allowed\)[\s\S]*?throw createError/)
  })

  it('is applied again at every dispatch site', () => {
    // Three sites in the dispatcher. Guarding a subset would leave a working path.
    const source = read('../notificationDispatcher.ts')
    const calls = source.match(/assertDispatchableWebhookUrl\(credential\.url\)/g) ?? []
    expect(calls).toHaveLength(3)
  })

  it('refuses before the request rather than after it', () => {
    const source = read('../notificationDispatcher.ts')
    const segments = source.split('assertDispatchableWebhookUrl(credential.url)').slice(1)
    // Asserted, because with no call sites the loop below would pass by running zero times.
    expect(segments).toHaveLength(3)
    for (const segment of segments)
      expect(segment.indexOf('if (rejected)')).toBeLessThan(segment.indexOf('networkClient.request'))
  })
})
