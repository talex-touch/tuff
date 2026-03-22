import type {
  PilotBuiltinSourceRule,
  PilotWebsearchProviderType,
} from './pilot-admin-datasource-config'
import { createHash } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'

export interface PilotWebsearchSearchHit {
  url: string
  title: string
  snippet: string
  domain: string
  score?: number
  publishedAt?: string
  sourceType?: string
  sourceRuleId?: string
}

export interface PilotWebsearchRawDocument {
  url: string
  title: string
  snippet: string
  content: string
  contentType: string
  statusCode?: number
}

export interface PilotWebsearchNormalizedDocument {
  url: string
  title: string
  snippet: string
  content: string
  domain: string
  urlHash: string
  contentHash: string
  sourceType?: string
  sourceRuleId?: string
}

export interface PilotWebsearchConnectorContext {
  query: string
  timeoutMs: number
  maxResults: number
  crawlEnabled: boolean
  maxContentChars?: number
  allowlistDomains: string[]
  builtinSources: PilotBuiltinSourceRule[]
}

export interface PilotWebsearchConnector {
  search: (query: string, ctx: PilotWebsearchConnectorContext) => Promise<PilotWebsearchSearchHit[]>
  fetch: (hit: PilotWebsearchSearchHit, ctx: PilotWebsearchConnectorContext) => Promise<PilotWebsearchRawDocument | null>
  extract: (raw: PilotWebsearchRawDocument, ctx: PilotWebsearchConnectorContext) => Promise<PilotWebsearchNormalizedDocument | null>
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeDomain(value: unknown): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

function normalizeUrl(value: unknown): string {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  try {
    const parsed = new URL(text)
    parsed.hash = ''
    return parsed.toString()
  }
  catch {
    return ''
  }
}

function resolveDomainFromUrl(url: string): string {
  try {
    return normalizeDomain(new URL(url).hostname)
  }
  catch {
    return ''
  }
}

function normalizeScore(value: unknown): number | undefined {
  const score = Number(value)
  return Number.isFinite(score) ? score : undefined
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null)
  }
  catch {
    return 'null'
  }
}

function clipText(value: unknown, maxLength: number): string {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`
}

function toSha1(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function parseSearchList(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data
  }
  if (!data || typeof data !== 'object') {
    return []
  }
  const row = data as Record<string, unknown>
  const candidates = [
    row.results,
    row.hits,
    row.data,
    row.items,
    row.organic,
    row.web,
  ]
  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item
    }
  }
  return []
}

function matchBuiltinSourceRule(
  url: string,
  rules: PilotBuiltinSourceRule[],
): { sourceType?: string, sourceRuleId?: string } {
  const domain = resolveDomainFromUrl(url)
  if (!domain || !Array.isArray(rules) || rules.length <= 0) {
    return {}
  }
  for (const rule of rules) {
    if (rule.enabled === false) {
      continue
    }
    const matched = (rule.domains || []).some((item) => {
      const ruleDomain = normalizeDomain(item)
      if (!ruleDomain) {
        return false
      }
      return domain === ruleDomain || domain.endsWith(`.${ruleDomain}`)
    })
    if (!matched) {
      continue
    }
    return {
      sourceType: rule.type,
      sourceRuleId: rule.id,
    }
  }
  return {}
}

function normalizeSearchHit(
  value: unknown,
  sourceRules: PilotBuiltinSourceRule[],
): PilotWebsearchSearchHit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const row = value as Record<string, unknown>
  const url = normalizeUrl(row.url || row.link || row.href)
  if (!url) {
    return null
  }
  const domain = resolveDomainFromUrl(url) || normalizeDomain(row.domain)
  const sourceRule = matchBuiltinSourceRule(url, sourceRules)

  return {
    url,
    title: clipText(row.title || row.name || url, 240),
    snippet: clipText(row.snippet || row.summary || row.description || row.content || '', 600),
    domain,
    score: normalizeScore(row.score || row.rank),
    publishedAt: normalizeText(row.publishedAt || row.published_at || row.date) || undefined,
    sourceType: sourceRule.sourceType,
    sourceRuleId: sourceRule.sourceRuleId,
  }
}

function normalizeRawContent(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return ''
  }
  return safeJson(value)
}

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

function toHeaderRecord(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) {
    return undefined
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers as Record<string, string>
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const method = normalizeText(init.method || 'GET').toUpperCase()
    const networkMethod = (
      method === 'GET'
      || method === 'POST'
      || method === 'PUT'
      || method === 'PATCH'
      || method === 'DELETE'
      || method === 'HEAD'
      || method === 'OPTIONS'
    )
      ? method
      : 'GET'
    const response = await networkClient.request<unknown>({
      method: networkMethod,
      url,
      headers: toHeaderRecord(init.headers),
      body: init.body,
      signal: controller.signal,
      validateStatus: ALL_HTTP_STATUS,
    })
    if (response.status < 200 || response.status >= 300) {
      return {
        status: response.status,
        text: typeof response.data === 'string'
          ? response.data
          : safeJson(response.data),
      }
    }
    if (response.data === null || response.data === undefined) {
      return {}
    }
    return response.data
  }
  finally {
    clearTimeout(timer)
  }
}

async function fetchRawPageWithTimeout(url: string, timeoutMs: number): Promise<{ status: number, contentType: string, body: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const response = await networkClient.request<unknown>({
      method: 'GET',
      url,
      headers: {
        'user-agent': 'TuffPilot/1.0 (+websearch-crawler)',
        'accept': 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      validateStatus: ALL_HTTP_STATUS,
    })

    const headers = (response.headers || {}) as Record<string, string>
    const contentType = normalizeText(headers['content-type'] || headers['Content-Type']) || 'text/plain'
    const body = typeof response.data === 'string'
      ? response.data
      : safeJson(response.data)

    return {
      status: Number(response.status) || 0,
      contentType,
      body,
    }
  }
  finally {
    clearTimeout(timer)
  }
}

function stripHtml(content: string): string {
  if (!content) {
    return ''
  }
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRawDocument(
  source: unknown,
  fallbackHit: PilotWebsearchSearchHit,
  maxContentChars = 16_000,
): PilotWebsearchRawDocument {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      url: fallbackHit.url,
      title: fallbackHit.title,
      snippet: fallbackHit.snippet,
      content: fallbackHit.snippet,
      contentType: 'text/plain',
    }
  }

  const row = source as Record<string, unknown>
  const url = normalizeUrl(row.url || fallbackHit.url) || fallbackHit.url
  const title = clipText(row.title || fallbackHit.title || url, 240)
  const snippet = clipText(row.snippet || row.summary || fallbackHit.snippet || '', 600)
  const html = normalizeRawContent(row.html)
  const text = normalizeRawContent(row.text || row.content || row.body)
  const content = html ? stripHtml(html) : text

  return {
    url,
    title,
    snippet,
    content: clipText(content, maxContentChars),
    contentType: normalizeText(row.contentType || row.content_type || (html ? 'text/html' : 'text/plain')) || 'text/plain',
    statusCode: Number.isFinite(Number(row.statusCode || row.status_code || row.status))
      ? Number(row.statusCode || row.status_code || row.status)
      : undefined,
  }
}

function normalizeExtractedDocument(
  raw: PilotWebsearchRawDocument,
  rules: PilotBuiltinSourceRule[],
): PilotWebsearchNormalizedDocument | null {
  const url = normalizeUrl(raw.url)
  if (!url) {
    return null
  }

  const content = clipText(raw.content, 8_000)
  const sourceRule = matchBuiltinSourceRule(url, rules)
  return {
    url,
    title: clipText(raw.title || url, 240),
    snippet: clipText(raw.snippet || content, 600),
    content,
    domain: resolveDomainFromUrl(url),
    urlHash: toSha1(url),
    contentHash: toSha1(content || ''),
    sourceType: sourceRule.sourceType,
    sourceRuleId: sourceRule.sourceRuleId,
  }
}

async function fetchRawDocumentFromHit(
  hit: PilotWebsearchSearchHit,
  ctx: PilotWebsearchConnectorContext,
): Promise<PilotWebsearchRawDocument> {
  if (!ctx.crawlEnabled) {
    return {
      url: hit.url,
      title: hit.title,
      snippet: hit.snippet,
      content: hit.snippet,
      contentType: 'text/plain',
    }
  }

  const page = await fetchRawPageWithTimeout(hit.url, ctx.timeoutMs)
  const isHtml = page.contentType.toLowerCase().includes('html')
  const normalizedContent = isHtml
    ? stripHtml(page.body)
    : normalizeRawContent(page.body)

  return {
    url: hit.url,
    title: hit.title,
    snippet: hit.snippet,
    content: clipText(normalizedContent || hit.snippet, ctx.maxContentChars || 16_000),
    contentType: page.contentType,
    statusCode: page.status,
  }
}

export function dedupeNormalizedDocuments(
  docs: PilotWebsearchNormalizedDocument[],
): PilotWebsearchNormalizedDocument[] {
  const map = new Map<string, PilotWebsearchNormalizedDocument>()
  for (const item of docs) {
    const key = `${item.urlHash}:${item.contentHash}`
    if (!map.has(key)) {
      map.set(key, item)
    }
  }
  return Array.from(map.values())
}

export function isAllowlistedDomain(domain: string, allowlistDomains: string[]): boolean {
  const normalized = normalizeDomain(domain)
  if (!normalized) {
    return false
  }
  return allowlistDomains.some((item) => {
    const target = normalizeDomain(item)
    if (!target) {
      return false
    }
    return normalized === target || normalized.endsWith(`.${target}`)
  })
}

export function createGatewayWebsearchConnector(input: {
  gatewayBaseUrl: string
  apiKey?: string
}): PilotWebsearchConnector {
  const baseUrl = normalizeText(input.gatewayBaseUrl).replace(/\/+$/, '')
  const apiKey = normalizeText(input.apiKey)

  return {
    async search(query, ctx) {
      if (!baseUrl) {
        return []
      }

      const payload = await fetchJsonWithTimeout(`${baseUrl}/search`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: safeJson({
          query,
          maxResults: ctx.maxResults,
          timeoutMs: ctx.timeoutMs,
        }),
      }, ctx.timeoutMs)

      const rows = parseSearchList(payload)
      const hits = rows
        .map(item => normalizeSearchHit(item, ctx.builtinSources))
        .filter((item): item is PilotWebsearchSearchHit => Boolean(item))

      return hits.slice(0, ctx.maxResults)
    },

    async fetch(hit, ctx) {
      if (!ctx.crawlEnabled || !baseUrl) {
        return {
          url: hit.url,
          title: hit.title,
          snippet: hit.snippet,
          content: hit.snippet,
          contentType: 'text/plain',
        }
      }

      const payload = await fetchJsonWithTimeout(`${baseUrl}/fetch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: safeJson({
          url: hit.url,
          timeoutMs: ctx.timeoutMs,
        }),
      }, ctx.timeoutMs)

      return normalizeRawDocument(payload, hit, ctx.maxContentChars || 16_000)
    },

    async extract(raw, ctx) {
      return normalizeExtractedDocument(raw, ctx.builtinSources)
    },
  }
}

function resolveProviderBaseUrl(type: PilotWebsearchProviderType, baseUrl: string): string {
  const normalized = normalizeText(baseUrl).replace(/\/+$/, '')
  if (normalized) {
    return normalized
  }
  if (type === 'sosearch') {
    return ''
  }
  if (type === 'serper') {
    return 'https://google.serper.dev'
  }
  if (type === 'tavily') {
    return 'https://api.tavily.com'
  }
  return ''
}

function resolveSoSearchEndpoint(baseUrl: string, query: string): string {
  const normalizedBase = resolveProviderBaseUrl('sosearch', baseUrl)
  if (!normalizedBase) {
    return ''
  }

  let endpoint = normalizedBase
  try {
    const parsedBase = new URL(normalizedBase)
    const normalizedPath = normalizeText(parsedBase.pathname).replace(/\/+$/, '')
    if (!normalizedPath.endsWith('/search')) {
      parsedBase.pathname = `${normalizedPath || ''}/search`
    }
    parsedBase.searchParams.set('q', query)
    return parsedBase.toString()
  }
  catch {
    if (!endpoint.endsWith('/search')) {
      endpoint = `${endpoint}/search`
    }
    const params = new URLSearchParams({
      q: query,
    })
    return `${endpoint}?${params.toString()}`
  }
}

function createSoSearchWebsearchConnector(input: {
  baseUrl: string
}): PilotWebsearchConnector {
  const baseUrl = resolveProviderBaseUrl('sosearch', input.baseUrl)

  return {
    async search(query, ctx) {
      const endpoint = resolveSoSearchEndpoint(baseUrl, query)
      if (!endpoint) {
        return []
      }

      const payload = await fetchJsonWithTimeout(endpoint, {
        method: 'GET',
      }, ctx.timeoutMs)

      const rows = parseSearchList(payload)
      const hits = rows
        .map(item => normalizeSearchHit(item, ctx.builtinSources))
        .filter((item): item is PilotWebsearchSearchHit => Boolean(item))

      return hits.slice(0, ctx.maxResults)
    },

    async fetch(hit, ctx) {
      return await fetchRawDocumentFromHit(hit, ctx)
    },

    async extract(raw, ctx) {
      return normalizeExtractedDocument(raw, ctx.builtinSources)
    },
  }
}

function createSearxngWebsearchConnector(input: {
  baseUrl: string
}): PilotWebsearchConnector {
  const baseUrl = resolveProviderBaseUrl('searxng', input.baseUrl)

  return {
    async search(query, ctx) {
      if (!baseUrl) {
        return []
      }
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        language: 'all',
      })
      const payload = await fetchJsonWithTimeout(`${baseUrl}/search?${params.toString()}`, {
        method: 'GET',
      }, ctx.timeoutMs)

      const rows = parseSearchList(payload)
      const hits = rows
        .map(item => normalizeSearchHit(item, ctx.builtinSources))
        .filter((item): item is PilotWebsearchSearchHit => Boolean(item))

      return hits.slice(0, ctx.maxResults)
    },

    async fetch(hit, ctx) {
      return await fetchRawDocumentFromHit(hit, ctx)
    },

    async extract(raw, ctx) {
      return normalizeExtractedDocument(raw, ctx.builtinSources)
    },
  }
}

function createSerperWebsearchConnector(input: {
  baseUrl: string
  apiKey?: string
}): PilotWebsearchConnector {
  const baseUrl = resolveProviderBaseUrl('serper', input.baseUrl)
  const apiKey = normalizeText(input.apiKey)

  return {
    async search(query, ctx) {
      if (!baseUrl || !apiKey) {
        return []
      }

      const payload = await fetchJsonWithTimeout(`${baseUrl}/search`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
        },
        body: safeJson({
          q: query,
          num: ctx.maxResults,
        }),
      }, ctx.timeoutMs)

      const rows = parseSearchList(payload)
      const hits = rows
        .map(item => normalizeSearchHit(item, ctx.builtinSources))
        .filter((item): item is PilotWebsearchSearchHit => Boolean(item))

      return hits.slice(0, ctx.maxResults)
    },

    async fetch(hit, ctx) {
      return await fetchRawDocumentFromHit(hit, ctx)
    },

    async extract(raw, ctx) {
      return normalizeExtractedDocument(raw, ctx.builtinSources)
    },
  }
}

function createTavilyWebsearchConnector(input: {
  baseUrl: string
  apiKey?: string
}): PilotWebsearchConnector {
  const baseUrl = resolveProviderBaseUrl('tavily', input.baseUrl)
  const apiKey = normalizeText(input.apiKey)
  const rawContentByUrl = new Map<string, string>()

  return {
    async search(query, ctx) {
      if (!baseUrl || !apiKey) {
        return []
      }

      const payload = await fetchJsonWithTimeout(`${baseUrl}/search`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: safeJson({
          api_key: apiKey,
          query,
          max_results: ctx.maxResults,
          include_answer: false,
          include_images: false,
          include_raw_content: true,
        }),
      }, ctx.timeoutMs)

      const rows = parseSearchList(payload)
      const hits = rows
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null
          }
          const row = item as Record<string, unknown>
          const url = normalizeUrl(row.url)
          if (!url) {
            return null
          }
          const rawContent = normalizeText(row.raw_content)
          if (rawContent) {
            rawContentByUrl.set(url, rawContent)
          }
          return normalizeSearchHit({
            url,
            title: row.title,
            snippet: row.content || row.snippet || row.summary,
            score: row.score,
            publishedAt: row.published_date,
          }, ctx.builtinSources)
        })
        .filter((item): item is PilotWebsearchSearchHit => Boolean(item))

      return hits.slice(0, ctx.maxResults)
    },

    async fetch(hit, ctx) {
      const cachedRaw = normalizeText(rawContentByUrl.get(hit.url))
      if (cachedRaw) {
        return {
          url: hit.url,
          title: hit.title,
          snippet: hit.snippet,
          content: clipText(cachedRaw, ctx.maxContentChars || 16_000),
          contentType: 'text/plain',
        }
      }
      return await fetchRawDocumentFromHit(hit, ctx)
    },

    async extract(raw, ctx) {
      return normalizeExtractedDocument(raw, ctx.builtinSources)
    },
  }
}

export function createWebsearchProviderConnector(input: {
  providerType: PilotWebsearchProviderType
  baseUrl: string
  apiKey?: string
}): PilotWebsearchConnector {
  if (input.providerType === 'sosearch') {
    return createSoSearchWebsearchConnector({
      baseUrl: input.baseUrl,
    })
  }
  if (input.providerType === 'serper') {
    return createSerperWebsearchConnector({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
    })
  }
  if (input.providerType === 'tavily') {
    return createTavilyWebsearchConnector({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
    })
  }
  return createSearxngWebsearchConnector({
    baseUrl: input.baseUrl,
  })
}
