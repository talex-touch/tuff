/**
 * Usage ledger identifiers (audit rebuild parent design §1.2–§1.4).
 *
 * Import rule: the audit logger and the SDK import this file statically, so it must stay a leaf —
 * in particular nothing here may reach `../pricing/**` (see the header of `pricing/model-pricing.ts`).
 */

/**
 * Caller id of the global bucket in `intelligence_usage_stats`: every caller, callers missing
 * included, keyed by the main process's **local** day / month. The per-caller buckets keep their
 * UTC keys. Reads that list callers must exclude this id.
 */
export const GLOBAL_USAGE_CALLER_ID = '__global__'

/** Caller type of the global bucket row. `('__global__', 'system')` is the whole key. */
export const GLOBAL_USAGE_CALLER_TYPE = 'system' as const

/**
 * Outer governance rows: their token usage is the sum of the inner model calls, which are audited
 * on their own (`ai-cli-orchestrator`). They stay in the per-caller buckets, where they are the
 * only record of who started the run, but never in the global bucket or in usage breakdowns.
 */
export const OUTER_GOVERNANCE_CAPABILITIES = ['agent.run', 'workflow.execute'] as const

const OUTER_GOVERNANCE_CAPABILITY_SET: ReadonlySet<string> = new Set(OUTER_GOVERNANCE_CAPABILITIES)

export function isOuterGovernanceCapability(capabilityId: string): boolean {
  return OUTER_GOVERNANCE_CAPABILITY_SET.has(capabilityId)
}

/**
 * `system_config` key of the one-shot global backfill marker:
 * `{ version: 1, cutoffMs, cutoffId, status: 'pending' | 'done', completedAt }`.
 */
export const GLOBAL_BACKFILL_CONFIG_KEY = 'intelligence.usage.global-backfill'

/**
 * Attributed by main to a host Home turn that carries the Home surface marker and no caller. The
 * renderer must not send it: a Home-surface request with any caller is refused by the Pi native
 * session guard (`providers/pi-cli-provider.ts` `resolveHomeSessionContext`), which is what stops
 * a plugin from impersonating Home.
 */
export const HOME_CONVERSATION_CALLER = 'core.home.conversation'

/** Default caller of a host `ttsSpeak` request that names none. Plugins keep `plugin:<name>`. */
export const HOST_TTS_DEFAULT_CALLER = 'core.app.tts'

/** Default caller of a host `chatLangChain` request that names none. Plugins keep `plugin:<name>`. */
export const HOST_CHAT_DEFAULT_CALLER = 'core.app.chat'
