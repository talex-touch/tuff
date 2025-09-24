export type AppScanError = {
  platform: NodeJS.Platform
  path: string
  message: string
  timestamp: number
}

type AppScanErrorHandler = (error: AppScanError) => void

let handler: AppScanErrorHandler | null = null

export const setAppScanErrorHandler = (nextHandler: AppScanErrorHandler | null): void => {
  handler = nextHandler
}

export const reportAppScanError = (error: AppScanError): void => {
  handler?.(error)
}
