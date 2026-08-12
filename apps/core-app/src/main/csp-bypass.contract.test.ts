/**
 * `tfile:` used to be registered with `bypassCSP: true`, which exempts everything loaded through
 * it from the page policy -- so it stayed an open hole no matter how the renderer CSP was
 * tightened. `stream:` carried the same privilege with no `protocol.handle` anywhere, which is
 * privilege granted to nothing (#785).
 *
 * The capability tfile: actually needs is granted by the policy instead, so this pins both
 * halves together: no bypass, and the directives that replace it are still present. Asserting
 * only "no bypassCSP" would pass just as well on a build where tfile: had silently stopped
 * loading.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_INDEX = readFileSync(path.join(__dirname, 'index.ts'), 'utf8')
const PROTOCOL_HANDLER = readFileSync(path.join(__dirname, 'service/protocol-handler.ts'), 'utf8')
const RENDERER_HTML = readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8')

function cspDirective(name: string): string {
  const csp = /content-security-policy"[^>]*content="([^"]*)"/is.exec(RENDERER_HTML)?.[1]
  if (!csp) throw new Error('No Content-Security-Policy meta found in renderer/index.html')
  const directive = csp
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name} `))
  if (!directive) throw new Error(`CSP has no ${name} directive`)
  return directive
}

describe('privileged schemes do not bypass the page CSP', () => {
  /** The privileges object only -- prose around it may legitimately mention the flag. */
  function privilegedSchemeBlock(source: string): string {
    const block = /registerSchemesAsPrivileged\(\[([\s\S]*?)\]\)/.exec(source)?.[1]
    if (!block) return ''
    return block
  }

  it('tfile 不再带 bypassCSP', () => {
    const block = privilegedSchemeBlock(MAIN_INDEX)
    expect(block).toContain("scheme: 'tfile'")
    expect(block).not.toContain('bypassCSP')
  })

  it('tfile: 仍然被 CSP 显式允许(否则上一条会掩盖功能损坏)', () => {
    for (const directive of ['default-src', 'img-src', 'media-src', 'connect-src']) {
      expect(cspDirective(directive)).toContain('tfile:')
    }
  })

  it('stream scheme 的特权注册已删除', () => {
    expect(PROTOCOL_HANDLER).not.toContain("scheme: 'stream'")
    expect(privilegedSchemeBlock(PROTOCOL_HANDLER)).toBe('')
  })

  it('删除是安全的:stream 从来没有 protocol.handle', () => {
    // Positive control for the absence check: atom is handled here, so the scan can see handlers.
    expect(PROTOCOL_HANDLER).toContain("protocol.handle('atom'")
    expect(PROTOCOL_HANDLER).not.toContain("protocol.handle('stream'")
  })
})
