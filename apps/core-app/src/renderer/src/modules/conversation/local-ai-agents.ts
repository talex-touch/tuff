import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'

/**
 * The local agent CLIs a project can be opened in, as the project menu's 「在本机代理中打开」
 * submenu lists them: every CLI the main process knows, in its registry order, each either
 * choosable or carrying the reason it is not.
 *
 * A choice is choosable exactly when the omni panel will keep it selected. LocalAiCliPanel's
 * `runnableProviders` is installed + enabled + `taskRead`; offering anything wider would let the
 * panel quietly swap in the default agent, which is the opposite of what the user just picked.
 */

/** Why an agent cannot be picked right now. */
export type LocalAiAgentBlocker = 'not-installed' | 'turned-off' | 'unsupported'

export interface LocalAiAgentChoice {
  id: LocalAiCliProviderId
  /** The CLI's own name as the main process reports it (Claude Code, Codex…): a brand, not copy. */
  label: string
  /** `null` when the agent can take a task in this project now. */
  blocker: LocalAiAgentBlocker | null
}

/**
 * Where the submenu stands:
 * - `loading` — no answer yet;
 * - `ready` — the choices are known (some may be blocked);
 * - `none` — this build offers no local agents (the beta gate) or reported none;
 * - `failed` — the read failed with nothing earlier to keep showing.
 */
export type LocalAiAgentsPhase = 'loading' | 'ready' | 'none' | 'failed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A usable status reply. The channel resolves an error reply as `undefined` rather than rejecting
 * (see `stores/projects.ts`), so the shape is checked before anything reads it.
 */
export function isLocalAiCliStatus(value: unknown): value is LocalAiCliStatus {
  return (
    isRecord(value) && typeof value.betaAvailable === 'boolean' && Array.isArray(value.providers)
  )
}

function isProviderStatus(value: unknown): value is LocalAiCliProviderStatus {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.installed === 'boolean' &&
    typeof value.enabled === 'boolean' &&
    isRecord(value.capabilities)
  )
}

export function localAiAgentBlocker(
  provider: LocalAiCliProviderStatus
): LocalAiAgentBlocker | null {
  if (!provider.installed) return 'not-installed'
  if (!provider.enabled) return 'turned-off'
  if (provider.capabilities.taskRead !== true) return 'unsupported'
  return null
}

/**
 * The submenu's rows. Empty when the build has no local agents at all: the beta gate reports
 * every CLI as not installed, and listing four "not installed" rows would send the user off to
 * install something that still could not run.
 */
export function localAiAgentChoices(status: LocalAiCliStatus): LocalAiAgentChoice[] {
  if (!status.betaAvailable) return []
  return status.providers.filter(isProviderStatus).map((provider) => ({
    id: provider.id,
    label: provider.label,
    blocker: localAiAgentBlocker(provider)
  }))
}
