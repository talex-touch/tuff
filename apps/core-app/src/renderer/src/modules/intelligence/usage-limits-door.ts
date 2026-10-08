import type { ITuffTransport } from '@talex-touch/utils/transport'
import type {
  IntelligenceErrorRecovery,
  IntelligenceErrorRecoveryAction
} from './ai-error-recovery'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { USAGE_LIMITS_ROUTE } from './ai-error-recovery'

/**
 * The way out of a call the usage limit refused, for a surface with a renderer of its own — CoreBox's
 * AI answer, the selection panel. Such a surface cannot route the main window, so it is offered
 * only the one destination main opens for it: Audit, where the limits are set. Any other recovery
 * path stays text.
 */
export function resolveDetachedRecoveryAction(
  recovery: IntelligenceErrorRecovery | null | undefined
): IntelligenceErrorRecoveryAction | null {
  const action = recovery?.action
  return action?.path === USAGE_LIMITS_ROUTE ? action : null
}

/**
 * Asks main to reveal the main window on Audit (`AppEvents.window.openUsageLimits`). `false` when
 * it could not be shown — the window or its renderer was not there — and on a transport failure.
 */
export async function requestUsageLimitsPage(
  transport: Pick<ITuffTransport, 'send'>
): Promise<boolean> {
  try {
    return (await transport.send(AppEvents.window.openUsageLimits, undefined)) === true
  } catch {
    return false
  }
}
