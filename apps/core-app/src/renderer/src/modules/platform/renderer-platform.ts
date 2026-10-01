import type { RuntimePlatform, RuntimePlatformInput } from '@talex-touch/utils/env'
import { hasNavigator, resolveRuntimePlatform } from '@talex-touch/utils/env'
import { computed } from 'vue'
import { useStartupInfo } from '../hooks/useStartupInfo'
import { getPreloadProcessInfo } from '../preload/process-info'

export type RendererPlatform = RuntimePlatform

export interface RendererPlatformState {
  platform: RendererPlatform
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

export type RendererBrowserEngine = 'chromium' | 'firefox' | 'webkit' | 'unknown'

export type RendererPlatformInput = RuntimePlatformInput

export interface RendererRuntimePlatformHints {
  electronPlatform: string | null
  navigatorPlatform: string | null
  userAgent: string | null
}

export function getCurrentRendererUserAgent(): string | null {
  return hasNavigator() ? navigator.userAgent : null
}

export function getRendererBrowserEngine(
  userAgent: string | null | undefined = getCurrentRendererUserAgent()
): RendererBrowserEngine {
  const agentText = typeof userAgent === 'string' ? userAgent.toLowerCase() : ''
  if (!agentText) {
    return 'unknown'
  }
  if (agentText.includes('firefox')) {
    return 'firefox'
  }
  if (
    agentText.includes('safari') &&
    !agentText.includes('chrome') &&
    !agentText.includes('chromium')
  ) {
    return 'webkit'
  }
  if (
    agentText.includes('chrome') ||
    agentText.includes('chromium') ||
    agentText.includes('electron') ||
    agentText.includes('edg/')
  ) {
    return 'chromium'
  }
  return 'unknown'
}

function toPlatformState(platform: RendererPlatform): RendererPlatformState {
  return {
    platform,
    isMac: platform === 'darwin',
    isWindows: platform === 'win32',
    isLinux: platform === 'linux'
  }
}

export function resolveRendererPlatformState(
  input: RendererPlatformInput = {}
): RendererPlatformState {
  return toPlatformState(resolveRuntimePlatform(input))
}

export function getCurrentRendererPlatformHints(): RendererRuntimePlatformHints {
  const processInfo = getPreloadProcessInfo()
  return {
    electronPlatform: processInfo?.platform ?? null,
    navigatorPlatform: hasNavigator() ? navigator.platform : null,
    userAgent: getCurrentRendererUserAgent()
  }
}

export function getCurrentRendererPlatformState(): RendererPlatformState {
  return resolveRendererPlatformState(getCurrentRendererPlatformHints())
}

export function useRendererPlatform() {
  const { startupInfo } = useStartupInfo()

  const state = computed(() =>
    resolveRendererPlatformState({
      startupPlatform: startupInfo.value?.platform ?? null,
      ...getCurrentRendererPlatformHints()
    })
  )

  return {
    platform: computed(() => state.value.platform),
    isMac: computed(() => state.value.isMac),
    isWindows: computed(() => state.value.isWindows),
    isLinux: computed(() => state.value.isLinux)
  }
}
