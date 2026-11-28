import { describe, expect, it } from 'vitest'
import { fetchSafeWebPageText, isBlockedIpAddress, validatePublicHttpUrl } from './ssrf-safe-fetch'

describe('ssrf-safe-fetch', () => {
  it('blocks private, loopback, link-local, metadata, IPv4-mapped, ULA, and NAT64 IPs', () => {
    const blocked = [
      '0.0.0.0',
      '127.0.0.1',
      '127.255.255.254',
      '10.0.0.1',
      '100.64.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '::',
      '::1',
      '[::1]',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '64:ff9b::169.254.169.254',
      'not-an-ip'
    ]
    for (const ip of blocked) {
      expect(isBlockedIpAddress(ip), ip).toBe(true)
    }

    expect(isBlockedIpAddress('93.184.216.34')).toBe(false)
    expect(isBlockedIpAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false)
  })

  it('rejects non-HTTP protocols, credentials, localhost, and private IP literals', () => {
    const rejectedUrls = [
      'file:///etc/passwd',
      'ftp://example.com/a',
      'https://user:pass@example.com/',
      'http://localhost:8080/admin',
      'http://foo.localhost/secret',
      'http://printer.local/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://127.0.0.1:9222/json',
      'http://[::1]:3000/',
      'http://169.254.169.254/latest/meta-data/'
    ]

    for (const url of rejectedUrls) {
      expect(() => validatePublicHttpUrl(url), url).toThrow(/SSRF_BLOCKED/)
    }

    expect(validatePublicHttpUrl('https://example.com/docs').hostname).toBe('example.com')
  })

  it('blocks hostnames whose DNS resolves to a private or loopback IP', async () => {
    await expect(
      fetchSafeWebPageText('https://rebind.example.com/', {
        resolveHost: async () => [{ address: '127.0.0.1', family: 4 }]
      })
    ).rejects.toThrow(/SSRF_BLOCKED/)

    await expect(
      fetchSafeWebPageText('https://imds.example.com/', {
        resolveHost: async () => [{ address: '::ffff:169.254.169.254', family: 6 }]
      })
    ).rejects.toThrow(/SSRF_BLOCKED/)
  })
})
