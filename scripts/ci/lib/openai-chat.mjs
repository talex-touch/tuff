export function normalizeOpenAiBaseUrl(url) {
  return String(url || '').replace(/\/$/, '')
}

export function normalizeOpenAiCompletionsPath(path) {
  const raw = String(path || '')
  if (!raw) {
    return '/chat/completions'
  }
  return raw.startsWith('/') ? raw : `/${raw}`
}

export async function requestChatCompletion({
  apiKey,
  baseUrl,
  completionsPath = '/chat/completions',
  model,
  temperature,
  maxTokens,
  messages,
  errorPrefix = 'OpenAI-compatible request failed',
}) {
  const payload = {
    model,
    temperature,
    messages,
  }

  if (Number.isFinite(maxTokens)) {
    payload.max_tokens = maxTokens
  }

  const response = await fetch(`${normalizeOpenAiBaseUrl(baseUrl)}${normalizeOpenAiCompletionsPath(completionsPath)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`${errorPrefix} (${response.status}): ${text}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content || String(content).trim().length === 0) {
    throw new Error('Missing completion content from API response.')
  }
  return String(content).trim()
}
