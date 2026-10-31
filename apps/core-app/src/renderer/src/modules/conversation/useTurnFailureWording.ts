import type { ConversationError } from './conversation-error-display'
import { isIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { useI18n } from 'vue-i18n'
import {
  aiRunFailureKey,
  resolveIntelligenceErrorRecovery
} from '../intelligence/ai-error-recovery'
import {
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  CONVERSATION_ERROR_EXECUTION_FAILED,
  CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
} from './conversation-error-display'
import { AGENT_WORKSPACE_ERROR_CODES } from './useAgentWorkspace'

/** Main's own turn endings that have words under `home.workspace.error`. */
const WORKSPACE_TURN_ERRORS: ReadonlySet<string> = new Set([
  ...AGENT_WORKSPACE_ERROR_CODES,
  'WORKSPACE_TURN_INTERRUPTED'
])
const EMPTY_RESPONSE_ERRORS: ReadonlySet<string> = new Set([
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  'CONVERSATION_EMPTY_RESPONSE'
])

/** A reply stopped before it finished, by the reader or by the app closing; not a fault. */
export function isStoppedTurn(error: ConversationError | undefined): boolean {
  return error?.code === 'WORKSPACE_TURN_CANCELLED' || error?.code === 'AI_RUN_CANCELLED'
}

/**
 * How Home words a reply that ended without an answer. The failed reply in the conversation and its
 * row in the Activity tab read the same words.
 */
export function useTurnFailureWording() {
  const { t, locale } = useI18n()

  /**
   * The kind of failure the intelligence layer named, or a provider described in the text main
   * passed on as it was thrown (`WORKSPACE_EXECUTION_FAILED`). Null when its words name no kind.
   */
  function classifyTurnFailure(error: ConversationError | undefined) {
    if (!error) return null
    const caught = error.code === CONVERSATION_ERROR_EXECUTION_FAILED
    if (!caught && !isIntelligenceErrorCode(error.code)) return null
    const recovery = resolveIntelligenceErrorRecovery(
      caught ? { error: error.detail } : { errorCode: error.code, error: error.detail },
      t,
      locale.value
    )
    return recovery.code === 'unknown' ? null : recovery
  }

  /** What ended the reply, or null when there is nothing to say beyond that it failed. */
  function describeTurnFailure(error: ConversationError | undefined): string | null {
    const code = error?.code ?? ''
    if (isStoppedTurn(error)) return t('home.error.stopped')
    if (code === CONVERSATION_ERROR_PROVIDER_UNAVAILABLE) return t('home.error.noProvider')
    if (EMPTY_RESPONSE_ERRORS.has(code)) return t('home.error.empty')
    if (WORKSPACE_TURN_ERRORS.has(code)) return t(`home.workspace.error.${code}`)
    const run = aiRunFailureKey(code)
    if (run && run !== 'failed') return t(`intelligence.runFailures.${run}`)
    const recovery = classifyTurnFailure(error)
    if (recovery?.code === 'provider') return t('home.error.noProvider')
    return recovery?.title ?? null
  }

  function resolveErrorTitle(error: ConversationError | undefined): string {
    return describeTurnFailure(error) ?? t('home.error.generic')
  }

  return { classifyTurnFailure, describeTurnFailure, resolveErrorTitle }
}
