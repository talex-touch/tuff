import type {
  BundledReleaseNotesEntry,
  ReleaseNotesEntry,
  ReleaseNotesPage,
  UpdateReleaseNotesChannel
} from '@talex-touch/utils'
import { useUpdateSdk } from '@talex-touch/utils/renderer'
import { readonly, ref, shallowRef } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { resolveReleaseNotesStartupDecision } from '../update/release-notes-display'

const releaseNotesLog = createRendererLogger('useReleaseNotesRuntime')
const dialogVisibleState = ref(false)
const dialogEntriesState = shallowRef<BundledReleaseNotesEntry[]>([])
const bundledEntriesState = shallowRef<BundledReleaseNotesEntry[]>([])
const currentVersionState = ref('')
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
      bundledEntriesState.value = response.data.catalog.entries
      currentVersionState.value = response.data.catalog.generatedForVersion
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

  async function listReleaseNotes(input: {
    channel: UpdateReleaseNotesChannel
    cursor?: string
    limit?: number
  }): Promise<ReleaseNotesPage> {
    const response = await updateSdk.listReleaseNotes(input)
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Release notes history is unavailable')
    }
    return response.data
  }

  async function getReleaseNotes(tag: string): Promise<ReleaseNotesEntry> {
    const bundled = bundledEntriesState.value.find(
      (entry) => entry.tag === tag && entry.currentNotes
    )
    if (bundled?.currentNotes) {
      return {
        tag: bundled.tag,
        version: bundled.version,
        name: bundled.tag,
        channel: bundled.channel,
        notes: bundled.currentNotes,
        publishedAt: '',
        legacy: false
      }
    }

    const response = await updateSdk.getReleaseNotes({ tag })
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Release notes are unavailable')
    }
    return response.data
  }

  return {
    dialogVisible: dialogVisibleState,
    dialogEntries: readonly(dialogEntriesState),
    dialogVersion: readonly(dialogVersionState),
    currentVersion: readonly(currentVersionState),
    evaluateStartup,
    acknowledge,
    closeDialog,
    listReleaseNotes,
    getReleaseNotes
  }
}
