import { Marked } from 'marked'
import { afterEach, describe, expect, it } from 'vitest'
import { hardenHtmlExtension } from '../src/harden-html'
import {
  allowRemoteImageOnce,
  allowRemoteImagesForSession,
  resetRemoteImagePolicy,
} from '../src/remote-image-policy'

const LABELS = {
  blockedImage: 'Remote image blocked',
  loadOnce: 'Load this image',
  allowSession: 'Allow for this conversation',
}

function render(content: string, blockRemoteImages = false): string {
  return new Marked({ gfm: true, breaks: true })
    .use(hardenHtmlExtension(() => ({ blockRemoteImages, labels: LABELS })))
    .parse(content) as string
}

/** Module-level policy: a decision in one test must not leak into the next. */
afterEach(() => {
  resetRemoteImagePolicy()
})

describe('link hardening', () => {
  it('adds noopener and noreferrer', () => {
    const html = render('[docs](https://x.dev)')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('href="https://x.dev"')
  })

  it('keeps inline markup inside the link text', () => {
    // The regression an over-eager renderer causes: escaping the already-parsed
    // children so the reader sees literal `<strong>` tags.
    const html = render('[**bold** link](https://x.dev)')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('&lt;strong&gt;')
  })

  it('keeps the title', () => {
    expect(render('[d](https://x.dev "hint")')).toContain('title="hint"')
  })

  it('escapes a quote in the href instead of breaking out of the attribute', () => {
    const html = render('[d](https://x.dev/?a="onmouseover=alert(1))')
    expect(html).not.toMatch(/href="[^"]*"[^>]*onmouseover/)
    expect(html).toContain('&quot;')
  })
})

describe('image hardening', () => {
  it('marks images lazy so an offscreen one never fetches', () => {
    // The mitigation, not the optimisation: an unfetched image cannot beacon.
    expect(render('![a](https://x.dev/i.png)')).toContain('loading="lazy"')
  })

  it('sends no referrer', () => {
    expect(render('![a](https://x.dev/i.png)')).toContain('referrerpolicy="no-referrer"')
  })

  it('always emits alt, even when the author left it empty', () => {
    expect(render('![](https://x.dev/i.png)')).toContain('alt=""')
    expect(render('![a cat](https://x.dev/i.png)')).toContain('alt="a cat"')
  })

  it('escapes a quote in the alt text exactly once', () => {
    // Marked 17 hands the alt RAW (12 pre-escaped it), so the renderer escapes it — exactly
    // once. The second assertion is the double-escape guard: it failed under 12 if you escaped
    // what was already escaped, and fails under 17 if escaping ever runs twice.
    const html = render('![say "hi"](https://x.dev/i.png)')
    expect(html).toContain('alt="say &quot;hi&quot;"')
    expect(html).not.toContain('&amp;quot;')
  })

  it('escapes an ampersand in the title exactly once', () => {
    const html = render('![a](https://x.dev/i.png "R&D")')
    expect(html).toContain('title="R&amp;D"')
    expect(html).not.toContain('&amp;amp;')
  })

  it('escapes the href, which marked hands over raw', () => {
    // The asymmetry, asserted from both sides so a future refactor that
    // "simplifies" them into one path fails here.
    const html = render('[t](https://x.dev/?a=1&b=2)')
    expect(html).toContain('href="https://x.dev/?a=1&amp;b=2"')
  })

  it('decodes asynchronously so a big image cannot block the transcript', () => {
    expect(render('![a](https://x.dev/i.png)')).toContain('decoding="async"')
  })
})

describe('marked renderer signature', () => {
  it('is the token form this file is written against', () => {
    // This canary exists to fail loudly on a marked major. It did its job once: pinned to the
    // positional (href, title, text) signature of marked 12, it caught the workspace catalog
    // landing on 17, where renderers receive one token and hand alt/title over RAW — which is why
    // the renderer now owns attribute escaping. Re-pinned to the token shape; if a future major
    // changes the contract again, this is the test that should go red first.
    let observed: unknown[] = []
    const marked = new Marked({ gfm: true })
    marked.use({
      renderer: {
        link(...args: unknown[]) {
          observed = args
          return ''
        }
      }
    })
    marked.parse('[a](https://x.dev "t")')
    expect(observed).toHaveLength(1)
    expect(observed[0]).toMatchObject({ type: 'link', href: 'https://x.dev', title: 't', text: 'a' })
  })
})

describe('remote image blocking', () => {
  const REMOTE = '![a cat](https://evil.example/p.gif)'

  it('holds back a remote image by default', () => {
    // The leak this exists for: an image fetches with no click at all.
    const html = render(REMOTE, true)
    expect(html).not.toContain('<img')
    expect(html).toContain('data-tx-blocked-image="https://evil.example/p.gif"')
    expect(html).toContain('Remote image blocked')
  })

  it('shows the alt text so the reader can judge before fetching', () => {
    expect(render(REMOTE, true)).toContain('a cat')
  })

  it('offers both ways out', () => {
    const html = render(REMOTE, true)
    expect(html).toContain('data-tx-image-action="once"')
    expect(html).toContain('data-tx-image-action="session"')
  })

  it.each([
    ['data:image/png;base64,iVBORw0KGgo='],
    ['blob:abc-123'],
    ['tfile://local/pic.png'],
    ['/relative/pic.png'],
  ])('never blocks a non-remote source (%s)', (src) => {
    // These carry their own bytes or resolve inside the app; there is no
    // request to a stranger, so blocking them would be pure friction.
    expect(render(`![a](${src})`, true)).toContain('<img')
  })

  it('loads the one image the reader asked for, and only that one', () => {
    allowRemoteImageOnce('https://evil.example/p.gif')
    expect(render(REMOTE, true)).toContain('<img')
    expect(render('![b](https://other.example/q.gif)', true)).not.toContain('<img')
  })

  it('loads everything once the reader trusts the conversation', () => {
    allowRemoteImagesForSession()
    expect(render(REMOTE, true)).toContain('<img')
    expect(render('![b](https://other.example/q.gif)', true)).toContain('<img')
  })

  it('forgets consent when the conversation is reset', () => {
    // Consent was given for one conversation; carrying it forward widens it
    // without asking.
    allowRemoteImagesForSession()
    resetRemoteImagePolicy()
    expect(render(REMOTE, true)).not.toContain('<img')
  })

  it('renders images untouched when the host turns blocking off', () => {
    expect(render(REMOTE, false)).toContain('<img')
  })

  it('escapes the blocked source instead of breaking out of the attribute', () => {
    const html = render('![a](https://x.dev/"onload=alert(1))', true)
    expect(html).toContain('&quot;')
    expect(html).not.toMatch(/data-tx-blocked-image="[^"]*"[^>]*onload/)
  })
})
