import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { ProtectedChannelOptions, ProtectedHandler } from '../modules/permission/channel-guard'
import { withPermission } from '../modules/permission/channel-guard'

export type ApiResponse<T = undefined> = { ok: true; result?: T } | { ok: false; error: string }

export type OpResponse<T extends Record<string, unknown> = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: string }

export type MainHandler<TReq, TRes> = (
  payload: TReq,
  context: HandlerContext
) => TRes | Promise<TRes>

export interface SafeHandlerOptions<TReq = unknown> {
  onError?: (error: unknown, payload: TReq, context: HandlerContext) => void
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function safeApiHandler<TReq, TRes>(
  handler: MainHandler<TReq, TRes>,
  options: SafeHandlerOptions<TReq> = {}
): MainHandler<TReq, ApiResponse<TRes>> {
  return async (payload: TReq, context: HandlerContext) => {
    try {
      const result = await handler(payload, context)
      return { ok: true, result }
    } catch (error) {
      options.onError?.(error, payload, context)
      return { ok: false, error: toErrorMessage(error) }
    }
  }
}

export function safeOpHandler<TReq, TExtra extends Record<string, unknown> = Record<string, never>>(
  handler: MainHandler<TReq, void | TExtra>,
  options: SafeHandlerOptions<TReq> = {}
): MainHandler<TReq, OpResponse<TExtra>> {
  return async (payload: TReq, context: HandlerContext) => {
    try {
      const result = await handler(payload, context)
      if (result && typeof result === 'object') {
        return {
          success: true,
          ...(result as TExtra)
        }
      }
      return { success: true }
    } catch (error) {
      options.onError?.(error, payload, context)
      return { success: false, error: toErrorMessage(error) }
    }
  }
}

export function withPermissionSafeApi<TReq, TRes>(
  permission: ProtectedChannelOptions,
  handler: ProtectedHandler<TReq, TRes>,
  options: SafeHandlerOptions<TReq> = {}
): ProtectedHandler<TReq, ApiResponse<TRes>> {
  return safeApiHandler(withPermission(permission, handler), options)
}
