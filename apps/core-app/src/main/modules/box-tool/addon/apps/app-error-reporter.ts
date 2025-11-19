export interface AppScanError {
  platform: NodeJS.Platform
  path: string
  message: string
  timestamp: number
}

type AppScanErrorHandler = (error: AppScanError) => void

let handler: AppScanErrorHandler | null = null

export function setAppScanErrorHandler(nextHandler: AppScanErrorHandler | null): void {
  handler = nextHandler
}

export function reportAppScanError(error: AppScanError): void {
  handler?.(error)
}
