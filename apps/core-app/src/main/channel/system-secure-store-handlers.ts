import type {
  SecureStoreHealthResponse,
  SecureValueGetRequest,
  SecureValueSetRequest
} from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { AppEvents } from '@talex-touch/utils/transport/events'
import {
  getSecureStoreHealth,
  getSecureStoreValue,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../utils/secure-store'
import type { LogOptions } from '../utils/logger'
import { toErrorMessage } from '../utils/safe-handler'

export interface SystemSecureStoreHandlerOptions {
  rootPath: () => string
  logger: { warn: (message: unknown, options?: LogOptions) => void }
}

function createWarnLogger(logger: SystemSecureStoreHandlerOptions['logger']) {
  return (message: string, error: unknown) => {
    logger.warn(`[CommonChannel] ${message}`, {
      error: toErrorMessage(error)
    })
  }
}

async function getSecureValue(
  rawKey: string,
  options: SystemSecureStoreHandlerOptions
): Promise<string | null> {
  const rootPath = options.rootPath()
  if (!isSecureStoreAvailable(rootPath)) {
    return null
  }

  return await getSecureStoreValue(rootPath, rawKey, createWarnLogger(options.logger))
}

async function setSecureValue(
  rawKey: string,
  value: string | null,
  options: SystemSecureStoreHandlerOptions
): Promise<void> {
  const rootPath = options.rootPath()
  if (!isSecureStoreAvailable(rootPath)) {
    throw new Error('Secure storage is unavailable')
  }

  const persisted = await setSecureStoreValue(
    rootPath,
    rawKey,
    value,
    createWarnLogger(options.logger)
  )
  if (!persisted) {
    throw new Error('Secure storage is unavailable')
  }
}

export function registerSystemSecureStoreHandlers(
  transport: ITuffTransportMain,
  options: SystemSecureStoreHandlerOptions
): Array<() => void> {
  return [
    transport.on<SecureValueGetRequest, string | null>(
      AppEvents.system.getSecureValue,
      async (payload) => {
        const key = typeof payload?.key === 'string' ? payload.key : ''
        if (!key) {
          return null
        }
        return await getSecureValue(key, options)
      }
    ),
    transport.on<SecureValueSetRequest, void>(AppEvents.system.setSecureValue, async (payload) => {
      const key = typeof payload?.key === 'string' ? payload.key : ''
      if (!key) {
        throw new Error('Missing secure storage key')
      }
      await setSecureValue(key, payload?.value ?? null, options)
    }),
    transport.on<void, SecureStoreHealthResponse>(AppEvents.system.getSecureStoreHealth, () =>
      getSecureStoreHealth(options.rootPath())
    )
  ]
}
