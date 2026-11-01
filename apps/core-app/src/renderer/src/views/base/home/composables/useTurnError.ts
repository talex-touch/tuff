import { isIntelligenceErrorCode } from '@talex-touch/utils/transport/events/types'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { ConversationError } from '~/modules/conversation/conversation-error-display'
import {
  CONVERSATION_ERROR_PROVIDER_UNAVAILABLE,
  CONVERSATION_ERROR_USAGE_LIMIT_REACHED
} from '~/modules/conversation/conversation-error-display'
import { useTurnFailureWording } from '~/modules/conversation/useTurnFailureWording'
import type { IntelligenceErrorRecovery } from '~/modules/intelligence/ai-error-recovery'
import {
  resolveIntelligenceErrorRecovery,
  USAGE_LIMITS_ROUTE
} from '~/modules/intelligence/ai-error-recovery'

/**
 * How a failed turn reads and where it leads: the advice, the report line, the usage-limit
 * variant, and the two ways out (limits page, provider settings) that replace a useless retry.
 */
export function useTurnError() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { classifyTurnFailure, resolveErrorTitle } = useTurnFailureWording()

  /**
   * What to do about a failure the intelligence layer named. Not for a provider's own text, passed on
   * as thrown or named `UNKNOWN`: it can say "quota" about the provider's plan, where the advice is
   * about Nexus credits.
   */
  function resolveErrorAdvice(error: ConversationError | undefined): string {
    if (!error || !isIntelligenceErrorCode(error.code) || error.code === 'UNKNOWN') return ''
    const recovery = classifyTurnFailure(error)
    return recovery && recovery.code !== 'provider' ? recovery.detail : ''
  }

  function resolveErrorReportCode(error: { code?: string } | undefined): string {
    const code = error?.code?.trim()
    return code || 'UNKNOWN_ERROR'
  }

  function resolveErrorReportDetail(error: { detail?: string } | undefined): string {
    const detail = error?.detail?.trim()
    return detail || t('home.error.noDetail')
  }

  /**
   * A turn the usage limit refused, read as the user's own limit rather than a fault: its own title,
   * the reset time in local words instead of main's English sentence, and the way to the limits in
   * place of a retry that would only be refused again until then.
   */
  function resolveUsageLimitFailure(
    error: { code: string; detail: string } | undefined
  ): IntelligenceErrorRecovery | null {
    if (error?.code !== CONVERSATION_ERROR_USAGE_LIMIT_REACHED) return null
    return resolveIntelligenceErrorRecovery(
      { errorCode: error.code, error: error.detail },
      t,
      locale.value
    )
  }

  function openUsageLimits(): void {
    void router.push(USAGE_LIMITS_ROUTE)
  }

  /**
   * Retrying a missing provider reruns the same failure forever, so that one case swaps the retry for
   * a way out. `/setting/intelligence/channels` is where a provider is actually enabled — the
   * intelligence settings page only cross-links to it. Its credentials are fixed there too.
   */
  function isProviderUnavailable(error: ConversationError | undefined): boolean {
    const code = error?.code
    if (
      code === CONVERSATION_ERROR_PROVIDER_UNAVAILABLE ||
      code === 'WORKSPACE_PROVIDER_UNAVAILABLE'
    )
      return true
    const kind = classifyTurnFailure(error)?.code
    return kind === 'provider' || kind === 'credentials'
  }

  function openProviderSettings(): void {
    void router.push('/setting/intelligence/channels')
  }

  return {
    resolveErrorTitle,
    resolveErrorAdvice,
    resolveErrorReportCode,
    resolveErrorReportDetail,
    resolveUsageLimitFailure,
    openUsageLimits,
    isProviderUnavailable,
    openProviderSettings
  }
}
