export type QuitIntentKind =
  | 'user-normal'
  | 'update-now'
  | 'system-shutdown'
  | 'startup-failure'
  | 'duplicate-instance'
  | 'other'

export interface QuitIntent {
  kind: QuitIntentKind
  reason: string
  setAt: number
}

const INTENT_PRIORITY: Readonly<Record<QuitIntentKind, number>> = {
  other: 0,
  'user-normal': 1,
  'update-now': 2,
  'system-shutdown': 3,
  'startup-failure': 3,
  'duplicate-instance': 3
}

let currentIntent: QuitIntent | null = null

export function setQuitIntent(kind: QuitIntentKind, reason: string): QuitIntent {
  const nextIntent: QuitIntent = {
    kind,
    reason,
    setAt: Date.now()
  }

  if (!currentIntent || INTENT_PRIORITY[kind] >= INTENT_PRIORITY[currentIntent.kind]) {
    currentIntent = nextIntent
  }

  return currentIntent
}

export function ensureUserNormalQuitIntent(reason: string): QuitIntent {
  return currentIntent ?? setQuitIntent('user-normal', reason)
}

export function getQuitIntent(): QuitIntent | null {
  return currentIntent
}

export function resetQuitIntentForTest(): void {
  currentIntent = null
}
