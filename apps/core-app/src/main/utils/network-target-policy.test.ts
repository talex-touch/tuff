import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyNetworkTarget } from './network-target-policy'

/**
 * Which permission a network request needs (#906).
 *
 * The request/readText/readBinary transport handlers forwarded whatever they were given with
 * no permission check, even though the registry declares network.local and network.internet
 * for exactly this. A plugin could therefore sidestep the confinement
 * installPluginViewNavigationPolicy puts on its own view — the request is issued by the main
 * process, outside that session, from the user's LAN position.
 */
describe('classifyNetworkTarget', () => {
  it('treats ordinary public hosts as internet', () => {
    // Positive control: a classifier that answered 'local' for everything would make every
    // assertion below pass while demanding the wrong permission for normal use.
    for (const url of ['https://example.test/api', 'http://example.test', 'https://1.1.1.1/'])
      expect(classifyNetworkTarget(url), url).toBe('internet')
  })

  it('treats loopback as local', () => {
    for (const url of ['http://127.0.0.1:8080/admin', 'http://localhost:3000', 'http://[::1]/'])
      expect(classifyNetworkTarget(url), url).toBe('local')
  })

  it('treats the cloud metadata address as local', () => {
    expect(classifyNetworkTarget('http://169.254.169.254/latest/meta-data/')).toBe('local')
  })

  it('treats private IPv4 ranges as local', () => {
    for (const host of ['10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.1'])
      expect(classifyNetworkTarget(`http://${host}/`), host).toBe('local')
  })

  it('does not over-claim addresses adjacent to private ranges', () => {
    // 172.15 and 172.32 sit outside the private block. Misclassifying them would demand
    // network.local for ordinary internet hosts.
    for (const host of ['172.15.0.1', '172.32.0.1', '11.0.0.1', '193.168.1.1'])
      expect(classifyNetworkTarget(`https://${host}/`), host).toBe('internet')
  })

  it('treats IPv6 unique-local and link-local as local', () => {
    for (const url of ['http://[fd00::1]/', 'http://[fe80::1]/'])
      expect(classifyNetworkTarget(url), url).toBe('local')
  })

  it('treats mDNS and internal suffixes as local', () => {
    for (const host of ['printer.local', 'metadata.google.internal', 'app.localhost'])
      expect(classifyNetworkTarget(`http://${host}/`), host).toBe('local')
  })

  it('reports a non-http source separately, since it is not a network request', () => {
    // readText and readBinary also accept file paths, which the local-file allowlist governs.
    for (const source of ['/tmp/file.txt', 'C:\\Users\\me\\a.txt', 'tfile:///x/y.png'])
      expect(classifyNetworkTarget(source), source).toBe('non-http')
  })

  it('falls back to local for input it cannot parse', () => {
    // The more restrictive answer: a malformed target must not fall through to the weaker
    // permission.
    for (const source of ['http://', '', '   ', undefined, null, 42])
      expect(classifyNetworkTarget(source), String(source)).toBe('local')
  })
})

/**
 * That the module wires it to all three handlers.
 *
 * network-module builds a transport and a service in onInit, so the call sites are asserted at
 * source level. Guarding a subset would leave a working bypass, which is the whole finding.
 */
describe('network module wiring', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../modules/network/network-module.ts', import.meta.url)),
    'utf8'
  )

  it('guards request, readText and readBinary', () => {
    const guarded = source.match(/guarded\(/g) ?? []
    // Three call sites plus the helper's own definition is not counted — `guarded(` appears
    // only at use sites, since the helper is declared as `const guarded = <...>(`.
    expect(guarded).toHaveLength(3)
  })

  it('requires both network permissions, chosen by destination', () => {
    expect(source).toContain("permissionId: 'network.local'")
    expect(source).toContain("permissionId: 'network.internet'")
    expect(source).toContain('classifyNetworkTarget(')
  })

  it('does not leave any of the three handlers calling the service directly', () => {
    // The shape they had before: `transport.on(NetworkEvents.api.request, async (request) =>
    // await service.request(request))`.
    expect(source).not.toMatch(/NetworkEvents\.api\.request,\s*async \(request\) =>/)
    expect(source).not.toMatch(
      /NetworkEvents\.api\.readText,\s*async \(payload\) => \{\s*return await service/
    )
    expect(source).not.toMatch(
      /NetworkEvents\.api\.readBinary,\s*async \(payload\) => \{\s*return await service/
    )
  })
})
