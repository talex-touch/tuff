import { describe, expect, it } from 'vitest'
import {
  buildWidgetSandboxDocument,
  escapeForScriptBlock,
  WIDGET_SANDBOX_MESSAGE
} from './sandbox-document'

const RUNTIME = 'export const html = () => {}\nexport const reactive = (x) => x\n'

function build(source: string): string {
  return buildWidgetSandboxDocument({ source, runtimeSource: RUNTIME })
}

/**
 * Everything the sandbox promises rests on this document being assembled
 * correctly, so these tests are about breakout, not about rendering.
 */
describe('escapeForScriptBlock', () => {
  it('neutralises a script close tag', () => {
    expect(escapeForScriptBlock('</script>')).toBe('<\\/script>')
  })

  it('neutralises the legacy comment opener', () => {
    expect(escapeForScriptBlock('<!--')).toBe('<\\!--')
  })

  it('neutralises every closing tag, not just script', () => {
    // The parser only cares about `</script`, but `</` is escaped wholesale so
    // the rule cannot rot when the surrounding element changes.
    expect(escapeForScriptBlock('</style></div>')).toBe('<\\/style><\\/div>')
  })

  it('leaves an opening tag alone', () => {
    expect(escapeForScriptBlock('<div><span>')).toBe('<div><span>')
  })

  it('is value-preserving once JavaScript parses it', () => {
    // `\/` is `/` and `\!` is `!` to the JS parser, so the widget observes the
    // text it wrote. Evaluated rather than asserted textually: the claim is
    // about what JavaScript sees, not about the characters.
    const escaped = escapeForScriptBlock('a</script>b<!--c')
    expect(new Function(`return "${escaped}"`)()).toBe('a</script>b<!--c')
  })
})

describe('buildWidgetSandboxDocument', () => {
  it('puts the CSP first in head, before anything model-authored', () => {
    const doc = build('root.textContent = "hi"')
    const head = doc.slice(doc.indexOf('<head>') + '<head>'.length)
    // A policy governs only what is parsed after it, so the very first element
    // in head has to be the meta — not merely "somewhere before the script".
    expect(head.trimStart().startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script'))
  })

  it('forbids network egress', () => {
    // The single most important line: without it a widget can post the
    // conversation anywhere.
    expect(build('')).toContain("connect-src 'none'")
  })

  it('does not grant unsafe-eval', () => {
    expect(build('')).not.toContain('unsafe-eval')
  })

  it('denies everything by default', () => {
    expect(build('')).toContain("default-src 'none'")
  })

  it('cannot be broken out of by a source that closes the script block', () => {
    const attack = 'const x = "</script><img src=x onerror=alert(1)>"'
    const doc = build(attack)
    // One script element in, one script element out: the payload never becomes
    // markup. It does still appear in the document — as inert text inside the
    // script block, which is the whole point of escaping rather than stripping.
    expect(doc.match(/<\/script>/g)).toHaveLength(1)
    expect(doc).toContain('<\\/script>')
    const scriptBody = doc.slice(doc.indexOf('<script'), doc.indexOf('</script>'))
    expect(scriptBody).toContain('<img src=x')
    expect(doc.slice(doc.indexOf('</script>'))).not.toContain('<img src=x')
  })

  it('cannot be broken out of by an uppercase or spaced close tag', () => {
    // The parser ends a script block at `</script` followed by whitespace, `>`
    // or `/` — case-insensitively. Matching the literal `</script>` here would
    // make this test vacuous: `</SCRIPT >` would slip past the assertion even
    // with the escaping removed. Match what the parser matches.
    const closeTag = /<\/script[\s/>]/gi
    expect(build('const x = "</SCRIPT ><b>"').match(closeTag)).toHaveLength(1)
    expect(build('const x = "</script\t>"').match(closeTag)).toHaveLength(1)
    expect(build('const x = "</script/"').match(closeTag)).toHaveLength(1)
  })

  it('cannot be broken out of through the injected runtime source either', () => {
    // The rule belongs to the destination, not the author: a dependency that
    // happens to contain the sequence must be escaped the same way.
    const doc = buildWidgetSandboxDocument({
      source: '',
      runtimeSource: 'const s = "</script>"'
    })
    expect(doc.match(/<\/script>/g)).toHaveLength(1)
  })

  it('hands the runtime to the widget as a blob module', () => {
    const doc = build('')
    expect(doc).toContain('createObjectURL')
    expect(doc).toContain('await import(runtimeUrl)')
    // The runtime rides in as a string literal, so it must be JSON-encoded.
    expect(doc).toContain(JSON.stringify(RUNTIME).slice(1, 20))
  })

  it('wires the three host messages', () => {
    const doc = build('')
    for (const type of Object.values(WIDGET_SANDBOX_MESSAGE)) {
      expect(doc).toContain(JSON.stringify(type))
    }
  })

  it('reports policy violations instead of swallowing them', () => {
    expect(build('')).toContain('securitypolicyviolation')
  })

  it('keeps the widget source verbatim when it holds no breakout sequence', () => {
    const source = 'root.append(html`<p>${count}</p>`)'
    // Only `</p>` is rewritten; the rest must survive untouched or the widget
    // silently renders something other than what the model wrote.
    expect(build(source)).toContain('root.append(html`<p>${count}<\\/p>`)')
  })
})
