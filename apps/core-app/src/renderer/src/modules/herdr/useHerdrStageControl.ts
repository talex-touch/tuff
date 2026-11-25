import { reactive, ref } from 'vue'

export type HerdrStageViewMode = 'chat' | 'terminal'

export interface HerdrStageControlHandle {
  address: string
  getViewMode: () => HerdrStageViewMode
  setViewMode: (mode: HerdrStageViewMode) => void
  isPanelOpen: () => boolean
  togglePanel: () => void
  refreshProjection: () => Promise<void>
  interrupt: () => Promise<void>
  kill: () => Promise<void>
}

const selectedModeByAddress = reactive<Record<string, HerdrStageViewMode>>({})
const activeHandle = ref<HerdrStageControlHandle | null>(null)

/**
 * Shared reactive bridge between `BrowserTabStrip` (Herdr tab right-click menu) and
 * `HerdrConversationStage` so all Herdr view/session/panel controls live on the tab menu
 * without duplicating a second top bar inside the stage.
 */
export function useHerdrStageControl() {
  function getSelectedMode(address: string): HerdrStageViewMode | null {
    return address ? (selectedModeByAddress[address] ?? null) : null
  }

  function setSelectedMode(address: string, mode: HerdrStageViewMode): void {
    if (!address) return
    selectedModeByAddress[address] = mode
    if (activeHandle.value?.address === address) {
      activeHandle.value.setViewMode(mode)
    }
  }

  function clearSelectedMode(address: string): void {
    if (!address) return
    delete selectedModeByAddress[address]
  }

  function registerActiveStage(handle: HerdrStageControlHandle): () => void {
    activeHandle.value = handle
    return () => {
      if (activeHandle.value === handle) {
        activeHandle.value = null
      }
    }
  }

  return {
    selectedModeByAddress,
    activeHandle,
    getSelectedMode,
    setSelectedMode,
    clearSelectedMode,
    registerActiveStage
  }
}

export function __resetHerdrStageControlForTesting(): void {
  activeHandle.value = null
  for (const key of Object.keys(selectedModeByAddress)) {
    delete selectedModeByAddress[key]
  }
}
