/**
 * Builds the document and external `blob:` bootstrapper a model-authored widget runs inside.
 *
 * Under CSP3/Chromium, `about:srcdoc` iframes inherit their parent document's CSP and enforce
 * the intersection with their own `<meta>` CSP. CoreApp's parent CSP (#689) sets
 * `script-src 'self' 'unsafe-eval' blob:` (no `'unsafe-inline'`), so an inline `<script>`
 * inside `srcdoc` would be blocked before it could run.
 *
 * Instead, the host creates a `blob:` script URL (`buildWidgetSandboxBootstrapScript`) and
 * loads it via `<script defer src="blob:...">`. Inside the opaque-origin frame, the bootstrapper
 * registers `securitypolicyviolation` and `error` listeners first, then imports both the arrow
 * runtime and the model-authored widget module from frame-local `blob:null/...` URLs (so
 * `import()` is same-origin and syntax errors in model code report cleanly instead of timing out).
 */

/**
 * The sandbox's own policy. Intersects with CoreApp's parent CSP (`script-src 'self' 'unsafe-eval'
 * blob:`) to yield `script-src blob:` — zero `'unsafe-inline'`, zero `'unsafe-eval'`, zero network.
 *
 * - `connect-src 'none'` is the load-bearing line: no fetch, no XHR, no
 *   WebSocket, no beacon. Widget code cannot send the conversation anywhere.
 * - `script-src blob:` permits the host-created bootstrap script and the
 *   frame-local module blobs for the arrow runtime and widget source.
 * - `'unsafe-eval'` is deliberately absent.
 */
const SANDBOX_CSP = [
  "default-src 'none'",
  'script-src blob:',
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  "connect-src 'none'"
].join('; ')

/** Namespaced so a widget cannot spoof another surface's messages. */
export const WIDGET_SANDBOX_MESSAGE = {
  ready: 'tuff:widget:ready',
  height: 'tuff:widget:height',
  error: 'tuff:widget:error'
} as const

export interface WidgetSandboxDocumentInput {
  /** Model-authored arrow-js source. Never evaluated outside the sandbox. */
  source: string
  /** The arrow runtime's ES module source, injected by the caller. */
  runtimeSource: string
}

export interface WidgetSandboxBuiltDocument {
  srcdoc: string
  bootstrapScriptUrl: string
  revoke: () => void
}

/**
 * Neutralises every sequence that can terminate a script block from inside a
 * JavaScript string or expression.
 */
export function escapeForScriptBlock(text: string): string {
  return text.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--')
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function assertSafeBlobScriptUrl(url: string): string {
  const trimmed = url.trim()
  if (!/^blob:[^\s"'<>]+$/i.test(trimmed)) {
    throw new Error('[WidgetSandbox] bootstrapScriptUrl must be a valid blob: URL')
  }
  return trimmed
}

/**
 * Builds the pure JavaScript bootstrapper served from a host-created `blob:` URL.
 * Pure function so it can be tested without a browser.
 */
export function buildWidgetSandboxBootstrapScript(input: WidgetSandboxDocumentInput): string {
  const runtimeLiteral = JSON.stringify(input.runtimeSource)
  const sourceLiteral = JSON.stringify(input.source)

  return `(async () => {
  'use strict';
  const post = (type, payload) => parent.postMessage({ type, ...payload }, '*');

  // A violation here is a signal, not a silent no-op: it means the widget tried
  // to reach outside and the policy stopped it. The host words it, naming the
  // directive that stopped it.
  addEventListener('securitypolicyviolation', (event) => {
    post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.error)}, { directive: event.violatedDirective });
  });

  addEventListener('error', (event) => {
    post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.error)}, { message: String(event.message) });
  });

  let runtimeUrl = '';
  let widgetUrl = '';
  try {
    runtimeUrl = URL.createObjectURL(
      new Blob([${runtimeLiteral}], { type: 'text/javascript' })
    );
    const widgetModuleSource =
      'import * as __tuffArrow from ' + JSON.stringify(runtimeUrl) + ';\\n' +
      'export default async function __runWidget(root) {\\n' +
      '  const { reactive, html, watch } = __tuffArrow;\\n' +
      ${sourceLiteral} + '\\n' +
      '}\\n';
    widgetUrl = URL.createObjectURL(
      new Blob([widgetModuleSource], { type: 'text/javascript' })
    );

    const mod = await import(widgetUrl);
    const root = document.getElementById('root');
    await mod.default(root);

    // Reported after layout settles, then on every change: the host cannot know
    // how tall a widget wants to be, and guessing leaves a gap or a clipped edge.
    const report = () => post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.height)}, {
      px: Math.ceil(document.documentElement.getBoundingClientRect().height)
    });
    new ResizeObserver(report).observe(document.documentElement);
    report();
    post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.ready)}, {});
  } catch (error) {
    post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.error)}, { message: String(error && error.message || error) });
  } finally {
    if (widgetUrl) URL.revokeObjectURL(widgetUrl);
    if (runtimeUrl) URL.revokeObjectURL(runtimeUrl);
  }
})();
`
}

/**
 * Builds the `srcdoc` HTML wrapper referencing a host-created `blob:` bootstrap script.
 * Contains zero inline `<script>` bodies and zero model-authored bytes.
 */
export function buildWidgetSandboxDocument(bootstrapScriptUrl: string): string {
  const safeUrl = assertSafeBlobScriptUrl(bootstrapScriptUrl)

  // The CSP meta must be the first element in <head>: a policy only governs what
  // is parsed after it. Nothing model-authored appears anywhere in this HTML.
  return `<!doctype html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">
<meta charset="utf-8">
<style>
  /* The frame is a separate document: it cannot read the app's --shell-* tokens.
     \`color-scheme\` plus the \`canvastext\` system colour is what keeps a widget
     legible in both themes without plumbing a palette across the origin. */
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: canvastext;
  }
</style>
</head>
<body>
<div id="root"></div>
<script defer src="${escapeHtmlAttribute(safeUrl)}"></script>
</body>
</html>`
}

/**
 * Creates a host-owned `blob:` bootstrapper URL and returns the `srcdoc` + cleanup disposer.
 */
export function createWidgetSandboxDocument(
  input: WidgetSandboxDocumentInput
): WidgetSandboxBuiltDocument {
  const bootstrapSource = buildWidgetSandboxBootstrapScript(input)
  const bootstrapScriptUrl = URL.createObjectURL(
    new Blob([bootstrapSource], { type: 'text/javascript' })
  )
  let revoked = false
  return {
    srcdoc: buildWidgetSandboxDocument(bootstrapScriptUrl),
    bootstrapScriptUrl,
    revoke: () => {
      if (revoked) return
      revoked = true
      URL.revokeObjectURL(bootstrapScriptUrl)
    }
  }
}
