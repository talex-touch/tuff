export interface SystemTranslationInvocationOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

export interface SystemTranslationStatus {
  supported: boolean
  ready: boolean
  installedLanguages: string[]
  reason?: string
}

export interface SystemTranslationPayload {
  text: string
  sourceLang?: string
  targetLang: string
}

export interface SystemTranslationResult {
  text: string
  sourceLang: string
  targetLang: string
  durationMs: number
}

/** Probes actual installed TranslationSession readiness; never downloads language assets. */
export function getSystemTranslationStatus(options?: SystemTranslationInvocationOptions): Promise<SystemTranslationStatus>
/** False until a status probe finds a ready language pair on macOS 26 or newer. */
export function isSystemTranslationAvailable(): boolean
export function translateSystemText(payload: SystemTranslationPayload, options?: SystemTranslationInvocationOptions): Promise<SystemTranslationResult>
/** Reclaims the owned helper and rejects pending requests; the next call can start a fresh helper. */
export function closeSystemTranslation(): void
