export interface DesktopContextCapsule {
  selectionText?: string
  clipboardText?: string
  ocrText?: string
  appName?: string | null
  windowTitle?: string | null
  capturedAt: number
  source: string
}

export interface CreateDesktopContextCapsuleInput {
  selectionText?: string | null
  clipboardText?: string | null
  ocrText?: string | null
  appName?: string | null
  windowTitle?: string | null
  capturedAt?: number
  source: string
}

export function createDesktopContextCapsule(
  input: CreateDesktopContextCapsuleInput
): DesktopContextCapsule {
  return {
    selectionText: normalizeOptionalText(input.selectionText),
    clipboardText: normalizeOptionalText(input.clipboardText),
    ocrText: normalizeOptionalText(input.ocrText),
    appName: normalizeOptionalNullableText(input.appName),
    windowTitle: normalizeOptionalNullableText(input.windowTitle),
    capturedAt: input.capturedAt ?? Date.now(),
    source: input.source
  }
}

export function resolveDesktopContextInput(
  explicitText?: string | null,
  capsule?: DesktopContextCapsule
): string {
  return (
    normalizeOptionalText(explicitText) ||
    normalizeOptionalText(capsule?.selectionText) ||
    normalizeOptionalText(capsule?.clipboardText) ||
    normalizeOptionalText(capsule?.ocrText) ||
    ''
  )
}

export function summarizeDesktopContextCapsule(
  capsule?: DesktopContextCapsule
): { contextKinds: string[]; source?: string; capturedAt?: number } {
  const contextKinds: string[] = []
  if (capsule?.selectionText) contextKinds.push('selection')
  if (capsule?.clipboardText) contextKinds.push('clipboard')
  if (capsule?.ocrText) contextKinds.push('ocr')
  if (capsule?.appName || capsule?.windowTitle) contextKinds.push('activeApp')

  return {
    contextKinds,
    source: capsule?.source,
    capturedAt: capsule?.capturedAt
  }
}

function normalizeOptionalText(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function normalizeOptionalNullableText(value?: string | null): string | null | undefined {
  if (value === null) return null
  return normalizeOptionalText(value)
}
