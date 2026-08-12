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
import { execFileSync } from 'node:child_process'
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

  /**
   * The two assertions above read two named files. That covers every call site today only because
   * there happens to be exactly one, in `index.ts` -- a second one added anywhere else under
   * `src/main` would carry `bypassCSP` past this suite unseen (#689).
   *
   * So the file list is derived rather than written down. If a new call site appears, either it is
   * covered by the scan below or this test names it.
   *
   * What this cannot see: a scheme a dependency registers at runtime. `@sentry/electron/main`
   * registers `sentry-ipc` with `bypassCSP: true` from inside `Sentry.init`, and no source scan of
   * this repository will ever show it. Recorded here rather than asserted, because asserting on a
   * dependency's internals breaks on its next release and says nothing about our own code.
   */
  it('每一个仓库内的 registerSchemesAsPrivileged 调用点都不带 bypassCSP', () => {
    const mainRoot = __dirname
    const files = execFileSync('git', ['grep', '-l', 'registerSchemesAsPrivileged', '--', '*.ts'], {
      cwd: mainRoot,
      encoding: 'utf8'
    })
      .split('\n')
      .filter((entry) => entry && !entry.endsWith('.test.ts'))

    // An empty list would make every assertion below vacuous, and is itself the failure: the call
    // has to live somewhere for `tfile:` to work at all.
    expect(files, 'no registerSchemesAsPrivileged call site found under src/main').not.toEqual([])
    expect(files).toContain('index.ts')

    for (const file of files) {
      const source = readFileSync(path.join(mainRoot, file), 'utf8')
      expect(privilegedSchemeBlock(source), file).not.toContain('bypassCSP')
    }
  })
})
