import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed } from 'vue'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'

export type RendererPlatform = 'darwin' | 'win32' | 'linux' | 'unknown'

export interface RendererPlatformState {
  platform: RendererPlatform
  isMac: boolean
  isWindows: boolean
  isLinux: boolean
}

export interface RendererPlatformInput {
  startupPlatform?: string | null
  electronPlatform?: string | null
  navigatorPlatform?: string | null
  userAgent?: string | null
}

function normalizeRuntimePlatform(value: string | null | undefined): RendererPlatform | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!normalized) return null
  if (normalized === 'darwin' || normalized === 'mac' || normalized === 'macos') return 'darwin'
  if (normalized === 'win32' || normalized === 'windows' || normalized === 'win') return 'win32'
  if (normalized === 'linux') return 'linux'
  return null
}

function inferBrowserPlatform(
  navigatorPlatform: string | null | undefined,
  userAgent: string | null | undefined
): RendererPlatform | null {
  const platformText = typeof navigatorPlatform === 'string' ? navigatorPlatform.toLowerCase() : ''
  const agentText = typeof userAgent === 'string' ? userAgent.toLowerCase() : ''
  const combined = `${platformText} ${agentText}`.trim()
  if (!combined) return null

  if (
    combined.includes('mac') ||
    combined.includes('iphone') ||
    combined.includes('ipad') ||
    combined.includes('ipod')
  ) {
    return 'darwin'
  }
  if (combined.includes('win')) {
    return 'win32'
  }
  if (combined.includes('linux') || combined.includes('x11')) {
    return 'linux'
  }
  return null
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
  const platform =
    normalizeRuntimePlatform(input.startupPlatform) ||
    normalizeRuntimePlatform(input.electronPlatform) ||
    inferBrowserPlatform(input.navigatorPlatform, input.userAgent) ||
    'unknown'

  return toPlatformState(platform)
}

export function getCurrentRendererPlatformState(): RendererPlatformState {
  return resolveRendererPlatformState({
    startupPlatform: null,
    electronPlatform:
      hasWindow() && window.electron?.process?.platform
        ? window.electron.process.platform
        : typeof process !== 'undefined'
          ? process.platform
          : null,
    navigatorPlatform: hasNavigator() ? navigator.platform : null,
    userAgent: hasNavigator() ? navigator.userAgent : null
  })
}

export function useRendererPlatform() {
  const { startupInfo } = useStartupInfo()

  const state = computed(() =>
    resolveRendererPlatformState({
      startupPlatform: startupInfo.value?.platform ?? null,
      electronPlatform: getCurrentRendererPlatformState().platform,
      navigatorPlatform: hasNavigator() ? navigator.platform : null,
      userAgent: hasNavigator() ? navigator.userAgent : null
    })
  )

  return {
    platform: computed(() => state.value.platform),
    isMac: computed(() => state.value.isMac),
    isWindows: computed(() => state.value.isWindows),
    isLinux: computed(() => state.value.isLinux)
  }
}
