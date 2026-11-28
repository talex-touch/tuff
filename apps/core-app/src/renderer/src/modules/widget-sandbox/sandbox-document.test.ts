import { afterEach, describe, expect, it, vi } from 'vitest'
import { revokeBlobUrls, rewriteInlineScriptsToBlobs } from './inline-script-blobs'
import {
  buildWidgetSandboxBootstrapScript,
  buildWidgetSandboxDocument,
  createWidgetSandboxDocument,
  escapeForScriptBlock,
  WIDGET_SANDBOX_MESSAGE
} from './sandbox-document'

const RUNTIME = 'export const html = () => {}\nexport const reactive = (x) => x\n'
const SAMPLE_BLOB_URL = 'blob:app://tuff/00000000-0000-0000-0000-000000000001'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('escapeForScriptBlock', () => {
  it('neutralises a script close tag', () => {
    expect(escapeForScriptBlock('</script>')).toBe('<\\/script>')
  })

  it('neutralises the legacy comment opener', () => {
    expect(escapeForScriptBlock('<!--')).toBe('<\\!--')
  })

  it('neutralises every closing tag, not just script', () => {
    expect(escapeForScriptBlock('</style></div>')).toBe('<\\/style><\\/div>')
  })

  it('leaves an opening tag alone', () => {
    expect(escapeForScriptBlock('<div><span>')).toBe('<div><span>')
  })

  it('is value-preserving once JavaScript parses it', () => {
    const escaped = escapeForScriptBlock('a</script>b<!--c')
    expect(new Function(`return "${escaped}"`)()).toBe('a</script>b<!--c')
  })
})

describe('buildWidgetSandboxDocument', () => {
  it('puts the CSP first in head with script-src blob: and zero unsafe-inline or unsafe-eval', () => {
    const doc = buildWidgetSandboxDocument(SAMPLE_BLOB_URL)
    const head = doc.slice(doc.indexOf('<head>') + '<head>'.length)
    expect(head.trimStart().startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script'))
    expect(doc).toContain("default-src 'none'")
    expect(doc).toContain('script-src blob:')
    expect(doc).toContain("connect-src 'none'")
    expect(doc).not.toContain('unsafe-eval')
    expect(doc).not.toMatch(/script-src[^;"]*'unsafe-inline'/)
  })

  it('loads the bootstrapper exclusively from a validated external blob: script tag with zero inline JS', () => {
    const doc = buildWidgetSandboxDocument(SAMPLE_BLOB_URL)
    const scripts = [...doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.[1]).toContain(`src="${SAMPLE_BLOB_URL}"`)
    expect(scripts[0]?.[2]).toBe('')

    expect(() => buildWidgetSandboxDocument('https://evil.example/a.js')).toThrow('blob:')
    expect(() => buildWidgetSandboxDocument('javascript:alert(1)')).toThrow('blob:')
    expect(() => buildWidgetSandboxDocument('blob:ok" onload="alert(1)')).toThrow('blob:')
  })
})

describe('buildWidgetSandboxBootstrapScript', () => {
  it('safely JSON-encodes widget & runtime sources without breakout risk', () => {
    const attack = 'const x = "</script><img src=x onerror=alert(1)>"'
    const script = buildWidgetSandboxBootstrapScript({
      source: attack,
      runtimeSource: 'const s = "</SCRIPT >"'
    })
    expect(script).toContain(JSON.stringify(attack))
    expect(script).toContain(JSON.stringify('const s = "</SCRIPT >"'))
    expect(script).toContain('URL.createObjectURL')
    expect(script).toContain('URL.revokeObjectURL')
    expect(script).toContain('await import(widgetUrl)')
    expect(script).toContain('securitypolicyviolation')
    for (const type of Object.values(WIDGET_SANDBOX_MESSAGE)) {
      expect(script).toContain(JSON.stringify(type))
    }
  })

  it('creates and idempotently revokes the host bootstrap blob URL', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(SAMPLE_BLOB_URL)
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const built = createWidgetSandboxDocument({
      source: 'root.textContent = "hi"',
      runtimeSource: RUNTIME
    })

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(built.bootstrapScriptUrl).toBe(SAMPLE_BLOB_URL)
    expect(built.srcdoc).toContain(`<script defer src="${SAMPLE_BLOB_URL}"></script>`)

    built.revoke()
    built.revoke()
    expect(revokeSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith(SAMPLE_BLOB_URL)
  })
})

describe('rewriteInlineScriptsToBlobs', () => {
  it('rewrites classic and module inline scripts into blob URLs while preserving comments, raw tags, data scripts, and external scripts', () => {
    const created: string[] = []
    const createFakeBlob = (code: string) => {
      created.push(code)
      return `blob:app://tuff/script-${created.length}`
    }

    const input = [
      '<!-- <script>ignoredInComment()</script> -->',
      '<textarea><script>ignoredInTextarea()</script></textarea>',
      '<script type="application/json">{"a":1}</script>',
      '<script src="blob:already-external"></script>',
      '<script id="classic">window.x = 1;</script>',
      '<script type="module">export const y = 2;</script>'
    ].join('\n')

    const { html, blobUrls } = rewriteInlineScriptsToBlobs(input, createFakeBlob)

    expect(blobUrls).toEqual(['blob:app://tuff/script-1', 'blob:app://tuff/script-2'])
    expect(created[0]).toBe('window.x = 1;')
    expect(created[1]).toContain('URL.createObjectURL')
    expect(created[1]).toContain(JSON.stringify('export const y = 2;'))

    expect(html).toContain('<!-- <script>ignoredInComment()</script> -->')
    expect(html).toContain('<textarea><script>ignoredInTextarea()</script></textarea>')
    expect(html).toContain('<script type="application/json">{"a":1}</script>')
    expect(html).toContain('<script src="blob:already-external"></script>')
    expect(html).toContain('<script id="classic" src="blob:app://tuff/script-1"></script>')
    expect(html).toContain('<script defer src="blob:app://tuff/script-2"></script>')

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    revokeBlobUrls(blobUrls)
    expect(revokeSpy).toHaveBeenCalledTimes(2)
  })
})
