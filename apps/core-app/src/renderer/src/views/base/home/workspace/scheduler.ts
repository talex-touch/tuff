import type { ConversationWorkspaceMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'

/**
 * The scheduler (`调度器`) a Home send runs under: the built-in Tuff Pi coordinator or one of the
 * scanned CLI profiles. Shared by the scheduler row inside the model menu and the composer's model
 * pill, which shows the scheduler's short name in front of the model.
 */

/** The built-in coordinator's profile id when the orchestrator has not listed one yet. */
export const DEFAULT_COORDINATOR_ID = 'default-pi'

export function findCoordinator(profiles: readonly AiAgentProfile[]): AiAgentProfile | undefined {
  return profiles.find(
    (profile) =>
      profile.id === DEFAULT_COORDINATOR_ID ||
      profile.id === 'tuff-pi' ||
      profile.name.includes('Coordinator')
  )
}

export function coordinatorIdOf(profiles: readonly AiAgentProfile[]): string {
  return findCoordinator(profiles)?.id ?? DEFAULT_COORDINATOR_ID
}

/** A conversation with no profile, or not in Agent mode, runs under the coordinator. */
export function isCoordinatorSelected(
  mode: ConversationWorkspaceMode,
  profileId: string | undefined,
  profiles: readonly AiAgentProfile[]
): boolean {
  if (mode !== 'agent') return true
  return !profileId || profileId === coordinatorIdOf(profiles)
}

/** 「Tuff Pi Coordinator」 → 「Tuff Pi」: the role is already said by where the name sits. */
export function schedulerShortName(name: string): string {
  const short = name.replace(/\s*coordinator\s*$/i, '').trim()
  return short || name
}

/** The short name of the scheduler the next send runs under, or `fallback` before profiles load. */
export function selectedSchedulerName(
  mode: ConversationWorkspaceMode,
  profileId: string | undefined,
  profiles: readonly AiAgentProfile[],
  fallback: string
): string {
  if (isCoordinatorSelected(mode, profileId, profiles)) {
    const coordinator = findCoordinator(profiles)
    return coordinator ? schedulerShortName(coordinator.name) : fallback
  }
  const profile = profiles.find((item) => item.id === profileId)
  return profile ? schedulerShortName(profile.name) : fallback
}
