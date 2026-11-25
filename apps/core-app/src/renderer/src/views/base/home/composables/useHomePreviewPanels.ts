import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import type { Ref } from 'vue'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { SidePanelWorkspaceKind } from './useHomeSidePanel'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { APP_SURFACE_ROUTES } from '../../../../../../shared/app-surface-routes'
import { isBetaFeatureEnabled } from '../../../../../../shared/beta-features'
import { buildBrowserFilePreviewUrl } from '~/modules/browser-workspace/preview-url'
import {
  attachBrowserTabToSpace,
  projectSpaceKey,
  setLastWorkspaceScope
} from '~/modules/layout/useShellWorkspaceTabs'
import { appSetting } from '~/modules/storage/app-storage'
import { useProjectStore } from '~/stores/projects'
import { useFileLinkClick } from './useFileLinkClick'
import { useHomeSidePanel } from './useHomeSidePanel'

export interface UseHomePreviewPanelsOptions {
  conversationId: Ref<string | null>
  projectId: Ref<string | null>
  workspaceRoot: Ref<string | undefined>
  messages: Ref<ConversationMessage[]>
  bodyRef: Ref<HTMLElement | null>
  getSidePanelAvailableWidth?: () => number | undefined
}

const URL_TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s"'`<>|]+/g
const ABS_PATH_PATTERN = /(?:\/[A-Za-z0-9._@+\-/]+|[A-Za-z]:\\[^\s"'`<>|]+)/g

function collectMentionedAbsolutePaths(messages: ConversationMessage[]): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const scan = (source: string) => {
    // Strip scheme URLs (e.g. https://example.com/login.html) before scanning so `//host/path`
    // is never misclassified as a local absolute filesystem path.
    const withoutUrls = source.replace(URL_TOKEN_PATTERN, ' ')
    for (const match of withoutUrls.matchAll(ABS_PATH_PATTERN)) {
      const candidate = match[0]
      if (!candidate || candidate.startsWith('//')) continue
      const cleaned = candidate.replace(/[.,;:!?)'"`\]}>]+$/, '')
      if (!cleaned || seen.has(cleaned)) continue
      seen.add(cleaned)
      found.push(cleaned)
    }
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!
    for (const part of message.parts ?? []) {
      if (part.type === 'tool-call') {
        scan(`${part.input ?? ''}\n${part.output ?? ''}`)
      } else if (part.type === 'text') {
        scan(part.text)
      }
    }
    if (message.content) {
      scan(message.content)
    }
  }
  return found
}

/**
 * Owns Home's docked right-hand sidebar (never a modal drawer), its tabbed document/web/tool
 * workspace, active project/workspace lookup, and default-vs-browser link click routing.
 */
export function useHomePreviewPanels(options: UseHomePreviewPanelsOptions) {
  const { t } = useI18n()
  const router = useRouter()
  const transport = isElectronRenderer() ? useTuffTransport() : null
  const browserSdk = transport ? createBrowserSdk(transport) : null
  const appSdk = (() => {
    try {
      return typeof useAppSdk === 'function' ? useAppSdk() : null
    } catch {
      return null
    }
  })()

  const sidePanel = useHomeSidePanel(options.conversationId, {
    getAvailableWidth: options.getSidePanelAvailableWidth
  })

  const projectStore = useProjectStore()
  const currentProject = computed(() =>
    options.projectId.value
      ? (projectStore.projects.find((p) => p.id === options.projectId.value) ?? null)
      : null
  )

  const effectiveWorkspaceRoot = computed(
    () => options.workspaceRoot.value || currentProject.value?.rootPath
  )

  const mentionedAbsolutePaths = computed(() =>
    collectMentionedAbsolutePaths(options.messages.value)
  )

  function resolveRelativePathInConversation(candidatePath: string): string | null {
    const normalized = candidatePath.replace(/^\.[\\/]/, '').replace(/\\/g, '/')
    if (!normalized) return null
    const suffix = `/${normalized}`
    const match = mentionedAbsolutePaths.value.find((abs) => {
      const normalizedAbs = abs.replace(/\\/g, '/')
      return normalizedAbs.endsWith(suffix)
    })
    return match ?? null
  }

  function showCodePreview(preview: StreamMarkdownCodePreview): void {
    sidePanel.openCodeTab(preview)
  }

  function openFileInSidebar(payload: {
    absolutePath: string
    displayPath?: string
    line?: number
  }): void {
    sidePanel.openFileTab({
      path: payload.absolutePath,
      displayPath: payload.displayPath ?? payload.absolutePath,
      line: payload.line
    })
  }

  function openWebInSidebar(url: string, title?: string): void {
    sidePanel.openWebTab({ url, title })
  }

  async function openWebInBuiltInBrowser(url: string): Promise<void> {
    if (browserSdk && isBetaFeatureEnabled(appSetting, 'browserWorkspace')) {
      try {
        const spaceKey = projectSpaceKey(options.projectId.value)
        const conversationId = options.conversationId.value
        const created = await browserSdk.createTab(url)
        const createdTabId = created.createdTabId || created.activeTabId
        if (createdTabId) {
          attachBrowserTabToSpace(createdTabId, spaceKey, conversationId)
          setLastWorkspaceScope(spaceKey)
        }
        await router.push(APP_SURFACE_ROUTES.browser)
        return
      } catch {
        // fall through to external browser if built-in browser rejects
      }
    }
    if (appSdk) {
      await appSdk.openExternal(url).catch(() => {
        toast.error(t('home.preview.openFailed'))
      })
    }
  }

  async function openFileInBuiltInBrowser(payload: {
    absolutePath: string
    displayPath?: string
    line?: number
  }): Promise<void> {
    if (browserSdk && isBetaFeatureEnabled(appSetting, 'browserWorkspace')) {
      try {
        const spaceKey = projectSpaceKey(options.projectId.value)
        const conversationId = options.conversationId.value
        const previewUrl = buildBrowserFilePreviewUrl({
          path: payload.absolutePath,
          conversationId: conversationId ?? undefined,
          line: payload.line
        })
        const created = await browserSdk.createTab(previewUrl)
        const createdTabId = created.createdTabId || created.activeTabId
        if (createdTabId) {
          attachBrowserTabToSpace(createdTabId, spaceKey, conversationId)
          setLastWorkspaceScope(spaceKey)
        }
        await router.push(APP_SURFACE_ROUTES.browser)
        return
      } catch {
        // fall through to system default app
      }
    }
    await openFileExternal(payload.absolutePath)
  }

  async function openFileExternal(filePath: string): Promise<void> {
    if (!filePath) return
    try {
      if (transport) {
        await transport.send(AgentWorkspaceEvents.openFileExternal, {
          path: filePath,
          conversationId: options.conversationId.value ?? null
        })
        return
      }
      if (appSdk) {
        await appSdk.showInFolder(filePath, { reveal: true })
      }
    } catch {
      toast.error(t('home.preview.openFailed'))
    }
  }

  async function openWebExternal(url: string): Promise<void> {
    if (!appSdk) return
    await appSdk.openExternal(url).catch(() => {
      toast.error(t('home.preview.openFailed'))
    })
  }

  async function pickAndOpenFileInSidebar(): Promise<void> {
    if (!transport) {
      toast.error(t('home.preview.readFailed'))
      return
    }
    try {
      const result = await transport.send(AgentWorkspaceEvents.pickFile, {
        conversationId: options.conversationId.value ?? null,
        defaultPath: effectiveWorkspaceRoot.value
      })
      if (result?.path) {
        sidePanel.openFileTab({ path: result.path, displayPath: result.path })
      }
    } catch {
      toast.error(t('home.preview.openFailed'))
    }
  }

  function workspaceTabLabel(kind: SidePanelWorkspaceKind): string {
    switch (kind) {
      case 'git':
        return t('home.git.title')
      case 'review':
        return t('home.workspace.panel.review')
      case 'terminal':
        return t('terminal.title')
      case 'outputs':
        return t('home.preview.artifacts')
      case 'sources':
        return t('home.preview.sources')
      case 'work':
        return t('home.preview.toolCalls')
      case 'context':
        return t('home.workspace.panel.context')
      case 'plugins':
        return t('home.sidePanel.plugins')
    }
  }

  function openWorkspaceTool(kind: SidePanelWorkspaceKind): void {
    sidePanel.openWorkspaceTab(kind, workspaceTabLabel(kind))
  }

  useFileLinkClick({
    container: options.bodyRef,
    projectRoot: effectiveWorkspaceRoot,
    conversationId: options.conversationId,
    resolveRelativePath: resolveRelativePathInConversation,
    onOpenRight: openFileInSidebar,
    onOpenWebRight: (url) => openWebInSidebar(url),
    onOpenFileInBrowser: (payload) => {
      void openFileInBuiltInBrowser(payload)
    },
    onOpenWebInBrowser: (url) => {
      void openWebInBuiltInBrowser(url)
    },
    onOpenFileExternal: ({ absolutePath }) => {
      void openFileExternal(absolutePath)
    },
    onOpenWebExternal: (url) => {
      void openWebExternal(url)
    }
  })

  return {
    ...sidePanel,
    effectiveWorkspaceRoot,
    showCodePreview,
    openFileInSidebar,
    openWebInSidebar,
    openWebInBuiltInBrowser,
    openFileInBuiltInBrowser,
    openFileExternal,
    openWebExternal,
    pickAndOpenFileInSidebar,
    openWorkspaceTool,
    projectStore,
    currentProject
  }
}
