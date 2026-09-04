// Covers the HAR redaction pass used by the deployed-preview collector, which is the one part of
// handles credentials.
//
// The collector records HARs with `content: 'embed'` against a live OAuth session, so an
// unredacted file contains the session cookie and bearer token in plain text. Playwright offers no
// header filtering and writes the HAR when the context closes, so redaction is a post-pass — and a
// post-pass that silently did nothing would look exactly like one that worked, which is why every
// case here asserts on the redacted output rather than on the absence of an error.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redactHarFile } from './redact-har.mjs'

async function withHar(har, run) {
  const dir = await mkdtemp(join(tmpdir(), 'har-redact-'))
  const path = join(dir, 'evidence.har')
  try {
    await writeFile(path, JSON.stringify(har))
    const result = await redactHarFile(path)
    const after = JSON.parse(await readFile(path, 'utf8'))
    return await run(after, result)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function harWith(entry) {
  return { log: { version: '1.2', entries: [entry] } }
}

describe('redactHarFile', () => {
  it('strips credential request headers and leaves the rest legible', async () => {
    await withHar(
      harWith({
        request: {
          url: 'https://example.test/dashboard',
          headers: [
            { name: 'Authorization', value: 'Bearer real-token' },
            { name: 'Cookie', value: 'session=abc123' },
            { name: 'Accept', value: 'text/html' },
          ],
        },
        response: { headers: [] },
      }),
      (after) => {
        const headers = after.log.entries[0].request.headers
        expect(headers.find(h => h.name === 'Authorization').value).toBe('[redacted]')
        expect(headers.find(h => h.name === 'Cookie').value).toBe('[redacted]')
        // Evidence, not a credential: a redaction that ate this would gut the file.
        expect(headers.find(h => h.name === 'Accept').value).toBe('text/html')
      },
    )
  })

  it('matches header names case-insensitively, as HTTP does', async () => {
    await withHar(
      harWith({
        request: { url: 'https://example.test/', headers: [{ name: 'authorization', value: 'Bearer t' }] },
        response: { headers: [{ name: 'SET-COOKIE', value: 'session=abc; HttpOnly' }] },
      }),
      (after) => {
        expect(after.log.entries[0].request.headers[0].value).toBe('[redacted]')
        expect(after.log.entries[0].response.headers[0].value).toBe('[redacted]')
      },
    )
  })

  it('blanks every cookie value while keeping the names', async () => {
    await withHar(
      harWith({
        request: { url: 'https://example.test/', headers: [], cookies: [{ name: 'next-auth.session-token', value: 'secret' }] },
        response: { headers: [], cookies: [{ name: 'csrf', value: 'also-secret' }] },
      }),
      (after) => {
        const [entry] = after.log.entries
        expect(entry.request.cookies[0]).toEqual({ name: 'next-auth.session-token', value: '[redacted]' })
        expect(entry.response.cookies[0]).toEqual({ name: 'csrf', value: '[redacted]' })
      },
    )
  })

  it('redacts the OAuth callback query in both the URL and the parsed list', async () => {
    await withHar(
      harWith({
        request: {
          url: 'https://example.test/callback?code=live-auth-code&provider=github',
          headers: [],
          queryString: [
            { name: 'code', value: 'live-auth-code' },
            { name: 'provider', value: 'github' },
          ],
        },
        response: { headers: [] },
      }),
      (after) => {
        const { request } = after.log.entries[0]
        // The URL matters as much as the parsed list: a reader greps the file, not the schema.
        expect(request.url).not.toContain('live-auth-code')
        expect(request.url).toContain('provider=github')
        expect(request.queryString.find(q => q.name === 'code').value).toBe('[redacted]')
        expect(request.queryString.find(q => q.name === 'provider').value).toBe('github')
      },
    )
  })

  it('blanks request bodies, which carry credentials on a sign-in post', async () => {
    await withHar(
      harWith({
        request: { url: 'https://example.test/api/auth', headers: [], postData: { mimeType: 'application/json', text: '{"password":"hunter2"}' } },
        response: { headers: [] },
      }),
      (after) => {
        expect(after.log.entries[0].request.postData.text).toBe('[redacted]')
      },
    )
  })

  it('leaves response bodies alone, since they are the evidence', async () => {
    await withHar(
      harWith({
        request: { url: 'https://example.test/', headers: [] },
        response: { headers: [], content: { mimeType: 'text/html', text: '<h1>Dashboard</h1>' } },
      }),
      (after) => {
        expect(after.log.entries[0].response.content.text).toBe('<h1>Dashboard</h1>')
      },
    )
  })

  it('reports how much it redacted, so a silent no-op is visible', async () => {
    await withHar(
      harWith({
        request: { url: 'https://example.test/', headers: [{ name: 'Cookie', value: 'a=b' }] },
        response: { headers: [{ name: 'Set-Cookie', value: 'a=b' }] },
      }),
      (_after, result) => {
        expect(result.entries).toBe(1)
        expect(result.redacted).toBe(2)
      },
    )
  })

  it('treats a context that recorded nothing as empty rather than failing the run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'har-redact-'))
    try {
      const result = await redactHarFile(join(dir, 'never-written.har'))
      expect(result).toEqual({ redacted: 0, entries: 0 })
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
