#!/usr/bin/env node
/**
 * Proves the harness works before it is pointed at the real build.
 *
 * It serves a synthetic site shaped like the docs page (`.docs-surface`,
 * `.docs-prose`, `.docs-prose-skeleton`, an in-article doc link) in two
 * variants and asserts `verify-docs-ssg.mjs` reaches the opposite verdict on
 * each:
 *
 *   --mode=ssg     body in the HTML, no body fetch on load  -> C1/C2/C3/C4 pass
 *   --mode=shell   empty shell that fetches the body on load -> C1 must FAIL
 *
 * The second mode is the point. A check that cannot fail is not a check, and
 * "no /api/docs/page request" is exactly the kind of assertion that passes when
 * the capture is dead. Running both modes green/red is the evidence that a
 * later PASS against apps/nexus/dist means something.
 *
 * Neither mode implements an error state, so C5 is expected to report
 * not-implemented in both — which also exercises the PEND path.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const VERIFY_SCRIPT = fileURLToPath(new URL('./verify-docs-ssg.mjs', import.meta.url))

const DOCS = {
  '/en/docs/dev/components/button/': {
    title: 'Button',
    headings: ['Basic usage', 'Variants', 'API'],
  },
  '/en/docs/guide/start/': {
    title: 'Getting started',
    headings: ['Install', 'First run'],
  },
}

function proseHtml(doc) {
  return `<article class="docs-prose markdown-body">
      <h1>${doc.title}</h1>
      ${doc.headings.map(h => `<h2>${h}</h2>\n      <p>Prose for ${h}. Lorem ipsum dolor sit amet.</p>`).join('\n      ')}
      <pre><code>example()</code></pre>
    </article>`
}

function skeletonHtml() {
  return `<div class="docs-prose docs-prose-skeleton markdown-body">
      <span class="docs-prose-skeleton__line is-wide"></span>
      <span class="docs-prose-skeleton__line"></span>
    </div>`
}

function pageHtml(path, doc, mode) {
  const otherPath = Object.keys(DOCS).find(candidate => candidate !== path)
  const recordPath = path.replace(/^\/en/, '').replace(/\/$/, '')
  const body = mode === 'ssg' ? proseHtml(doc) : skeletonHtml()
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${doc.title}</title></head>
<body>
  <div class="docs-root">
    <div class="docs-surface">
      ${body}
      <div class="pager"><a href="${otherPath}">Next chapter</a></div>
    </div>
  </div>
  <script>
    const RECORD_PATH = ${JSON.stringify(recordPath)}
    const MODE = ${JSON.stringify(mode)}
    function renderDoc(headings, title) {
      const surface = document.querySelector('.docs-surface')
      const old = surface.querySelector('.docs-prose')
      const article = document.createElement('article')
      article.className = 'docs-prose markdown-body'
      article.innerHTML = '<h1>' + title + '</h1>' + headings.map(h => '<h2>' + h + '</h2><p>Prose for ' + h + '.</p>').join('')
      old.replaceWith(article)
    }
    function fetchBody(recordPath) {
      return fetch('/api/docs/page?path=' + encodeURIComponent(recordPath) + '&locale=en&body=1')
        .then(response => response.json())
    }
    // The "shell" build fetches its own body on first paint. That is the
    // behaviour C1 exists to catch.
    if (MODE === 'shell') {
      fetchBody(RECORD_PATH).then(record => renderDoc(record.headings, record.title)).catch(() => {})
    }
    document.querySelector('.pager a').addEventListener('click', (event) => {
      event.preventDefault()
      const href = event.currentTarget.getAttribute('href')
      history.pushState({}, '', href)
      const surface = document.querySelector('.docs-surface')
      surface.querySelector('.docs-prose').outerHTML = ${JSON.stringify(skeletonHtml())}
      fetchBody(href.replace(/^\\/en/, '').replace(/\\/$/, ''))
        .then(record => renderDoc(record.headings, record.title))
        .catch(() => { /* no error state: C5 must report not-implemented */ })
    })
  </script>
</body></html>`
}

function startServer(mode, port) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`)
    if (url.pathname === '/api/docs/page') {
      const recordPath = url.searchParams.get('path') || ''
      const entry = Object.entries(DOCS).find(([key]) => key.replace(/^\/en/, '').replace(/\/$/, '') === recordPath)
      if (!entry) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end('{"error":"not found"}')
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ title: entry[1].title, headings: entry[1].headings }))
      return
    }
    const doc = DOCS[url.pathname]
    if (!doc) {
      response.writeHead(404, { 'content-type': 'text/html' })
      response.end('<!DOCTYPE html><html><body><div class="docs-surface"></div></body></html>')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(pageHtml(url.pathname, doc, mode))
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function runVerifier(port, cdpPort) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      VERIFY_SCRIPT,
      `--base-url=http://127.0.0.1:${port}`,
      '--doc-path=/en/docs/dev/components/button/',
      `--port=${cdpPort}`,
      '--settle-ms=2500',
      '--error-wait-ms=4000',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.on('close', code => resolve({ code, output }))
  })
}

function verdictOf(output, id) {
  const match = output.match(new RegExp(`^\\[(PASS|FAIL|PEND|INFO)\\] ${id.replace('.', '\\.')}\\s`, 'm'))
  return match ? match[1] : 'MISSING'
}

const EXPECTATIONS = {
  ssg: {
    'C2.control': 'PASS',
    'C2.raw-html': 'PASS',
    'C2.no-js-dom': 'PASS',
    'C2.no-skeleton': 'PASS',
    'C1.capture-live': 'PASS',
    'C1.no-body-fetch': 'PASS',
    'C1.control': 'PASS',
    'C3.body-survived': 'PASS',
    'C3.no-vue-warnings': 'PASS',
    'C3.control': 'PASS',
    'C4.spa-nav': 'PASS',
    'C4.body-rendered': 'PASS',
    'C4.body-fetched': 'PASS',
    'C4.control': 'PASS',
    'C5.control': 'PASS',
    'C5.error-state': 'PEND',
  },
  shell: {
    // The whole point: on a body-fetching shell these MUST go red.
    'C2.raw-html': 'FAIL',
    'C2.no-js-dom': 'FAIL',
    'C2.no-skeleton': 'FAIL',
    'C1.no-body-fetch': 'FAIL',
    // ...while the controls stay green, proving the reds are findings, not breakage.
    'C2.control': 'PASS',
    'C1.capture-live': 'PASS',
    'C1.control': 'PASS',
    'C3.control': 'PASS',
  },
}

async function runMode(mode, port, cdpPort) {
  const server = await startServer(mode, port)
  console.log(`\n${'#'.repeat(72)}\n# self-test mode=${mode} on http://127.0.0.1:${port}\n${'#'.repeat(72)}`)
  try {
    const { output } = await runVerifier(port, cdpPort)
    const failures = []
    for (const [id, expected] of Object.entries(EXPECTATIONS[mode])) {
      const actual = verdictOf(output, id)
      if (actual !== expected)
        failures.push(`${id}: expected ${expected}, got ${actual}`)
    }
    return failures
  }
  finally {
    server.close()
  }
}

async function main() {
  const only = process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1]
  const modes = only ? [only] : ['ssg', 'shell']
  const allFailures = []
  let port = 8977
  let cdpPort = 9401
  for (const mode of modes) {
    const failures = await runMode(mode, port++, cdpPort++)
    allFailures.push(...failures.map(item => `[${mode}] ${item}`))
  }

  console.log(`\n${'#'.repeat(72)}`)
  if (allFailures.length === 0) {
    console.log(`# SELF-TEST PASS (modes: ${modes.join(', ')})`)
    if (modes.length > 1) {
      console.log('#   green on a prerendered body, red on a body-fetching shell,')
      console.log('#   controls green in both — the checks discriminate.')
    }
    else {
      console.log('#   only one mode ran; run without --mode to prove the checks can also fail.')
    }
    console.log(`${'#'.repeat(72)}`)
    return 0
  }
  console.log('# SELF-TEST FAIL — the harness does not discriminate correctly:')
  for (const failure of allFailures)
    console.log(`#   ${failure}`)
  console.log(`${'#'.repeat(72)}`)
  return 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(`[self-test] fatal: ${error?.stack || error?.message || error}`)
    process.exitCode = 1
  })
