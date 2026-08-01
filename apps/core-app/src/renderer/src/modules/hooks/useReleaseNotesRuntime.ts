import type { BundledReleaseNotesEntry } from '@talex-touch/utils'
import { useUpdateSdk } from '@talex-touch/utils/renderer'
import { readonly, ref, shallowRef } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { resolveReleaseNotesStartupDecision } from '../update/release-notes-display'

const releaseNotesLog = createRendererLogger('useReleaseNotesRuntime')
const dialogVisibleState = ref(false)
const dialogEntriesState = shallowRef<BundledReleaseNotesEntry[]>([])
const dialogVersionState = ref('')
let startupEvaluated = false

export function useReleaseNotesRuntime() {
  const updateSdk = useUpdateSdk()

  async function evaluateStartup(onboardingComplete: boolean): Promise<void> {
    if (startupEvaluated) return
    startupEvaluated = true

    try {
      const response = await updateSdk.getBundledReleaseNotes()
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Bundled release notes are unavailable')
      }
      const decision = resolveReleaseNotesStartupDecision({
        ...response.data,
        onboardingComplete
      })
      if (decision.kind === 'acknowledge') {
        await acknowledge(decision.version)
        return
      }
      if (decision.kind === 'show') {
        dialogEntriesState.value = decision.entries
        dialogVersionState.value = decision.version
        dialogVisibleState.value = true
      }
    } catch (error) {
      releaseNotesLog.warn('Failed to evaluate startup release notes', error)
    }
  }

  async function acknowledge(version = dialogVersionState.value): Promise<boolean> {
    if (!version) return false
    try {
      const response = await updateSdk.acknowledgeReleaseNotes({ version })
      if (!response.success) {
        throw new Error(response.error || 'Release notes acknowledgement failed')
      }
      return true
    } catch (error) {
      releaseNotesLog.warn('Failed to acknowledge release notes', error)
      return false
    }
  }

  async function closeDialog(): Promise<void> {
    const version = dialogVersionState.value
    dialogVisibleState.value = false
    await acknowledge(version)
  }

  return {
    dialogVisible: dialogVisibleState,
    dialogEntries: readonly(dialogEntriesState),
    evaluateStartup,
    acknowledge,
    closeDialog
  }
}
