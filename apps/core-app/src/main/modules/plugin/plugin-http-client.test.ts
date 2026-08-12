import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('../network', () => ({
  getNetworkService: () => ({ request: requestMock })
}))

const { createPluginHttpClient, normalizeNetworkMethod, normalizeResponseType } =
  await import('./plugin-http-client')

/**
 * The method allowlist is why this is worth reading on its own (#339).
 *
 * A plugin supplies `method` as a free string on the config object, and this is the last thing
 * between that string and the network service. While it lived among four thousand lines of
 * `plugin.ts` nothing tested it; the narrowing is the reason the extraction was worth doing, so
 * it gets asserted here rather than assumed.
 */
describe('plugin http method narrowing', () => {
  it('passes the methods the network service is allowed to see', () => {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
      expect(normalizeNetworkMethod(method)).toBe(method)
  })

  it('accepts the same methods in any casing and with stray whitespace', () => {
    expect(normalizeNetworkMethod('post')).toBe('POST')
    expect(normalizeNetworkMethod('  delete  ')).toBe('DELETE')
    expect(normalizeNetworkMethod('PaTcH')).toBe('PATCH')
  })

  /**
   * The failure mode worth guarding: falling back to `GET` rather than forwarding whatever the
   * plugin wrote. `TRACE` and `CONNECT` are real HTTP methods deliberately left out of the set,
   * so they are the cases that show the rule is an allowlist and not a syntax check.
   */
  it('falls back to GET for anything outside the set', () => {
    for (const method of ['TRACE', 'CONNECT', 'PROPFIND', 'GET ', '', 'not a method', 'GET;POST'])
      expect(normalizeNetworkMethod(method), method).toBe('GET')
  })

  it('falls back to GET when the plugin supplies no method or a non-string', () => {
    expect(normalizeNetworkMethod(undefined)).toBe('GET')
    expect(normalizeNetworkMethod(42 as never)).toBe('GET')
    expect(normalizeNetworkMethod(null as never)).toBe('GET')
  })
})

describe('response type mapping', () => {
  // The plugin-facing name is `arraybuffer`; the network service takes `arrayBuffer`. Getting this
  // wrong hands binary responses back parsed as JSON.
  it('renames arraybuffer to the network service spelling', () => {
    expect(normalizeResponseType('arraybuffer')).toBe('arrayBuffer')
  })

  it('leaves the names both sides already agree on alone', () => {
    expect(normalizeResponseType('json')).toBe('json')
    expect(normalizeResponseType('text')).toBe('text')
    expect(normalizeResponseType(undefined)).toBeUndefined()
  })
})

describe('createPluginHttpClient', () => {
  beforeEach(() => {
    requestMock.mockReset()
    requestMock.mockResolvedValue({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      url: 'https://example.test/resolved'
    })
  })

  it('forwards the config to the network service under its own field names', async () => {
    const signal = new AbortController().signal
    const client = createPluginHttpClient()

    await client.request({
      url: 'https://example.test',
      method: 'post',
      headers: { 'x-test': '1' },
      params: { page: 2 },
      data: { body: true },
      signal,
      timeoutMs: 1_500,
      responseType: 'arraybuffer'
    })

    // `params` becomes `query` and `data` becomes `body`; a rename missed here sends the query
    // string as a request body.
    expect(requestMock).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.test',
      headers: { 'x-test': '1' },
      query: { page: 2 },
      body: { body: true },
      signal,
      timeoutMs: 1_500,
      responseType: 'arrayBuffer'
    })
  })

  it('prefers timeoutMs over the older timeout field', async () => {
    const client = createPluginHttpClient()

    await client.request({ url: 'https://example.test', timeout: 900, timeoutMs: 100 })
    expect(requestMock.mock.calls[0]?.[0].timeoutMs).toBe(100)

    await client.request({ url: 'https://example.test', timeout: 900 })
    expect(requestMock.mock.calls[1]?.[0].timeoutMs).toBe(900)

    await client.request({ url: 'https://example.test' })
    expect(requestMock.mock.calls[2]?.[0].timeoutMs).toBeUndefined()
  })

  it('returns the response with the config that produced it', async () => {
    const client = createPluginHttpClient()
    const config = { url: 'https://example.test', method: 'GET' }

    const response = await client.request(config)

    expect(response).toEqual({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
      // The URL the service actually reached, not the one asked for — this is how a redirect is
      // visible to the plugin.
      url: 'https://example.test/resolved'
    })
  })

  it('pins the method on every verb helper regardless of what the config asked for', async () => {
    const client = createPluginHttpClient()

    await client.get('https://example.test', { method: 'DELETE' } as never)
    await client.post('https://example.test', { a: 1 }, { method: 'DELETE' } as never)
    await client.put('https://example.test', { a: 1 })
    await client.patch('https://example.test', { a: 1 })
    await client.delete('https://example.test', { method: 'POST' } as never)

    expect(requestMock.mock.calls.map((call) => call[0].method)).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE'
    ])
  })

  it('sends the body only for the verbs that carry one', async () => {
    const client = createPluginHttpClient()

    await client.get('https://example.test')
    await client.delete('https://example.test')
    await client.post('https://example.test', { a: 1 })

    expect(requestMock.mock.calls[0]?.[0].body).toBeUndefined()
    expect(requestMock.mock.calls[1]?.[0].body).toBeUndefined()
    expect(requestMock.mock.calls[2]?.[0].body).toEqual({ a: 1 })
  })

  it('lets a network failure reach the plugin rather than resolving with a fabricated response', async () => {
    requestMock.mockRejectedValueOnce(new Error('offline'))
    const client = createPluginHttpClient()

    await expect(client.get('https://example.test')).rejects.toThrow('offline')
  })
})
