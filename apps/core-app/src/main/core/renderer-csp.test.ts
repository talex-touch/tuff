import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRendererCspFilterUrls,
  buildRendererCspPolicy,
  CSP_HEADER,
  CSP_RESOURCE_TYPES,
  DEV_CONNECT_LOOPBACK_SOURCES,
  installRendererCspPolicy,
  isCoreAppRendererFileUrl,
  PRODUCTION_RENDERER_CSP,
  PRODUCTION_RENDERER_META_CSP,
  resolveDefaultRendererRoots,
  resolveRendererCspPolicyForUrl,
  SENTRY_INGEST_ORIGIN,
  withCspHeader,
  type InstallRendererCspPolicyOptions,
  type RendererCspMode
} from './renderer-csp'

const RENDERER_HTML = readFileSync(path.join(__dirname, '../../renderer/index.html'), 'utf8')
const PRECORE = readFileSync(path.join(__dirname, 'precore.ts'), 'utf8')
const UPDATE_SYSTEM = readFileSync(
  path.join(__dirname, '../modules/update/update-system.ts'),
  'utf8'
)

const MAC_RENDERER_ROOT = '/Applications/Tuff.app/Contents/Resources/app.asar/out/renderer'
const WIN_RENDERER_ROOT = 'C:\\Program Files\\Tuff\\resources\\app.asar\\out\\renderer'

interface CapturedListener {
  filter: { urls: string[]; types?: string[] }
  respond: (details: {
    url: string
    resourceType: string
    responseHeaders?: Record<string, string[]>
  }) => { responseHeaders?: Record<string, string[]> }
}

function installOnFakeSession(options: InstallRendererCspPolicyOptions): CapturedListener {
  let captured: CapturedListener | null = null

  installRendererCspPolicy(
    {
      webRequest: {
        onHeadersReceived: (filter, listener) => {
          captured = {
            filter,
            respond: (details) => {
              let response: { responseHeaders?: Record<string, string[]> } | null = null
              listener(details, (value) => {
                response = value
              })
              expect(response, 'listener did not call back').not.toBeNull()
              return response!
            }
          }
        }
      }
    },
    options
  )

  expect(captured, 'installer did not register an onHeadersReceived listener').not.toBeNull()
  return captured!
}

function parseDirectives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const rawEntry of policy.split(';')) {
    const trimmed = rawEntry.trim()
    if (!trimmed) continue
    const [name, ...tokens] = trimmed.split(/\s+/)
    map.set(name, tokens)
  }
  return map
}

function extractMetaCsp(html: string): string {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '')
  const match = /http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"/i.exec(stripped)
  expect(match, 'Content-Security-Policy meta tag not found in renderer/index.html').not.toBeNull()
  return match![1]
    .split(';')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('; ')
}

describe('buildRendererCspPolicy', () => {
  it('builds a single-line header value with no CR/LF characters', () => {
    expect(PRODUCTION_RENDERER_CSP).not.toMatch(/[\r\n]/)
    expect(
      buildRendererCspPolicy({
        mode: 'development',
        devServerUrl: 'http://127.0.0.1:5173'
      })
    ).not.toMatch(/[\r\n]/)
  })

  it('contains zero wildcard (*) tokens in any directive in production', () => {
    const directives = parseDirectives(PRODUCTION_RENDERER_CSP)
    expect(directives.size).toBeGreaterThanOrEqual(12)

    for (const [name, tokens] of directives.entries()) {
      expect(tokens, `directive ${name} must not contain wildcard *`).not.toContain('*')
    }
  })

  it('hardens script-src by forbidding *, unsafe-inline, and data: in prod and dev', () => {
    const prodScript = parseDirectives(PRODUCTION_RENDERER_CSP).get('script-src')!
    const devScript = parseDirectives(
      buildRendererCspPolicy({ mode: 'development', devServerUrl: 'http://127.0.0.1:5173' })
    ).get('script-src')!

    for (const tokens of [prodScript, devScript]) {
      expect(tokens).toContain("'self'")
      expect(tokens).toContain('blob:')
      expect(tokens).not.toContain('*')
      expect(tokens).not.toContain("'unsafe-inline'")
      expect(tokens).not.toContain('data:')
    }
  })

  it('tracks unsafe-eval explicitly via allowWidgetEval so removing it later is a single flag flip', () => {
    const withWidgetEval = parseDirectives(
      buildRendererCspPolicy({ mode: 'production', allowWidgetEval: true })
    ).get('script-src')!
    const withoutWidgetEval = parseDirectives(
      buildRendererCspPolicy({ mode: 'production', allowWidgetEval: false })
    ).get('script-src')!

    expect(withWidgetEval).toContain("'unsafe-eval'")
    expect(withoutWidgetEval).not.toContain("'unsafe-eval'")
    expect(withoutWidgetEval).toEqual(["'self'", 'blob:'])
  })

  it('excludes localhost, 127.0.0.1, and ws:/wss: from production connect-src even if devServerUrl is passed', () => {
    const policy = buildRendererCspPolicy({
      mode: 'production',
      devServerUrl: 'http://127.0.0.1:5173'
    })
    const connectSrc = parseDirectives(policy).get('connect-src')!

    expect(connectSrc).toContain("'self'")
    expect(connectSrc).toContain(SENTRY_INGEST_ORIGIN)
    expect(connectSrc).toContain('tfile:')
    expect(connectSrc).toContain('blob:')
    expect(connectSrc).toContain('data:')
    expect(connectSrc).not.toContain('*')
    expect(connectSrc).not.toContain('ws:')
    expect(connectSrc).not.toContain('wss:')
    expect(connectSrc.some((token) => token.includes('localhost'))).toBe(false)
    expect(connectSrc.some((token) => token.includes('127.0.0.1'))).toBe(false)
  })

  it('adds narrow Vite dev origin and loopback HMR allowances only in development mode', () => {
    const devPolicy = buildRendererCspPolicy({
      mode: 'development',
      devServerUrl: 'http://127.0.0.1:5173/'
    })
    const connectSrc = parseDirectives(devPolicy).get('connect-src')!

    expect(connectSrc).toContain('http://127.0.0.1:5173')
    expect(connectSrc).toContain('ws://127.0.0.1:5173')
    for (const token of DEV_CONNECT_LOOPBACK_SOURCES) {
      expect(connectSrc).toContain(token)
    }
    expect(connectSrc).not.toContain('*')
    expect(connectSrc).not.toContain('ws:')
    expect(connectSrc).not.toContain('wss:')
  })

  it('derives wss: origin when devServerUrl uses https:', () => {
    const devPolicy = buildRendererCspPolicy({
      mode: 'development',
      devServerUrl: 'https://dev.local:8443/app'
    })
    const connectSrc = parseDirectives(devPolicy).get('connect-src')!
    expect(connectSrc).toContain('https://dev.local:8443')
    expect(connectSrc).toContain('wss://dev.local:8443')
  })

  it('enforces defense-in-depth directives and isolates header-only frame-ancestors', () => {
    const headerDirectives = parseDirectives(PRODUCTION_RENDERER_CSP)
    const metaDirectives = parseDirectives(PRODUCTION_RENDERER_META_CSP)

    expect(headerDirectives.get('object-src')).toEqual(["'none'"])
    expect(headerDirectives.get('frame-src')).toEqual(['blob:'])
    expect(headerDirectives.get('worker-src')).toEqual(["'self'", 'blob:'])
    expect(headerDirectives.get('base-uri')).toEqual(["'self'"])
    expect(headerDirectives.get('form-action')).toEqual(["'self'"])
    expect(headerDirectives.get('frame-ancestors')).toEqual(["'none'"])

    // Chromium ignores frame-ancestors in <meta>, so the meta policy must omit it.
    expect(metaDirectives.has('frame-ancestors')).toBe(false)
    expect(metaDirectives.get('base-uri')).toEqual(["'self'"])
    expect(metaDirectives.get('form-action')).toEqual(["'self'"])
  })
})

describe('isCoreAppRendererFileUrl & resolveRendererCspPolicyForUrl', () => {
  it('matches packaged POSIX and Windows renderer HTML and worker asset URLs', () => {
    expect(
      isCoreAppRendererFileUrl(`file://${MAC_RENDERER_ROOT}/index.html#/meta-overlay`, [
        MAC_RENDERER_ROOT
      ])
    ).toBe(true)
    expect(
      isCoreAppRendererFileUrl(`file://${MAC_RENDERER_ROOT}/assets/worker-abc.js`, [
        MAC_RENDERER_ROOT
      ])
    ).toBe(true)
    expect(
      isCoreAppRendererFileUrl(
        'file:///c:/Program%20Files/Tuff/resources/app.asar/out/renderer/index.html',
        [WIN_RENDERER_ROOT]
      )
    ).toBe(true)
  })

  it('rejects sibling-prefix, traversal, encoded-separator, and remote UNC file URLs', () => {
    const rejected = [
      `file://${MAC_RENDERER_ROOT}-evil/index.html`,
      `file://${MAC_RENDERER_ROOT}/../../etc/passwd`,
      `file://${MAC_RENDERER_ROOT}/..%2f..%2fetc/passwd`,
      `file://${MAC_RENDERER_ROOT}/..%5csecret.html`,
      'file://attacker.example/Applications/Tuff.app/Contents/Resources/app.asar/out/renderer/index.html',
      'file:///etc/passwd',
      'file:///Users/alice/Downloads/untrusted.html'
    ]

    for (const url of rejected) {
      expect(isCoreAppRendererFileUrl(url, [MAC_RENDERER_ROOT]), url).toBe(false)
    }
  })

  it('attaches strict production CSP to packaged file:// renderer URLs even if devServerUrl is set', () => {
    const resolved = resolveRendererCspPolicyForUrl(`file://${MAC_RENDERER_ROOT}/index.html`, {
      isPackaged: true,
      rendererRoots: [MAC_RENDERER_ROOT],
      devServerUrl: 'http://127.0.0.1:5173'
    })

    expect(resolved).toEqual({
      mode: 'production',
      policy: PRODUCTION_RENDERER_CSP
    })
  })

  it('ignores devServerUrl completely when isPackaged is true', () => {
    const resolved = resolveRendererCspPolicyForUrl('http://127.0.0.1:5173/', {
      isPackaged: true,
      rendererRoots: [MAC_RENDERER_ROOT],
      devServerUrl: 'http://127.0.0.1:5173'
    })

    expect(resolved).toBeNull()
  })

  it('attaches scoped dev CSP only to the configured Vite origin when unpackaged', () => {
    const config = {
      isPackaged: false,
      rendererRoots: [MAC_RENDERER_ROOT],
      devServerUrl: 'http://127.0.0.1:5173/'
    }

    const devDoc = resolveRendererCspPolicyForUrl('http://127.0.0.1:5173/#/home', config)
    expect(devDoc?.mode).toBe('development')
    expect(devDoc?.policy).toContain('ws://127.0.0.1:5173')

    // Unpackaged file-backed build gets production CSP, not dev HMR allowances.
    const fileDoc = resolveRendererCspPolicyForUrl(`file://${MAC_RENDERER_ROOT}/index.html`, config)
    expect(fileDoc).toEqual({
      mode: 'production',
      policy: PRODUCTION_RENDERER_CSP
    })
  })

  it('returns null for external websites, other loopback ports, data: overlays, tfile:, and devtools', () => {
    const config = {
      isPackaged: false,
      rendererRoots: [MAC_RENDERER_ROOT],
      devServerUrl: 'http://127.0.0.1:5173'
    }

    const untouchedUrls = [
      'https://github.com/talex-touch/tuff',
      'https://www.google.com/',
      'http://example.com/page',
      'http://127.0.0.1:8080/mcp',
      'http://localhost:3000/',
      'data:text/html;charset=utf-8,%3Chtml%3E%3C/html%3E',
      'tfile:///Users/alice/icon.png',
      'devtools://devtools/bundled/inspector.html',
      'chrome-extension://abcdef/popup.html',
      'not-a-valid-url'
    ]

    for (const url of untouchedUrls) {
      expect(resolveRendererCspPolicyForUrl(url, config), url).toBeNull()
    }
  })
})

describe('withCspHeader', () => {
  it('adds Content-Security-Policy while preserving all existing headers without mutating input', () => {
    const original: Record<string, string[]> = {
      'Content-Type': ['text/html; charset=utf-8'],
      'Cache-Control': ['no-cache'],
      'Set-Cookie': ['a=1', 'b=2']
    }
    const headers = withCspHeader(original, PRODUCTION_RENDERER_CSP)

    expect(headers['Content-Type']).toEqual(['text/html; charset=utf-8'])
    expect(headers['Cache-Control']).toEqual(['no-cache'])
    expect(headers['Set-Cookie']).toEqual(['a=1', 'b=2'])
    expect(headers[CSP_HEADER]).toEqual([PRODUCTION_RENDERER_CSP])
    expect(original[CSP_HEADER]).toBeUndefined()
  })

  it('works when responseHeaders is undefined (packaged file:// responses)', () => {
    const headers = withCspHeader(undefined, PRODUCTION_RENDERER_CSP)
    expect(headers).toEqual({ [CSP_HEADER]: [PRODUCTION_RENDERER_CSP] })
  })

  it('replaces a differently-cased existing Content-Security-Policy header instead of duplicating', () => {
    const headers = withCspHeader(
      {
        'content-security-policy': ["default-src * 'unsafe-inline'"],
        'X-Custom': ['keep']
      },
      PRODUCTION_RENDERER_CSP
    )

    const matchingKeys = Object.keys(headers).filter(
      (key) => key.toLowerCase() === CSP_HEADER.toLowerCase()
    )
    expect(matchingKeys).toEqual([CSP_HEADER])
    expect(headers[CSP_HEADER]).toEqual([PRODUCTION_RENDERER_CSP])
    expect(headers['X-Custom']).toEqual(['keep'])
  })
})

describe('installRendererCspPolicy', () => {
  it('registers valid Chromium URLPattern filters (file:///* with three slashes, excluding tfile: and external origins)', () => {
    const prodUrls = buildRendererCspFilterUrls({
      isPackaged: true,
      devServerUrl: 'http://127.0.0.1:5173'
    })
    const devUrls = buildRendererCspFilterUrls({
      isPackaged: false,
      devServerUrl: 'http://127.0.0.1:5173/'
    })

    expect(prodUrls).toEqual(['file:///*'])
    expect(devUrls).toEqual(['file:///*', 'http://127.0.0.1:5173/*'])

    // Validate against Chromium extensions::URLPattern syntax: `file://` MUST carry a leading
    // path slash (`file:///...`), and `http(s)://` MUST carry `<host>[:<port>]/<path>`.
    const validChromiumPattern = /^(?:file:\/\/\/.*|https?:\/\/[^/\s]+\/.*)$/
    for (const pattern of [...prodUrls, ...devUrls]) {
      expect(pattern, `invalid Electron WebRequestFilter match pattern: ${pattern}`).toMatch(
        validChromiumPattern
      )
    }

    const { filter } = installOnFakeSession({
      isPackaged: true,
      rendererRoots: [MAC_RENDERER_ROOT]
    })
    expect(filter.urls).toEqual(['file:///*'])
    expect(filter.types).toEqual([...CSP_RESOURCE_TYPES])
  })

  it('attaches strict production CSP to packaged renderer mainFrame and worker scripts', () => {
    const attached: Array<{ url: string; mode: RendererCspMode }> = []
    const { respond } = installOnFakeSession({
      isPackaged: true,
      rendererRoots: [MAC_RENDERER_ROOT],
      onAttached: (url, mode) => attached.push({ url, mode })
    })

    const docResponse = respond({
      url: `file://${MAC_RENDERER_ROOT}/index.html`,
      resourceType: 'mainFrame',
      responseHeaders: { 'Content-Type': ['text/html'] }
    })
    expect(docResponse.responseHeaders?.['Content-Type']).toEqual(['text/html'])
    expect(docResponse.responseHeaders?.[CSP_HEADER]).toEqual([PRODUCTION_RENDERER_CSP])

    const workerResponse = respond({
      url: `file://${MAC_RENDERER_ROOT}/assets/worker-123.js`,
      resourceType: 'script',
      responseHeaders: { 'Content-Type': ['text/javascript'] }
    })
    expect(workerResponse.responseHeaders?.['Content-Type']).toEqual(['text/javascript'])
    expect(workerResponse.responseHeaders?.[CSP_HEADER]).toEqual([PRODUCTION_RENDERER_CSP])

    // onAttached reports document deliveries once per mainFrame, not every script chunk.
    expect(attached).toEqual([
      { url: `file://${MAC_RENDERER_ROOT}/index.html`, mode: 'production' }
    ])
  })

  it('attaches scoped dev CSP to Vite dev URL and leaves external WebContentsView URLs untouched', () => {
    const attached: Array<{ url: string; mode: RendererCspMode }> = []
    const { respond } = installOnFakeSession({
      isPackaged: false,
      rendererRoots: [MAC_RENDERER_ROOT],
      devServerUrl: 'http://127.0.0.1:5173',
      onAttached: (url, mode) => attached.push({ url, mode })
    })

    const devResponse = respond({
      url: 'http://127.0.0.1:5173/',
      resourceType: 'mainFrame',
      responseHeaders: { 'Content-Type': ['text/html'] }
    })
    expect(devResponse.responseHeaders?.[CSP_HEADER]?.[0]).toContain('ws://127.0.0.1:5173')
    expect(devResponse.responseHeaders?.['Content-Type']).toEqual(['text/html'])

    const externalHttps = respond({
      url: 'https://github.com/talex-touch/tuff',
      resourceType: 'mainFrame',
      responseHeaders: {
        'Content-Type': ['text/html'],
        'Content-Security-Policy': [
          "default-src 'none'; script-src https://github.githubassets.com"
        ]
      }
    })
    expect(externalHttps.responseHeaders).toBeUndefined()

    const externalHttp = respond({
      url: 'http://example.com/',
      resourceType: 'mainFrame',
      responseHeaders: { 'Content-Type': ['text/html'] }
    })
    expect(externalHttp.responseHeaders).toBeUndefined()

    const overlayDataUrl = respond({
      url: 'data:text/html;charset=utf-8,%3Cscript%3E%3C/script%3E',
      resourceType: 'mainFrame'
    })
    expect(overlayDataUrl.responseHeaders).toBeUndefined()

    const imageSubresource = respond({
      url: 'http://127.0.0.1:5173/logo.png',
      resourceType: 'image',
      responseHeaders: { 'Content-Type': ['image/png'] }
    })
    expect(imageSubresource.responseHeaders).toBeUndefined()

    expect(attached).toEqual([{ url: 'http://127.0.0.1:5173/', mode: 'development' }])
  })
})

describe('resolveDefaultRendererRoots', () => {
  it('resolves deduplicated renderer directories including modules/renderer-override root', () => {
    const overrideRoot = '/Users/alice/Library/Application Support/tuff/modules/renderer-override'
    const roots = resolveDefaultRendererRoots({
      mainDir: '/Applications/Tuff.app/Contents/Resources/app.asar/out/main',
      appPath: '/Applications/Tuff.app/Contents/Resources/app.asar',
      resourcesPath: '/Applications/Tuff.app/Contents/Resources',
      platform: 'darwin',
      overrideRoot
    })

    expect(roots).toContain('/Applications/Tuff.app/Contents/Resources/app.asar/out/renderer')
    expect(roots).toContain('/Applications/Tuff.app/Contents/Resources/renderer')
    expect(roots).toContain(overrideRoot)
    expect(new Set(roots).size).toBe(roots.length)

    // Versioned override bundle under `modules/renderer-override/<version>/index.html` must match.
    expect(
      isCoreAppRendererFileUrl(
        'file:///Users/alice/Library/Application%20Support/tuff/modules/renderer-override/2.5.0/index.html',
        roots
      )
    ).toBe(true)
  })
})

describe('fallback meta parity and precore wiring', () => {
  it('renderer/index.html fallback meta matches PRODUCTION_RENDERER_META_CSP with no report-only meta', () => {
    expect(RENDERER_HTML).not.toMatch(/http-equiv\s*=\s*"Content-Security-Policy-Report-Only"/i)
    const metaPolicy = extractMetaCsp(RENDERER_HTML)
    expect(metaPolicy).toBe(PRODUCTION_RENDERER_META_CSP)
    expect(metaPolicy).not.toContain('frame-ancestors')
  })

  it('precore.ts installs enforcing renderer CSP on session.defaultSession inside app.whenReady()', () => {
    const readyStart = PRECORE.indexOf('void app.whenReady().then(')
    const readyEnd = PRECORE.indexOf("powerMonitor.on('shutdown'", readyStart)
    expect(readyStart).toBeGreaterThan(-1)
    expect(readyEnd).toBeGreaterThan(readyStart)

    const readyBlock = PRECORE.slice(readyStart, readyEnd)
    expect(readyBlock).toContain('installRendererCspPolicy(session.defaultSession')
    expect(readyBlock).toContain('installDefaultSessionPermissionPolicy(session.defaultSession')
    // Override root must match UpdateSystem.resolveRendererOverrideRoot() (`modules/renderer-override`).
    expect(readyBlock).toContain("path.join(innerRootPath, 'modules', 'renderer-override')")
    expect(UPDATE_SYSTEM).toContain("path.join(this.storageRoot, 'modules', RENDERER_OVERRIDE_DIR)")
  })
})
