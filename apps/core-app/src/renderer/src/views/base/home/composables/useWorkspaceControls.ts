import type { ConversationWorkspaceMode } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { ComputedRef, Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { createLatestOnly } from '~/modules/conversation/latest-only'
import type { UseAgentWorkspaceReturn } from '~/modules/conversation/useAgentWorkspace'
import type { UseConversationHistoryReturn } from '~/modules/conversation/useConversationHistory'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'

export interface BranchRequest {
  messageId?: string
  mode?: ConversationWorkspaceMode
  profileId?: string
}

export interface WorkspaceControlsOptions {
  /** Main's workspace behind the page: settings, profiles, draft state and the fork request. */
  workspace: UseAgentWorkspaceReturn
  messages: ComputedRef<ConversationMessage[]>
  conversationId: Ref<string | null>
  history: Pick<UseConversationHistoryReturn, 'refresh'>
  onSubmitError: (error: unknown) => void
}

/**
 * Chat and Agent are different execution authorities, and a thread can branch into the other one:
 * the mode menu, the profile choice and the branch-from-here action all live here, on top of the
 * Main-owned workspace.
 */
export function useWorkspaceControls(options: WorkspaceControlsOptions) {
  const { workspace, messages, conversationId } = options
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()

  const hasHistory = computed(() => messages.value.length > 0)

  /** Where the first user message sits: anything before it is the Home opening, not a reply. */
  const firstUserIndex = computed(() =>
    messages.value.findIndex((message) => message.role === 'user')
  )

  /** Profiles are read when Agent mode is in view; the menu reads them again on every open. */
  watch(
    () => workspace.settings.value.mode,
    (mode) => {
      if (mode === 'agent') void workspace.loadProfiles()
    },
    { immediate: true }
  )

  /** The first enabled profile, as the orchestrator lists them — the menu shows which one it is. */
  function firstEnabledProfileId(): string | undefined {
    return workspace.profiles.value.find((profile) => profile.enabled)?.id
  }

  /** A blank Agent Home starts on a real enabled profile once the list is known, never a placeholder. */
  watch(
    () => [workspace.profiles.value, workspace.settings.value.mode] as const,
    ([, mode]) => {
      if (workspace.state.value || mode !== 'agent' || workspace.settings.value.profileId) return
      const fallback = firstEnabledProfileId()
      if (fallback) workspace.setDraftProfile(fallback)
    }
  )

  const branching = ref(false)
  /**
   * The branch request that may still move the page. A newer branch, or the reader opening another
   * thread meanwhile, takes that right away: a branch that lands late is announced, never navigated to.
   */
  const branchSequence = createLatestOnly()

  async function branchTo(request: BranchRequest): Promise<void> {
    const origin = conversationId.value
    if (!origin || branching.value) return
    const ownsNavigation = branchSequence.claim()
    branching.value = true
    try {
      const child = await workspace.fork(request)
      void options.history.refresh()
      if (ownsNavigation() && conversationId.value === origin && route.params.id === origin) {
        await router.push(`/home/c/${child}`)
      } else {
        toast.success(t('home.workspace.fork.createdElsewhere'))
      }
    } catch (error) {
      options.onSubmitError(error)
    } finally {
      branching.value = false
    }
  }

  /** A finished reply after the opening can anchor a branch; one still running cannot. */
  function canBranchFrom(message: ConversationMessage, index: number): boolean {
    return (
      message.role === 'assistant' &&
      message.status === 'complete' &&
      firstUserIndex.value !== -1 &&
      index > firstUserIndex.value &&
      !workspace.busy.value
    )
  }

  /**
   * Chat and Agent are different execution authorities. A thread with history keeps its own and the
   * switch continues in a new branch; an empty one, or a blank Home, just changes what it will run as.
   */
  function selectMode(mode: ConversationWorkspaceMode): void {
    if (!workspace.state.value) {
      workspace.setDraftMode(mode)
      return
    }
    if (hasHistory.value) {
      void branchTo({ mode })
      return
    }
    void workspace.configure({
      mode,
      profileId:
        mode === 'agent'
          ? (workspace.settings.value.profileId ?? firstEnabledProfileId())
          : undefined
    })
  }

  function selectProfile(profileId: string): void {
    if (!workspace.state.value) workspace.setDraftProfile(profileId)
    else void workspace.configure({ profileId })
  }

  /**
   * The mode menu lists profiles, not modes: picking one is picking Agent mode with that profile. Within
   * Agent it is a profile change; from Chat it is a mode change, which a thread with history takes as a
   * branch. Main applies the requested profile only to the child, leaving this thread unchanged.
   */
  function selectAgentProfile(profileId: string): void {
    const current = workspace.settings.value
    if (current.mode === 'agent') {
      if (current.profileId !== profileId) selectProfile(profileId)
      return
    }
    if (!workspace.state.value) {
      workspace.setDraftProfile(profileId)
      workspace.setDraftMode('agent')
      return
    }
    if (!hasHistory.value) {
      void workspace.configure({ mode: 'agent', profileId })
      return
    }
    void branchTo({ mode: 'agent', profileId })
  }

  /** The waiting run's profile by name, when the list has it; the card falls back to its id. */
  const pendingRunProfileName = computed(() => {
    const profileId = workspace.state.value?.pendingRun?.profileId
    return workspace.profiles.value.find((profile) => profile.id === profileId)?.name
  })

  return {
    hasHistory,
    branching,
    branchTo,
    canBranchFrom,
    selectMode,
    selectAgentProfile,
    pendingRunProfileName
  }
}
