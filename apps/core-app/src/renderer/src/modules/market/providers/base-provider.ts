import type {
  MarketHttpRequestOptions,
  MarketHttpResponse,
  MarketPlugin,
  MarketProviderDefinition,
  MarketProviderListOptions,
  MarketProviderTrustLevel
} from '@talex-touch/utils/market'
import { marketHttpRequest } from '../market-http-client'

const MARKET_HTTP_SLOW_MS = 2_000

function getNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function sanitizeUrl(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return undefined
  }

  try {
    const parsed = new URL(input)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return input.split('?')[0]?.split('#')[0]
  }
}

export interface MarketProviderContext {
  request: <T = unknown>(options: MarketHttpRequestOptions) => Promise<MarketHttpResponse<T>>
  logger?: Console
}

export abstract class BaseMarketProvider {
  protected readonly definition: MarketProviderDefinition
  protected readonly ctx: MarketProviderContext

  constructor(definition: MarketProviderDefinition, ctx: MarketProviderContext) {
    this.definition = definition
    this.ctx = ctx
  }

  get id(): string {
    return this.definition.id
  }

  get trustLevel(): MarketProviderTrustLevel {
    return this.definition.trustLevel ?? 'unverified'
  }

  protected get isTrusted(): boolean {
    return this.trustLevel === 'official' || this.trustLevel === 'verified'
  }

  protected async request<T = unknown>(
    options: MarketHttpRequestOptions
  ): Promise<MarketHttpResponse<T>> {
    const startedAt = getNowMs()
    try {
      const response = this.ctx.request
        ? await this.ctx.request<T>(options)
        : await marketHttpRequest<T>(options)
      this.reportSlowRequest(options, startedAt)
      return response
    } catch (error) {
      this.reportSlowRequest(options, startedAt, error)
      throw error
    }
  }

  private reportSlowRequest(
    options: MarketHttpRequestOptions,
    startedAt: number,
    error?: unknown
  ): void {
    const durationMs = getNowMs() - startedAt
    if (durationMs < MARKET_HTTP_SLOW_MS) {
      return
    }

    const method = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET'
    const url = sanitizeUrl(options?.url)
    const errorMessage = error instanceof Error ? error.message : undefined
    const logger = this.ctx.logger ?? console

    const meta: Record<string, unknown> = {
      providerId: this.id,
      providerType: this.definition.type,
      method,
      url,
      durationMs: Number(durationMs.toFixed(1))
    }

    if (errorMessage) {
      meta.errorMessage = errorMessage
    }

    logger.warn(
      `[Market][provider][slow] "${this.id}" ${method} ${url ?? ''} took ${durationMs.toFixed(1)}ms`,
      meta
    )
  }

  abstract list(options: MarketProviderListOptions): Promise<MarketPlugin[]>
}
