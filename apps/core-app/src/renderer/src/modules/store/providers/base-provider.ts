import type {
  StoreHttpRequestOptions,
  StoreHttpResponse,
  StorePlugin,
  StoreProviderDefinition,
  StoreProviderListOptions,
  StoreProviderTrustLevel
} from '@talex-touch/utils/store'
import { storeHttpRequest } from '../store-http-client'

const STORE_HTTP_SLOW_MS = 2_000

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

export interface StoreProviderContext {
  request: <T = unknown>(options: StoreHttpRequestOptions) => Promise<StoreHttpResponse<T>>
  logger?: Console
}

export abstract class BaseStoreProvider {
  protected readonly definition: StoreProviderDefinition
  protected readonly ctx: StoreProviderContext

  constructor(definition: StoreProviderDefinition, ctx: StoreProviderContext) {
    this.definition = definition
    this.ctx = ctx
  }

  get id(): string {
    return this.definition.id
  }

  get trustLevel(): StoreProviderTrustLevel {
    return this.definition.trustLevel ?? 'unverified'
  }

  protected get isTrusted(): boolean {
    return this.trustLevel === 'official' || this.trustLevel === 'verified'
  }

  protected async request<T = unknown>(
    options: StoreHttpRequestOptions
  ): Promise<StoreHttpResponse<T>> {
    const startedAt = getNowMs()
    try {
      const response = this.ctx.request
        ? await this.ctx.request<T>(options)
        : await storeHttpRequest<T>(options)
      this.reportSlowRequest(options, startedAt)
      return response
    } catch (error) {
      this.reportSlowRequest(options, startedAt, error)
      throw error
    }
  }

  private reportSlowRequest(
    options: StoreHttpRequestOptions,
    startedAt: number,
    error?: unknown
  ): void {
    const durationMs = getNowMs() - startedAt
    if (durationMs < STORE_HTTP_SLOW_MS) {
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
      `[Store][provider][slow] "${this.id}" ${method} ${url ?? ''} took ${durationMs.toFixed(1)}ms`,
      meta
    )
  }

  abstract list(options: StoreProviderListOptions): Promise<StorePlugin[]>
}
