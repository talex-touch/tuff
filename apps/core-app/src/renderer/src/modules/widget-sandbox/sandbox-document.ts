/**
 * Builds the document a model-authored widget runs inside.
 *
 * This function is the trust root of the whole sandbox. Everything else —
 * the opaque origin, the CSP, the missing network — is only as good as this
 * string assembly, because a single unescaped sequence lets the widget's source
 * break out of its script block and write markup into the document that was
 * meant to contain it.
 *
 * It is a pure function so it can be tested without a browser: given a source,
 * the output is fully determined.
 */

/**
 * The sandbox's own policy. A srcdoc document inherits its parent's CSP, and the
 * app's parent policy is wide open (`default-src *`, `script-src * 'unsafe-inline'
 * 'unsafe-eval'`), so nothing is inherited that helps — this has to carry the
 * whole restriction. CSP composes by intersection, so declaring it here wins.
 *
 * - `connect-src 'none'` is the load-bearing line: no fetch, no XHR, no
 *   WebSocket, no beacon. Widget code cannot send the conversation anywhere.
 * - `blob:` in `script-src` looks like a hole and is not: a blob can only be
 *   built from bytes already inside the frame, and creating one touches no
 *   network. It is how the arrow runtime is handed to the widget module.
 * - `'unsafe-eval'` is deliberately absent. Not because eval would breach the
 *   boundary — the code in here is already arbitrary — but because its absence
 *   costs nothing and removes a whole class of accidental capability.
 */
const SANDBOX_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
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

/**
 * Neutralises every sequence that can terminate a script block from inside a
 * JavaScript string or expression.
 *
 * The HTML parser does not understand JavaScript: inside `<script>` it scans
 * for `</script` and for the legacy `<!--` comment opener, and neither quoting
 * nor JSON encoding hides them. `<\/` is identical to `</` once the JS parser
 * sees it (`\/` is just `/` in both string literals and regex bodies), so this
 * is value-preserving — the widget observes exactly the text it wrote.
 *
 * Applied to the runtime source too, not just the model's: the rule is a
 * property of the destination, not of who authored the text.
 */
export function escapeForScriptBlock(text: string): string {
  return text.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--')
}

export function buildWidgetSandboxDocument(input: WidgetSandboxDocumentInput): string {
  // JSON.stringify gives a valid JS string literal; the escape pass then makes
  // it safe to sit inside a script block. Order matters — escaping first would
  // be undone by nothing, but stringifying second would re-escape backslashes.
  const runtimeLiteral = escapeForScriptBlock(JSON.stringify(input.runtimeSource))
  const widgetSource = escapeForScriptBlock(input.source)

  // The CSP meta must be the first element in <head>: a policy only governs what
  // is parsed after it. Nothing model-authored appears before this line.
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
<script type="module">
const post = (type, payload) => parent.postMessage({ type, ...payload }, '*')

// A violation here is a signal, not a silent no-op: it means the widget tried
// to reach outside and the policy stopped it. The host shows it.
addEventListener('securitypolicyviolation', (event) => {
  post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.error)}, {
    message: 'blocked by sandbox policy: ' + event.violatedDirective
  })
})

addEventListener('error', (event) => {
  post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.error)}, { message: String(event.message) })
})

try {
  const runtimeUrl = URL.createObjectURL(
    new Blob([${runtimeLiteral}], { type: 'text/javascript' })
  )
  const arrow = await import(runtimeUrl)
  URL.revokeObjectURL(runtimeUrl)

  const root = document.getElementById('root')
  const { reactive, html, watch } = arrow

  // The widget's own code. It sees arrow's exports and \`root\`, and nothing of
  // the host: this frame has an opaque origin, so \`parent\` is a bare window
  // reference with no readable properties.
${widgetSource}

  // Reported after layout settles, then on every change: the host cannot know
  // how tall a widget wants to be, and guessing leaves a gap or a clipped edge.
  const report = () => post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.height)}, {
    px: Math.ceil(document.documentElement.getBoundingClientRect().height)
  })
  new ResizeObserver(report).observe(document.documentElement)
  report()
  post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.ready)}, {})
} catch (error) {
  post(${JSON.stringify(WIDGET_SANDBOX_MESSAGE.error)}, { message: String(error && error.message || error) })
}
</script>
</body>
</html>`
}
