import { hasNavigator } from '../../env'

export async function writeClipboardText(text: string): Promise<boolean> {
  if (!text || !hasNavigator()) return false
  const clipboard = navigator?.clipboard
  if (!clipboard?.writeText) return false
  try {
    await clipboard.writeText(text)
    return true
  }
  catch {
    return false
  }
}
