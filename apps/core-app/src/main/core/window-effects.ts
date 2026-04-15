export function shouldApplyMicaFallback(
  platform: NodeJS.Platform,
  isMicaWindow: boolean
): boolean {
  return platform === 'win32' && !isMicaWindow
}
