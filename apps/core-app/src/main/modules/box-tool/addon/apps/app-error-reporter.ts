import { operationalErrorService } from '../../../observability'

export interface AppScanError {
  platform: NodeJS.Platform
  path: string
  message: string
  timestamp: number
  cause?: unknown
}

export function reportAppScanError(error: AppScanError): void {
  operationalErrorService.report({
    domain: 'app-index',
    operation: 'platform-scan',
    error: error.cause ?? new Error(error.message),
    code: 'APP_SCAN_FAILED',
    userImpact: 'degraded',
    context: { platform: error.platform }
  })
}
