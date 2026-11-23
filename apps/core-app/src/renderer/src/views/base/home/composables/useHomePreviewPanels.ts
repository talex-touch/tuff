import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { useCodePreviewTabs } from '~/modules/conversation/useCodePreviewTabs'
import { useProjectStore } from '~/stores/projects'
import { useFileLinkClick } from './useFileLinkClick'

export interface UseHomePreviewPanelsOptions {
  conversationId: Ref<string | null>
  projectId: Ref<string | null>
  bodyRef: Ref<HTMLElement | null>
}

/**
 * Owns Home's right-hand workspace side panel, code-preview tabs, active project lookup, and
 * click-to-open file preview drawer.
 */
export function useHomePreviewPanels(options: UseHomePreviewPanelsOptions) {
  const panelOpen = ref(false)
  const panelTab = ref('outputs')

  const {
    tabs: codeTabs,
    activeId: activeCodeTabId,
    open: openCodeTab,
    select: selectCodeTab,
    close: closeCodeTab
  } = useCodePreviewTabs(options.conversationId)

  function showCodePreview(preview: StreamMarkdownCodePreview): void {
    openCodeTab(preview)
    panelTab.value = 'preview'
    panelOpen.value = true
  }

  const fileDrawerVisible = ref(false)
  const previewFilePath = ref('')
  const previewDisplayPath = ref('')

  const projectStore = useProjectStore()
  const currentProject = computed(() =>
    options.projectId.value
      ? (projectStore.projects.find((p) => p.id === options.projectId.value) ?? null)
      : null
  )

  useFileLinkClick({
    container: options.bodyRef,
    projectRoot: computed(() => currentProject.value?.rootPath),
    onOpenRight: ({ absolutePath, displayPath }) => {
      previewFilePath.value = absolutePath
      previewDisplayPath.value = displayPath
      fileDrawerVisible.value = true
    }
  })

  return {
    panelOpen,
    panelTab,
    codeTabs,
    activeCodeTabId,
    selectCodeTab,
    closeCodeTab,
    showCodePreview,
    fileDrawerVisible,
    previewFilePath,
    previewDisplayPath,
    projectStore,
    currentProject
  }
}
