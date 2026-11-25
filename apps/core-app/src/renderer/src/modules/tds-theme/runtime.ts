import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue'
import {
  getBuiltInThemePack,
  TDS_DEFAULT_THEME_PACK,
  TDS_DEFAULT_THEME_PACK_ID,
  TDS_THEME_PACKS
} from './presets'
import {
  TDS_THEME_TOKEN_CSS_VAR_MAP,
  TDS_THEME_TOKEN_KEYS,
  type TdsThemePack,
  type TdsThemeTokenOverrides,
  type TdsThemeValidationResult,
  type TdsThemeWindowPreference
} from './types'
import { createEmptyContrastReport, validateTdsThemePack } from './validator'

export const TDS_THEME_PACK_STYLE_ID = 'tds-theme-pack-style'
export const TDS_THEME_PACK_STORAGE_KEY = 'tuff.tds.themePack.v1'
export const TDS_THEME_PACK_ATTR = 'data-tds-theme-pack'
export const TDS_THEME_MOTION_ATTR = 'data-tds-motion-preset'
export const TDS_THEME_PATTERN_ATTR = 'data-tds-canvas-pattern'

const MAX_CUSTOM_THEME_PACKS = 24
const SIX_DIGIT_HEX_PATTERN = /^#[0-9a-f]{6}$/i

const SEMANTIC_DERIVED_KEYS = ['success', 'warning', 'danger', 'info'] as const

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

function cloneThemePack(pack: TdsThemePack): TdsThemePack {
  return {
    schemaVersion: pack.schemaVersion,
    meta: { ...pack.meta },
    tokens: {
      light: { ...pack.tokens.light },
      dark: { ...pack.tokens.dark }
    },
    ...(pack.material ? { material: { ...pack.material } } : {}),
    ...(pack.surface ? { surface: { ...pack.surface } } : {})
  }
}

function buildTokenDeclarations(
  overrides: TdsThemeTokenOverrides,
  mode: 'light' | 'dark'
): string[] {
  const lines: string[] = []
  const softAlpha = mode === 'light' ? '14' : '26'
  const borderAlpha = mode === 'light' ? '3d' : '4d'

  for (const key of TDS_THEME_TOKEN_KEYS) {
    const value = overrides[key]
    if (!value) continue
    const cssVar = TDS_THEME_TOKEN_CSS_VAR_MAP[key]
    lines.push(`  ${cssVar}: ${value};`)
  }

  for (const semanticKey of SEMANTIC_DERIVED_KEYS) {
    const baseHex = overrides[semanticKey]
    if (baseHex && SIX_DIGIT_HEX_PATTERN.test(baseHex)) {
      lines.push(`  --shell-${semanticKey}-soft: ${baseHex}${softAlpha};`)
      lines.push(`  --shell-${semanticKey}-border: ${baseHex}${borderAlpha};`)
    }
  }

  return lines
}

/**
 * Exports a validated TDS Theme Pack into a safe, deterministic CSS block.
 *
 * Uses `:root:not(.contrast)` and `.dark:not(.contrast)` so accessibility
 * high-contrast modes (`html.contrast` and `html.dark.contrast`) always win.
 */
export function exportThemePackAsCss(pack: TdsThemePack): string {
  const validation = validateTdsThemePack(pack)
  if (!validation.valid || !validation.pack) {
    return ''
  }

  const safePack = validation.pack
  const effectiveDark: TdsThemeTokenOverrides = { ...safePack.tokens.dark }
  for (const key of TDS_THEME_TOKEN_KEYS) {
    if (safePack.tokens.light[key] && !effectiveDark[key]) {
      const darkFallback = TDS_DEFAULT_THEME_PACK.tokens.dark[key]
      if (darkFallback) {
        effectiveDark[key] = darkFallback
      }
    }
  }

  const lightLines = buildTokenDeclarations(safePack.tokens.light, 'light')
  const darkLines = buildTokenDeclarations(effectiveDark, 'dark')

  if (typeof safePack.surface?.accentTintOpacity === 'number') {
    lightLines.push(`  --tds-accent-tint-opacity: ${safePack.surface.accentTintOpacity};`)
  }

  const blocks: string[] = [`/* TDS Theme Pack: ${safePack.meta.id} */`]

  if (lightLines.length > 0) {
    blocks.push(`:root:not(.contrast) {\n${lightLines.join('\n')}\n}`)
  }

  if (darkLines.length > 0) {
    blocks.push(`.dark:not(.contrast) {\n${darkLines.join('\n')}\n}`)
  }

  return blocks.join('\n\n')
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
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unexpected token'
      return {
        valid: false,
        errors: [`Invalid JSON syntax: ${reason}`],
        contrastReport: createEmptyContrastReport()
      }
    }

    const validation = validateTdsThemePack(parsed)
    if (!validation.valid || !validation.pack) {
      return validation
    }

    if (getBuiltInThemePack(validation.pack.meta.id)) {
      return {
        valid: false,
        errors: [
          `Cannot overwrite built-in theme pack "${validation.pack.meta.id}". Choose a unique meta.id.`
        ],
        contrastReport: validation.contrastReport
      }
    }

    const storedPack: TdsThemePack = {
      ...cloneThemePack(validation.pack),
      meta: {
        ...validation.pack.meta,
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
      customPacksRef.value = [...customPacksRef.value, storedPack].slice(-MAX_CUSTOM_THEME_PACKS)
    }

    if (options?.select !== false) {
      activePackIdRef.value = storedPack.meta.id
      applyTdsThemePack(storedPack, options?.doc)
      if (options?.onWindowPreference) {
        applyPackWindowPreference(storedPack, options.onWindowPreference)
      }
    }

    persistCurrentState()

    return {
      valid: true,
      errors: [],
      contrastReport: validation.contrastReport,
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
