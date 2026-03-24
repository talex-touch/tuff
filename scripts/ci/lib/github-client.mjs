function normalizeEndpoint(endpoint) {
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`
}

export function createGitHubClient({ token, userAgent = 'tuff-ci-bot' }) {
  async function request(endpoint, init = {}) {
    const url = new URL(normalizeEndpoint(endpoint), 'https://api.github.com')
    const headers = {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': userAgent,
      ...(init.headers ?? {}),
    }

    if (init.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      ...init,
      headers,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`GitHub API request failed (${response.status}): ${text}`)
    }

    return response
  }

  async function listPaginatedJson(endpointFactory, pageSize = 100) {
    const rows = []
    let page = 1

    while (true) {
      const endpoint = endpointFactory(page, pageSize)
      const response = await request(endpoint)
      const chunk = await response.json()
      rows.push(...chunk)
      if (!Array.isArray(chunk) || chunk.length < pageSize) {
        break
      }
      page += 1
    }

    return rows
  }

  return {
    request,
    listPaginatedJson,
  }
}
