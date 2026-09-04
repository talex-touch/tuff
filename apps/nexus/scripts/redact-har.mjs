// Strips credentials from a Playwright-recorded HAR.
//
// `collect-deployed-preview-evidence.mjs` records HARs with `content: 'embed'` against a live
// OAuth session, so an unredacted file contains the session cookie and bearer token in plain text.
// Playwright offers no header filtering and writes the HAR when the context closes, so this is a
// post-pass.
//
// It lives in its own module because the collector is a script: importing it runs the whole
// collection and calls `process.exit`, which leaves the redaction untestable in place.

import { readFile, writeFile } from 'node:fs/promises'

/**
 * Header and query names whose values are credentials rather than evidence.
 *
 * `Cookie` and `Set-Cookie` carry the session this run authenticates with; `Authorization` carries
 * the bearer. The query names are the OAuth callback's — a `code` or `id_token` in a recorded URL
 * is a live credential until it is exchanged or expires.
 */
const HAR_SECRET_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization'])
const HAR_SECRET_QUERY = new Set(['code', 'state', 'token', 'id_token', 'access_token', 'refresh_token'])
const REDACTED = '[redacted]'

function redactHarNameValueList(list, secretNames) {
  if (!Array.isArray(list)) return 0
  let count = 0
  for (const item of list) {
    if (item && typeof item.name === 'string' && secretNames.has(item.name.toLowerCase())) {
      item.value = REDACTED
      count += 1
    }
  }
  return count
}

/** Every recorded cookie is a session credential: the name is evidence, the value never is. */
function redactHarCookies(cookies) {
  if (!Array.isArray(cookies)) return 0
  let count = 0
  for (const cookie of cookies) {
    if (cookie && typeof cookie === 'object' && 'value' in cookie) {
      cookie.value = REDACTED
      count += 1
    }
  }
  return count
}

function redactHarUrl(url) {
  if (typeof url !== 'string' || !url.includes('?')) return url
  try {
    const parsed = new URL(url)
    let changed = false
    for (const key of [...parsed.searchParams.keys()]) {
      if (HAR_SECRET_QUERY.has(key.toLowerCase())) {
        parsed.searchParams.set(key, REDACTED)
        changed = true
      }
    }
    return changed ? parsed.toString() : url
  }
  catch {
    return url
  }
}

/**
 * Strips credentials from a recorded HAR, in place.
 *
 * Playwright writes the HAR when the context closes and offers no header filtering, so this is a
 * post-pass. It runs before the evidence file records the HAR's path, so a run that fails partway
 * still leaves nothing unredacted behind.
 *
 * Deliberately narrow: headers, cookies, the OAuth callback query and request bodies. Response
 * bodies are left alone -- they are the evidence this collector exists to capture, and blanking
 * them would leave a file with nothing in it.
 */
export async function redactHarFile(harPath) {
  let har
  try {
    har = JSON.parse(await readFile(harPath, 'utf8'))
  }
  catch {
    // A context that recorded nothing writes no file. Not an error, and not something to hide.
    return { redacted: 0, entries: 0 }
  }
  const entries = har?.log?.entries
  if (!Array.isArray(entries)) return { redacted: 0, entries: 0 }

  let redacted = 0
  for (const entry of entries) {
    const request = entry?.request
    const response = entry?.response
    if (request) {
      redacted += redactHarNameValueList(request.headers, HAR_SECRET_HEADERS)
      redacted += redactHarCookies(request.cookies)
      redacted += redactHarNameValueList(request.queryString, HAR_SECRET_QUERY)
      const url = redactHarUrl(request.url)
      if (url !== request.url) {
        request.url = url
        redacted += 1
      }
      if (request.postData && typeof request.postData.text === 'string' && request.postData.text) {
        request.postData.text = REDACTED
        redacted += 1
      }
    }
    if (response) {
      redacted += redactHarNameValueList(response.headers, HAR_SECRET_HEADERS)
      redacted += redactHarCookies(response.cookies)
    }
  }

  await writeFile(harPath, `${JSON.stringify(har, null, 2)}\n`)
  return { redacted, entries: entries.length }
}

