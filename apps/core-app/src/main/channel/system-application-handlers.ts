import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  ResolveApplicationRequest,
  ResolvedApplication
} from '@talex-touch/utils/transport/events/types'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { appProvider } from '../modules/box-tool/addon/apps/app-provider'
import { createProtectedRegister } from '../modules/permission'

const APPLICATION_RESOLUTION_PERMISSION = {
  permissionId: 'system.applications',
  failClosedForPlugin: true,
  requireVerifiedPlugin: true,
  unavailableCode: 'APPLICATION_RESOLUTION_PERMISSION_UNAVAILABLE',
  deniedCode: 'APPLICATION_RESOLUTION_PERMISSION_DENIED',
  sdkMismatchCode: 'SDKAPI_MISMATCH'
} as const

export function registerSystemApplicationHandlers(
  transport: ITuffTransportMain
): Array<() => void> {
  const registerProtected = createProtectedRegister(transport)

  return [
    registerProtected<ResolveApplicationRequest, ResolvedApplication | null>(
      AppEvents.system.resolveApplication,
      APPLICATION_RESOLUTION_PERMISSION,
      async (payload) => {
        const identifier = typeof payload?.identifier === 'string' ? payload.identifier.trim() : ''
        if (!identifier || identifier.length > 512) {
          throw new Error('SYSTEM_APPLICATION_IDENTIFIER_INVALID')
        }
        return await appProvider.resolveApplication(identifier)
      }
    )
  ]
}
