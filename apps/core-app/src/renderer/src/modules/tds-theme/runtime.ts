import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import {
  cloneThemePack,
  exportThemePackAsCss,
  getBuiltInThemePack,
  parsePluginThemePackManifest,
  TDS_DEFAULT_THEME_PACK,
  TDS_DEFAULT_THEME_PACK_ID,
  TDS_THEME_PACKS,
  validateTdsThemePack,
  type TdsThemePack,
  type TdsThemeValidationResult,
  type TdsThemeWindowPreference
} from '@talex-touch/utils/tds-theme'
import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue'

export { exportThemePackAsCss }

export const TDS_THEME_PACK_STYLE_ID = 'tds-theme-pack-style'
export const TDS_THEME_PACK_STORAGE_KEY = 'tuff.tds.themePack.v1'
export const TDS_THEME_PACK_ATTR = 'data-tds-theme-pack'
export const TDS_THEME_MOTION_ATTR = 'data-tds-motion-preset'
export const TDS_THEME_PATTERN_ATTR = 'data-tds-canvas-pattern'

const MAX_CUSTOM_THEME_PACKS = 24

interface PersistedTdsThemePackState {
  version: 1
  activePackId: string
  customPacks: TdsThemePack[]
}

export interface SelectTdsThemePackOptions {
  doc?: Document | null
  onWindowPreference?: (preference: TdsThemeWindowPreference) => void
}

export interface ImportTdsThemePackOptions {
  select?: boolean
  doc?: Document | null
  onWindowPreference?: (preference: TdsThemeWindowPreference) => void
}

function getSafeStorage(): Storage | null {
  try {
    if (hasWindow() && window.localStorage) {
      return window.localStorage
    }
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage
    ) {
      return globalThis.localStorage
    }
  } catch {
    return null
  }
  return null
}

function resolveDocument(doc?: Document | null): Document | null {
  if (doc !== undefined) {
    return doc
  }
  return hasDocument() ? document : null
}

/**
 * Removes the managed `<style id="tds-theme-pack-style">` tag and root attributes.
 */
export function clearTdsThemePack(doc?: Document | null): void {
  const targetDoc = resolveDocument(doc)
  if (!targetDoc) {
    return
  }

  const existing = targetDoc.getElementById(TDS_THEME_PACK_STYLE_ID)
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing)
  }

  const root = targetDoc.documentElement
  if (root) {
    root.removeAttribute(TDS_THEME_PACK_ATTR)
    root.removeAttribute(TDS_THEME_MOTION_ATTR)
    root.removeAttribute(TDS_THEME_PATTERN_ATTR)
  }
}

/**
 * Applies a validated TDS Theme Pack to the target document via a single managed
 * `<style id="tds-theme-pack-style">` tag.
 *
 * Selecting the built-in default `tds-apple-neutral` clears custom overrides cleanly,
 * leaving zero extra runtime CSS overhead.
 */
export function applyTdsThemePack(pack: TdsThemePack, doc?: Document | null): boolean {
  const targetDoc = resolveDocument(doc)
  if (!targetDoc) {
    return false
  }

  const validation = validateTdsThemePack(pack)
  if (!validation.valid || !validation.pack) {
    return false
  }

  const safePack = validation.pack
  if (safePack.meta.id === TDS_DEFAULT_THEME_PACK_ID) {
    clearTdsThemePack(targetDoc)
    return true
  }

  const css = exportThemePackAsCss(safePack)
  if (!css) {
    return false
  }

  const mountTarget = targetDoc.head ?? targetDoc.documentElement
  if (!mountTarget) {
    return false
  }

  let styleEl = targetDoc.getElementById(TDS_THEME_PACK_STYLE_ID)
  if (!styleEl) {
    styleEl = targetDoc.createElement('style')
    styleEl.id = TDS_THEME_PACK_STYLE_ID
    mountTarget.appendChild(styleEl)
  }

  styleEl.setAttribute(TDS_THEME_PACK_ATTR, safePack.meta.id)
  styleEl.textContent = css

  const root = targetDoc.documentElement
  if (root) {
    root.setAttribute(TDS_THEME_PACK_ATTR, safePack.meta.id)
    if (safePack.material?.motionPreset) {
      root.setAttribute(TDS_THEME_MOTION_ATTR, safePack.material.motionPreset)
    } else {
      root.removeAttribute(TDS_THEME_MOTION_ATTR)
    }
    if (safePack.surface?.canvasPattern) {
      root.setAttribute(TDS_THEME_PATTERN_ATTR, safePack.surface.canvasPattern)
    } else {
      root.removeAttribute(TDS_THEME_PATTERN_ATTR)
    }
  }

  return true
}

/**
 * Gently forwards a theme pack's preferred window material when explicitly enabled by the user.
 */
export function applyPackWindowPreference(
  pack: TdsThemePack,
  setter?: (preference: TdsThemeWindowPreference) => void
): boolean {
  const preference = pack.material?.windowPreference
  if (!preference || !setter) {
    return false
  }
  setter(preference)
  return true
}

function readPersistedState(): PersistedTdsThemePackState {
  const fallback: PersistedTdsThemePackState = {
    version: 1,
    activePackId: TDS_DEFAULT_THEME_PACK_ID,
    customPacks: []
  }

  const storage = getSafeStorage()
  if (!storage) {
    return fallback
  }

  try {
    const rawText = storage.getItem(TDS_THEME_PACK_STORAGE_KEY)
    if (!rawText) {
      return fallback
    }
    const parsed = JSON.parse(rawText) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallback
    }

    const record = parsed as Record<string, unknown>
    const validCustomPacks: TdsThemePack[] = []
    const seenIds = new Set<string>(TDS_THEME_PACKS.map((p) => p.meta.id))

    if (Array.isArray(record.customPacks)) {
      for (const candidate of record.customPacks) {
        if (validCustomPacks.length >= MAX_CUSTOM_THEME_PACKS) {
          break
        }
        const validation = validateTdsThemePack(candidate)
        if (!validation.valid || !validation.pack) {
          continue
        }
        if (seenIds.has(validation.pack.meta.id)) {
          continue
        }
        seenIds.add(validation.pack.meta.id)
        validCustomPacks.push({
          ...validation.pack,
          meta: {
            ...validation.pack.meta,
            builtIn: false
          }
        })
      }
    }

    const rawActiveId = typeof record.activePackId === 'string' ? record.activePackId.trim() : ''
    const hasActive =
      Boolean(getBuiltInThemePack(rawActiveId)) ||
      validCustomPacks.some((pack) => pack.meta.id === rawActiveId)

    return {
      version: 1,
      activePackId: hasActive ? rawActiveId : TDS_DEFAULT_THEME_PACK_ID,
      customPacks: validCustomPacks
    }
  } catch {
    return fallback
  }
}

function writePersistedState(state: PersistedTdsThemePackState): void {
  const storage = getSafeStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(TDS_THEME_PACK_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage quota / private-mode write failures cleanly.
  }
}

const initialState = readPersistedState()
const activePackIdRef = ref<string>(initialState.activePackId)
const customPacksRef = ref<TdsThemePack[]>(initialState.customPacks)

const allPacksComputed: ComputedRef<TdsThemePack[]> = computed(() => [
  ...TDS_THEME_PACKS,
  ...customPacksRef.value
])

const activePackComputed: ComputedRef<TdsThemePack> = computed(
  () =>
    allPacksComputed.value.find((pack) => pack.meta.id === activePackIdRef.value) ??
    TDS_DEFAULT_THEME_PACK
)

function persistCurrentState(): void {
  writePersistedState({
    version: 1,
    activePackId: activePackIdRef.value,
    customPacks: customPacksRef.value
  })
}

export function hydrateTdsThemePack(doc?: Document | null): TdsThemePack {
  const persisted = readPersistedState()
  customPacksRef.value = persisted.customPacks
  activePackIdRef.value = persisted.activePackId

  const active =
    allPacksComputed.value.find((pack) => pack.meta.id === persisted.activePackId) ??
    TDS_DEFAULT_THEME_PACK

  applyTdsThemePack(active, doc)
  return active
}

export interface UseTdsThemePackReturn {
  activePackId: Readonly<Ref<string>>
  activePack: ComputedRef<TdsThemePack>
  customPacks: Readonly<Ref<readonly TdsThemePack[]>>
  allPacks: ComputedRef<TdsThemePack[]>
  selectPack: (id: string, options?: SelectTdsThemePackOptions) => boolean
  importPackJson: (
    jsonText: string,
    options?: ImportTdsThemePackOptions
  ) => TdsThemeValidationResult
  exportPackJson: (id?: string) => string | null
  removeCustomPack: (id: string, doc?: Document | null) => boolean
  resetPack: (doc?: Document | null) => void
  hydratePack: (doc?: Document | null) => TdsThemePack
}

export function useTdsThemePack(): UseTdsThemePackReturn {
  function selectPack(id: string, options?: SelectTdsThemePackOptions): boolean {
    const target = allPacksComputed.value.find((pack) => pack.meta.id === id)
    if (!target) {
      return false
    }

    activePackIdRef.value = target.meta.id
    persistCurrentState()
    applyTdsThemePack(target, options?.doc)

    if (options?.onWindowPreference) {
      applyPackWindowPreference(target, options.onWindowPreference)
    }

    return true
  }

  function importPackJson(
    jsonText: string,
    options?: ImportTdsThemePackOptions
  ): TdsThemeValidationResult {
    const parsed = parsePluginThemePackManifest(jsonText)
    if (!parsed.valid || !parsed.pack) {
      return {
        valid: false,
        errors: parsed.errors,
        contrastReport: parsed.contrastReport
      }
    }

    const storedPack: TdsThemePack = {
      ...cloneThemePack(parsed.pack),
      meta: {
        ...parsed.pack.meta,
        builtIn: false
      }
    }

    const existingIndex = customPacksRef.value.findIndex(
      (item) => item.meta.id === storedPack.meta.id
    )
    if (existingIndex >= 0) {
      const nextCustom = [...customPacksRef.value]
      nextCustom[existingIndex] = storedPack
      customPacksRef.value = nextCustom
    } else {
      const nextCustom = [...customPacksRef.value, storedPack]
      const protectedId = options?.select !== false ? storedPack.meta.id : activePackIdRef.value
      while (nextCustom.length > MAX_CUSTOM_THEME_PACKS) {
        const evictIndex = nextCustom.findIndex(
          (item) => item.meta.id !== protectedId && item.meta.id !== storedPack.meta.id
        )
        if (evictIndex >= 0) {
          nextCustom.splice(evictIndex, 1)
          continue
        }
        nextCustom.shift()
      }
      customPacksRef.value = nextCustom
    }

    const shouldApply = options?.select !== false || activePackIdRef.value === storedPack.meta.id
    if (options?.select !== false) {
      activePackIdRef.value = storedPack.meta.id
    }
    if (shouldApply) {
      applyTdsThemePack(storedPack, options?.doc)
      if (options?.onWindowPreference) {
        applyPackWindowPreference(storedPack, options.onWindowPreference)
      }
    }

    persistCurrentState()

    return {
      valid: true,
      errors: [],
      contrastReport: parsed.contrastReport,
      pack: storedPack
    }
  }

  function exportPackJson(id?: string): string | null {
    const targetId = id ?? activePackIdRef.value
    const target = allPacksComputed.value.find((pack) => pack.meta.id === targetId)
    if (!target) {
      return null
    }
    return JSON.stringify(cloneThemePack(target), null, 2)
  }

  function removeCustomPack(id: string, doc?: Document | null): boolean {
    if (getBuiltInThemePack(id)) {
      return false
    }

    const exists = customPacksRef.value.some((pack) => pack.meta.id === id)
    if (!exists) {
      return false
    }

    customPacksRef.value = customPacksRef.value.filter((pack) => pack.meta.id !== id)

    if (activePackIdRef.value === id) {
      activePackIdRef.value = TDS_DEFAULT_THEME_PACK_ID
      clearTdsThemePack(doc)
    }

    persistCurrentState()
    return true
  }

  function resetPack(doc?: Document | null): void {
    activePackIdRef.value = TDS_DEFAULT_THEME_PACK_ID
    persistCurrentState()
    clearTdsThemePack(doc)
  }

  return {
    activePackId: readonly(activePackIdRef),
    activePack: activePackComputed,
    customPacks: readonly(customPacksRef),
    allPacks: allPacksComputed,
    selectPack,
    importPackJson,
    exportPackJson,
    removeCustomPack,
    resetPack,
    hydratePack: hydrateTdsThemePack
  }
}
