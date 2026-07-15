import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { createProtectedRegister } from '../modules/permission'
import { selectionCaptureService } from '../modules/system/selection-capture'

const SELECTION_CAPTURE_PERMISSION = {
  permissionId: 'clipboard.read',
  failClosedForPlugin: true,
  requireVerifiedPlugin: true,
  unavailableCode: 'SELECTION_CAPTURE_PERMISSION_UNAVAILABLE',
  deniedCode: 'SELECTION_CAPTURE_PERMISSION_DENIED',
  sdkMismatchCode: 'SDKAPI_MISMATCH'
} as const

export function registerSystemSelectionCaptureHandlers(
  transport: ITuffTransportMain
): Array<() => void> {
  const registerProtected = createProtectedRegister(transport)

  return [
    registerProtected(AppEvents.system.captureSelection, SELECTION_CAPTURE_PERMISSION, async () => {
      return await selectionCaptureService.capture({ enabled: true })
    })
  ]
}
